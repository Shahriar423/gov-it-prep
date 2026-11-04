from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import TargetExam, validate_password


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    target_exam: TargetExam | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v):
        return v.strip() if isinstance(v, str) else v


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_new_password(cls, v: str) -> str:
        return validate_password(v)