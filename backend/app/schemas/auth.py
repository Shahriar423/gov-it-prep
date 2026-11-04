from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

TargetExam = Literal[
    "Assistant Network Engineer",
    "Assistant Maintenance Engineer",
    "Assistant Programmer",
    "Bank IT Officer",
]


def validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password is too long (maximum 72 bytes).")
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must contain at least one letter and one number.")
    return value


class RegisterRequest(BaseModel):
    # Note: there is deliberately NO 'role' field. Nobody can choose their own role.
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str
    target_exam: TargetExam | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserPublic(BaseModel):
    """What the API is allowed to show about a user (never the password hash)."""

    id: str
    name: str
    email: str
    role: Literal["student", "admin"]
    target_exam: str | None = None
    avatar_url: str | None = None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic