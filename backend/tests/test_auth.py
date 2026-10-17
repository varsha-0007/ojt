import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app import auth
from app.database import Base
from app.main import login, logout
from app.models import Company, RequestLog, User
from app.schemas import LoginCredentials


def make_request(path: str) -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 80),
    })


def test_password_hash_and_verify_roundtrip():
    hashed = auth.hash_password("correct-horse-battery-staple")
    assert auth.verify_password("correct-horse-battery-staple", hashed) is True


def test_wrong_password_fails_verification():
    hashed = auth.hash_password("correct-horse-battery-staple")
    assert auth.verify_password("wrong-password", hashed) is False


def test_token_roundtrip_contains_expected_claims():
    token = auth.create_access_token(user_id=7, email="owner@example.com", role="owner")
    payload = auth.decode_access_token(token)

    assert payload["sub"] == "7"
    assert payload["email"] == "owner@example.com"
    assert payload["role"] == "owner"


def test_token_roundtrip_includes_company_id():
    token = auth.create_access_token(
        user_id=7,
        email="owner@example.com",
        role="owner",
        company_id=12,
    )
    payload = auth.decode_access_token(token)

    assert payload["company_id"] == 12


def test_garbage_token_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        auth.decode_access_token("this-is-not-a-real-token")
    assert exc_info.value.status_code == 401


def test_dashboard_login_and_logout_are_logged_for_company():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        company = Company(name="Test Company", api_key="test-company-key")
        db.add(company)
        db.flush()
        user = User(
            email="owner@example.com",
            password_hash=auth.hash_password("valid-password"),
            role="owner",
            is_primary=True,
            company_id=company.id,
        )
        db.add(user)
        db.commit()

        login(
            LoginCredentials(email="owner@example.com", password="valid-password"),
            make_request("/auth/login"),
            db,
        )
        logout(make_request("/auth/logout"), user, db)

        events = (
            db.query(RequestLog)
            .filter(RequestLog.company_id == company.id)
            .order_by(RequestLog.endpoint)
            .all()
        )
        assert [(event.endpoint, event.status) for event in events] == [
            ("/auth/login", "allowed"),
            ("/auth/logout", "allowed"),
        ]