import os
import secrets
from typing import Optional
import httpx
import redis
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db, engine, Base, SessionLocal
from app.models import Policy, RequestLog, User, Company
from app.schemas import (
    PolicyCreate, PolicyUpdate, PolicyOut, LoginRequest, OrderRequest, TrackEvent,
    SignupRequest, LoginCredentials, UserOut, TokenResponse, CreateUserByOwner,
    RequestLogOut,
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


def record_request(
    db: Session,
    request: Request,
    status: str,
    source: str,
    company_id: Optional[int],
    policy_name: Optional[str] = None,
    endpoint: Optional[str] = None,
    method: Optional[str] = None,
    client_hash: Optional[str] = None,
) -> None:
    db.add(
        RequestLog(
            endpoint=endpoint if endpoint is not None else request.url.path,
            method=method if method is not None else request.method,
            client_hash=client_hash if client_hash is not None else hash_ip(get_client_ip(request)),
            status=status,
            source=source,
            company_id=company_id,
            policy_name=policy_name,
        )
    )


def user_to_out(user: User) -> UserOut:
    company = user.company
    return UserOut(
        id=user.id,
        email=user.email,
        role=user.role,
        is_primary=user.is_primary,
        company_id=user.company_id,
        company_name=company.name if company else None,
        company_api_key=company.api_key if company and user.role == "owner" else None,
        company_target_url=company.target_url if company else None,
        created_at=user.created_at,
    )


def find_policy_for_request(db: Session, path: str, method: str, company_id: Optional[int] = None):
    query = db.query(Policy).filter(Policy.enabled == True)  # noqa: E712
    if company_id is not None:
        query = query.filter(Policy.company_id == company_id)
    policies = query.all()

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


SKIP_PATHS = (
    "/auth",
    "/policies",
    "/metrics",
    "/health",
    "/docs",
    "/openapi.json",
    "/track",
    "/simulator/policies",
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith(SKIP_PATHS):
        return await call_next(request)

    db = SessionLocal()
    try:
        api_key = request.headers.get("x-company-key") or request.headers.get("x-api-key") or request.query_params.get("api_key")
        company = None
        if api_key:
            company = db.query(Company).filter(Company.api_key == api_key).first()
            if not company:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid company API key"},
                )
        elif path.startswith("/demo/"):
            return JSONResponse(
                status_code=401,
                content={"detail": "A valid X-Company-Key header is required"},
            )
        if not company:
            company = db.query(Company).first()
        company_id = company.id if company else None

        if path == "/demo/login" and request.method != "POST":
            return JSONResponse(
                status_code=405,
                content={"detail": "The /demo/login endpoint only supports POST"},
                headers={"Allow": "POST"},
            )

        policy = find_policy_for_request(db, path, request.method, company_id=company_id)
        if policy is None:
            response = await call_next(request)
            record_request(db, request, "allowed", "proxy", company_id)
            db.commit()
            return response

        request.state.rate_limit_policy = policy
        client_hash = hash_ip(get_client_ip(request))
        allowed = bucket.is_allowed(
            redis_conn, policy.id, client_hash,
            policy.capacity, policy.refill_tokens, policy.refill_seconds,
            company_id=company_id,
        )

        if not allowed:
            record_request(
                db, request, "rejected", "proxy", company_id,
                policy_name=policy.name, client_hash=client_hash,
            )
            db.commit()
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down.", "policy": policy.name},
                headers={
                    "X-RateLimit-Limit": str(policy.capacity),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": str(policy.refill_seconds),
                },
            )

        if policy.forward_url:
            response = await forward_request(request, policy.forward_url)
        elif company and company.target_url and not path.startswith("/demo"):
            response = await forward_request(request, company.target_url)
        else:
            response = await call_next(request)

        record_request(
            db, request, "allowed", "proxy", company_id,
            policy_name=policy.name, client_hash=client_hash,
        )
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
    db = SessionLocal()
    try:
        # Schema migration helper for existing Postgres / SQLite tables
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER"))
            db.execute(text("ALTER TABLE policies ADD COLUMN IF NOT EXISTS company_id INTEGER"))
            db.execute(text("ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS company_id INTEGER"))
            db.execute(text("ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS method VARCHAR DEFAULT 'GET'"))
            db.execute(text("ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS policy_name VARCHAR"))
            db.commit()
        except Exception:
            db.rollback()

        # Seed initial default company if none exists
        default_company = db.query(Company).first()
        if not default_company:
            default_company = Company(
                name="Demo Company",
                target_url=None,
                api_key="cmp_demo_key_1234567890",
            )
            db.add(default_company)
            db.commit()
            db.refresh(default_company)

        # Attach orphaned users and policies to default company
        db.query(User).filter(User.company_id.is_(None)).update({"company_id": default_company.id})
        db.query(Policy).filter(Policy.company_id.is_(None)).update({"company_id": default_company.id})
        db.query(RequestLog).filter(RequestLog.company_id.is_(None)).update({"company_id": default_company.id})
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}


