import os
from typing import Optional
import httpx
import redis
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.database import get_db, engine, Base, SessionLocal
from app.models import Policy, RequestLog, User
from app.schemas import (
    PolicyCreate, PolicyOut, LoginRequest, OrderRequest, TrackEvent,
    SignupRequest, LoginCredentials, UserOut, TokenResponse, CreateUserByOwner,
)
from app import bucket, metrics, auth

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = FastAPI(title="API Rate Limit Control Plane")
redis_conn = redis.Redis.from_url(REDIS_URL, decode_responses=True)


def hash_ip(ip: str) -> str:
    import hashlib
    return hashlib.sha256(ip.encode()).hexdigest()


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def find_policy_for_request(db: Session, path: str, method: str):
    policies = db.query(Policy).filter(Policy.enabled == True).all()  # noqa: E712
    exact_match = None
    wildcard_match = None
    for p in policies:
        if p.method != "*" and p.method != method:
            continue
        if p.endpoint == path:
            exact_match = p
            break
        if p.endpoint.endswith("*") and path.startswith(p.endpoint[:-1]):
            wildcard_match = p
    return exact_match or wildcard_match


SKIP_PATHS = ("/auth", "/policies", "/metrics", "/health", "/docs", "/openapi.json", "/track")


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith(SKIP_PATHS):
        return await call_next(request)

    db = SessionLocal()
    try:
        policy = find_policy_for_request(db, path, request.method)
        if policy is None:
            return await call_next(request)

        client_hash = hash_ip(get_client_ip(request))
        allowed = bucket.is_allowed(
            redis_conn, policy.id, client_hash,
            policy.capacity, policy.refill_tokens, policy.refill_seconds,
        )

        if not allowed:
            db.add(RequestLog(endpoint=path, client_hash=client_hash, status="rejected", source="proxy"))
            db.commit()
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down.", "policy": policy.name},
            )

        if policy.forward_url:
            response = await forward_request(request, policy.forward_url)
        else:
            response = await call_next(request)

        db.add(RequestLog(endpoint=path, client_hash=client_hash, status="allowed", source="proxy"))
        db.commit()
        return response
    finally:
        db.close()


async def forward_request(request: Request, target_url: str) -> Response:
    url = target_url.rstrip("/") + request.url.path
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            upstream = await client.request(
                request.method, url, content=body,
                headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
            )
    except httpx.RequestError:
        return JSONResponse(status_code=502, content={"detail": "Upstream server did not respond"})

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


def normalize_email(email: str) -> str:
    return email.strip().lower()


@app.post("/auth/signup", response_model=TokenResponse)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    is_first_account = db.query(User).count() == 0
    user = User(
        email=email,
        password_hash=auth.hash_password(data.password),
        role="owner" if is_first_account else "viewer",
        is_primary=is_first_account,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token(user.id, user.email, user.role)
    return {"access_token": token, "user": user}


@app.post("/auth/login", response_model=TokenResponse)
def login(data: LoginCredentials, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    user = db.query(User).filter(User.email == email).first()
    if not user or not auth.verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = auth.create_access_token(user.id, user.email, user.role)
    return {"access_token": token, "user": user}


@app.get("/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(auth.get_current_user)):
    return current_user


@app.get("/auth/users", response_model=list[UserOut])
def list_users(current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.asc()).all()


@app.post("/auth/users", response_model=UserOut)
def create_user(
    data: CreateUserByOwner,
    current_user: User = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    email = normalize_email(data.email)
    if data.role not in ("owner", "viewer"):
        raise HTTPException(status_code=400, detail="Role must be 'owner' or 'viewer'")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(email=email, password_hash=auth.hash_password(data.password), role=data.role, is_primary=False)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/auth/users/{user_id}")
def delete_user(user_id: int, current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't remove your own account")
    row = db.query(User).filter(User.id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if row.is_primary:
        raise HTTPException(status_code=400, detail="The primary owner account can't be removed by anyone")
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@app.post("/policies", response_model=PolicyOut)
def create_policy(policy: PolicyCreate, current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    row = Policy(**policy.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/policies", response_model=list[PolicyOut])
def list_policies(current_user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(Policy).order_by(Policy.created_at.desc()).all()


@app.patch("/policies/{policy_id}/status", response_model=PolicyOut)
def update_policy_status(
    policy_id: int,
    enabled: bool,
    current_user: User = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = db.query(Policy).filter(Policy.id == policy_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    row.enabled = enabled
    db.commit()
    db.refresh(row)
    return row


@app.delete("/policies/{policy_id}")
def delete_policy(policy_id: int, current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    db.query(Policy).filter(Policy.id == policy_id).delete()
    db.commit()
    return {"status": "deleted"}


@app.get("/demo/books")
def demo_books():
    return {"books": [
        {"id": 1, "title": "Clean Code"},
        {"id": 2, "title": "The Pragmatic Programmer"},
        {"id": 3, "title": "Designing Data-Intensive Applications"},
    ]}


@app.post("/demo/login")
def demo_login(data: LoginRequest):
    if data.username == "demo" and data.password == "demo123":
        return {"status": "success"}
    return {"status": "failed"}


@app.post("/demo/orders")
def demo_orders(data: OrderRequest):
    return {"status": "order_placed", "book_id": data.book_id, "quantity": data.quantity}


@app.post("/track")
def track_event(event: TrackEvent, request: Request, db: Session = Depends(get_db)):
    client_hash = hash_ip(get_client_ip(request))
    db.add(RequestLog(endpoint=event.endpoint, client_hash=client_hash, status="tracked", source="gtag"))
    db.commit()
    return {"status": "received"}


@app.get("/metrics/summary")
def metrics_summary(minutes: int = 60, current_user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return metrics.get_summary(db, minutes)


@app.get("/metrics/endpoints")
def metrics_endpoints(minutes: int = 60, current_user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return metrics.get_endpoint_counts(db, minutes)


@app.get("/metrics/timeline")
def metrics_timeline(
    minutes: int = 30,
    endpoint: Optional[str] = None,
    current_user: User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    bucket_seconds = 30 if minutes <= 15 else (60 if minutes <= 60 else 900)
    return metrics.get_timeline(db, minutes, bucket_seconds, endpoint)