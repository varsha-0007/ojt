from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    target_url: Optional[str] = None
    api_key: str
    created_at: datetime


class SignupRequest(BaseModel):
    company_name: str
    target_url: Optional[str] = None
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
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_api_key: Optional[str] = None
    company_target_url: Optional[str] = None
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


class PolicyUpdate(BaseModel):
    name: str
    method: str = "*"
    capacity: int
    refill_tokens: int
    refill_seconds: int
    forward_url: Optional[str] = None
    enabled: bool = True


class PolicyOut(PolicyCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: Optional[int] = None
    created_at: datetime


class RequestLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    endpoint: str
    method: str
    client_hash: str
    status: str
    policy_name: Optional[str] = None
    source: str
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