def normalize_email(email: str) -> str:
    return email.strip().lower()


@app.post("/auth/signup", response_model=TokenResponse)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    company_name = data.company_name.strip()

    if not company_name:
        raise HTTPException(status_code=400, detail="Company name is required")

    existing_company = db.query(Company).filter(Company.name == company_name).first()
    if existing_company:
        raise HTTPException(status_code=400, detail="A company with this name already exists")

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Create the Company for this SaaS tenant
    target_url = data.target_url.strip() if data.target_url else None
    company = Company(
        name=company_name,
        target_url=target_url,
        api_key=f"cmp_{secrets.token_hex(16)}",
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    # The user who signs up the company is always the company's owner
    user = User(
        email=email,
        password_hash=auth.hash_password(data.password),
        role="owner",
        is_primary=True,
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token(user.id, user.email, user.role, company_id=company.id)
    return {"access_token": token, "user": user_to_out(user)}


@app.post("/auth/login", response_model=TokenResponse)
def login(data: LoginCredentials, request: Request, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    user = db.query(User).filter(User.email == email).first()
    if not user or not auth.verify_password(data.password, user.password_hash):
        record_request(db, request, "rejected", "auth", user.company_id if user else None)
        db.commit()
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    record_request(db, request, "allowed", "auth", user.company_id)
    db.commit()
    token = auth.create_access_token(user.id, user.email, user.role, company_id=user.company_id)
    return {"access_token": token, "user": user_to_out(user)}


@app.post("/auth/logout")
def logout(
    request: Request,
    current_user: User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    record_request(db, request, "allowed", "auth", current_user.company_id)
    db.commit()
    return {"status": "logged_out"}


@app.get("/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(auth.get_current_user)):
    return user_to_out(current_user)


@app.get("/auth/users", response_model=list[UserOut])
def list_users(current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    users = (
        db.query(User)
        .filter(User.company_id == current_user.company_id)
        .order_by(User.created_at.asc())
        .all()
    )
    return [user_to_out(u) for u in users]


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

    user = User(
        email=email,
        password_hash=auth.hash_password(data.password),
        role=data.role,
        is_primary=False,
        company_id=current_user.company_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@app.delete("/auth/users/{user_id}")
def delete_user(user_id: int, current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't remove your own account")
    row = db.query(User).filter(User.id == user_id, User.company_id == current_user.company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found in your company")
    if row.is_primary:
        raise HTTPException(status_code=400, detail="The primary company owner account cannot be removed")
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@app.post("/policies", response_model=PolicyOut)
def create_policy(policy: PolicyCreate, current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    if policy.endpoint.rstrip("/") == "/demo/login" and policy.method != "POST":
        raise HTTPException(status_code=400, detail="The /demo/login endpoint only supports POST")

    # Duplicate prevention: Check if same endpoint + method already exists in this company
    existing = db.query(Policy).filter(
        Policy.company_id == current_user.company_id,
        Policy.endpoint == policy.endpoint,
        Policy.method == policy.method,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A policy for endpoint '{policy.endpoint}' with method '{policy.method}' already exists for your company.",
        )

    row = Policy(**policy.model_dump(), company_id=current_user.company_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@app.get("/policies", response_model=list[PolicyOut])
def list_policies(current_user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Policy)
        .filter(Policy.company_id == current_user.company_id)
        .order_by(Policy.created_at.desc())
        .all()
    )


@app.put("/policies/{policy_id}", response_model=PolicyOut)
@app.patch("/policies/{policy_id}", response_model=PolicyOut)
def update_policy(
    policy_id: int,
    policy_data: PolicyUpdate,
    current_user: User = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = db.query(Policy).filter(Policy.id == policy_id, Policy.company_id == current_user.company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    if row.endpoint.rstrip("/") == "/demo/login" and policy_data.method != "POST":
        raise HTTPException(status_code=400, detail="The /demo/login endpoint only supports POST")

    # Update attributes while preserving the immutable endpoint path
    row.name = policy_data.name
    row.method = policy_data.method
    row.capacity = policy_data.capacity
    row.refill_tokens = policy_data.refill_tokens
    row.refill_seconds = policy_data.refill_seconds
    row.forward_url = policy_data.forward_url
    row.enabled = policy_data.enabled

    db.commit()
    db.refresh(row)
    return row


@app.patch("/policies/{policy_id}/status", response_model=PolicyOut)
def update_policy_status(
    policy_id: int,
    enabled: bool,
    current_user: User = Depends(auth.require_owner),
    db: Session = Depends(get_db),
):
    row = db.query(Policy).filter(Policy.id == policy_id, Policy.company_id == current_user.company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    row.enabled = enabled
    db.commit()
    db.refresh(row)
    return row


@app.delete("/policies/{policy_id}")
def delete_policy(policy_id: int, current_user: User = Depends(auth.require_owner), db: Session = Depends(get_db)):
    row = db.query(Policy).filter(Policy.id == policy_id, Policy.company_id == current_user.company_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(row)
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
    api_key = request.headers.get("x-company-key") or request.headers.get("x-api-key") or request.query_params.get("api_key")
    company = None
    if api_key:
        company = db.query(Company).filter(Company.api_key == api_key).first()
    if not company:
        company = db.query(Company).first()

    record_request(
        db,
        request,
        "tracked",
        "gtag",
        company.id if company else None,
        endpoint=event.endpoint,
        method="POST",
    )
    db.commit()
    return {"status": "received"}


@app.get("/metrics/summary")
def metrics_summary(minutes: int = 60, current_user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return metrics.get_summary(db, minutes, company_id=current_user.company_id)


@app.get("/metrics/endpoints")
def metrics_endpoints(minutes: int = 60, current_user: User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return metrics.get_endpoint_counts(db, minutes, company_id=current_user.company_id)


@app.get("/metrics/timeline")
def metrics_timeline(
    minutes: int = 30,
    endpoint: Optional[str] = None,
    current_user: User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    bucket_seconds = 30 if minutes <= 15 else (60 if minutes <= 60 else 900)
    return metrics.get_timeline(db, minutes, bucket_seconds, endpoint, company_id=current_user.company_id)


@app.get("/metrics/recent", response_model=list[RequestLogOut])
def metrics_recent(
    limit: int = 30,
    current_user: User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return metrics.get_recent_logs(db, limit=limit, company_id=current_user.company_id)


@app.get("/simulator/policies", response_model=list[PolicyOut])
def simulator_policies(request: Request, db: Session = Depends(get_db)):
    api_key = request.headers.get("x-company-key") or request.headers.get("x-api-key")
    if not api_key:
        raise HTTPException(status_code=401, detail="A valid company API key is required")

    company = db.query(Company).filter(Company.api_key == api_key).first()
    if not company:
        raise HTTPException(status_code=401, detail="Invalid company API key")

    return (
        db.query(Policy)
        .filter(Policy.company_id == company.id, Policy.enabled == True)  # noqa: E712
        .order_by(Policy.created_at.desc())
        .all()
    )


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)
async def configured_endpoint_fallback(path: str, request: Request):
    if not getattr(request.state, "rate_limit_policy", None):
        raise HTTPException(status_code=404, detail="Not Found")
    return {
        "status": "success",
        "endpoint": f"/{path}",
        "method": request.method,
    }