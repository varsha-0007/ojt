from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginCredentials(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    is_primary: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CreateUserByOwner(BaseModel):
    email: str
    password: str
    role: str = "viewer"


class PolicyCreate(BaseModel):
    name: str
    endpoint: str
    method: str = "*"
    capacity: int
    refill_tokens: int
    refill_seconds: int
    forward_url: Optional[str] = None
    enabled: bool = True


class PolicyOut(PolicyCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class OrderRequest(BaseModel):
    book_id: int
    quantity: int = 1


class TrackEvent(BaseModel):
    endpoint: str
    event: str = "page_view"