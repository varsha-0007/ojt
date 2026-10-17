from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import RequestLog


def get_summary(db: Session, minutes: int = 60, company_id: Optional[int] = None):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    query = db.query(RequestLog.status, func.count()).filter(RequestLog.created_at >= since)
    if company_id is not None:
        query = query.filter(RequestLog.company_id == company_id)
    rows = query.group_by(RequestLog.status).all()
    counts = {"allowed": 0, "rejected": 0, "tracked": 0}
    for status, count in rows:
        counts[status] = count
    total = counts["allowed"] + counts["rejected"] + counts["tracked"]
    return {"total": total, **counts}


def get_endpoint_counts(db: Session, minutes: int = 60, company_id: Optional[int] = None):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    query = db.query(RequestLog.endpoint, func.count().label("total")).filter(
        RequestLog.created_at >= since
    )
    if company_id is not None:
        query = query.filter(RequestLog.company_id == company_id)
    rows = query.group_by(RequestLog.endpoint).order_by(func.count().desc()).all()
    return [{"endpoint": endpoint, "total": total} for endpoint, total in rows]


def get_timeline(
    db: Session,
    minutes: int = 30,
    bucket_seconds: int = 60,
    endpoint: Optional[str] = None,
    company_id: Optional[int] = None,
):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    query = (
        db.query(
            RequestLog.created_at,
            RequestLog.status,
            RequestLog.method,
            RequestLog.endpoint,
        )
        .filter(
            RequestLog.created_at >= since,
            RequestLog.status.in_(("allowed", "rejected")),
        )
    )
    if endpoint:
        query = query.filter(RequestLog.endpoint == endpoint)
    if company_id is not None:
        query = query.filter(RequestLog.company_id == company_id)
    rows = query.order_by(RequestLog.created_at.asc()).all()

    now = datetime.now(timezone.utc).timestamp()
    window_start = now - (minutes * 60)
    bucket_count = int((minutes * 60) / bucket_seconds)

    buckets = [
        {
            "time": window_start + (i * bucket_seconds),
            "total": 0,
            "allowed": 0,
            "rejected": 0,
            "endpoints": {},
        }
        for i in range(bucket_count)
    ]

    for created_at, status, method, endpoint_name in rows:
        row_time = created_at.timestamp()
        index = int((row_time - window_start) / bucket_seconds)
        if 0 <= index < len(buckets):
            bucket = buckets[index]
            bucket["total"] += 1
            bucket["allowed" if status == "allowed" else "rejected"] += 1
            endpoint_key = (method, endpoint_name)
            endpoint_counts = bucket["endpoints"].setdefault(
                endpoint_key,
                {
                    "method": method,
                    "endpoint": endpoint_name,
                    "total": 0,
                    "allowed": 0,
                    "rejected": 0,
                },
            )
            endpoint_counts["total"] += 1
            endpoint_counts["allowed" if status == "allowed" else "rejected"] += 1

    for bucket in buckets:
        bucket["endpoints"] = sorted(
            bucket["endpoints"].values(),
            key=lambda endpoint_count: endpoint_count["total"],
            reverse=True,
        )
    return buckets


def get_recent_logs(db: Session, limit: int = 30, company_id: Optional[int] = None):
    query = db.query(RequestLog)
    if company_id is not None:
        query = query.filter(RequestLog.company_id == company_id)
    return query.order_by(RequestLog.created_at.desc()).limit(limit).all()