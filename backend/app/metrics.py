from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import RequestLog


def get_summary(db: Session, minutes: int = 60):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    rows = (
        db.query(RequestLog.status, func.count())
        .filter(RequestLog.created_at >= since)
        .group_by(RequestLog.status)
        .all()
    )
    counts = {"allowed": 0, "rejected": 0, "tracked": 0}
    for status, count in rows:
        counts[status] = count
    total = counts["allowed"] + counts["rejected"] + counts["tracked"]
    return {"total": total, **counts}


def get_endpoint_counts(db: Session, minutes: int = 60):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    rows = (
        db.query(RequestLog.endpoint, func.count().label("total"))
        .filter(RequestLog.created_at >= since)
        .group_by(RequestLog.endpoint)
        .order_by(func.count().desc())
        .all()
    )
    return [{"endpoint": endpoint, "total": total} for endpoint, total in rows]


def get_timeline(db: Session, minutes: int = 30, bucket_seconds: int = 60, endpoint: Optional[str] = None):
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    query = db.query(RequestLog.created_at, RequestLog.status).filter(RequestLog.created_at >= since)
    if endpoint:
        query = query.filter(RequestLog.endpoint == endpoint)
    rows = query.order_by(RequestLog.created_at.asc()).all()

    now = datetime.now(timezone.utc).timestamp()
    window_start = now - (minutes * 60)
    bucket_count = int((minutes * 60) / bucket_seconds)

    buckets = [
        {"time": window_start + (i * bucket_seconds), "total": 0, "rejected": 0}
        for i in range(bucket_count)
    ]

    for created_at, status in rows:
        row_time = created_at.timestamp()
        index = int((row_time - window_start) / bucket_seconds)
        if 0 <= index < len(buckets):
            buckets[index]["total"] += 1
            if status == "rejected":
                buckets[index]["rejected"] += 1

    return buckets