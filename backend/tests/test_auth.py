import pytest
from fastapi import HTTPException

from app import auth


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


def test_garbage_token_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        auth.decode_access_token("this-is-not-a-real-token")
    assert exc_info.value.status_code == 401