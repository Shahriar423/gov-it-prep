from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.content import ChapterRef, SubjectRef

Difficulty = Literal["easy", "medium", "hard"]
# "ai" questions are created only by the generation tool (see routers/admin_questions.py)
QuestionSource = Literal["pyq", "notes", "ai"]
QuestionStatus = Literal["draft", "approved", "rejected"]


class QuestionIn(BaseModel):
    subject_id: str
    chapter_id: str | None = None
    text: str = Field(min_length=5, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0, le=5)
    explanation: str = Field(default="", max_length=3000)
    difficulty: Difficulty = "medium"
    source: QuestionSource = "pyq"
    exam_name: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1980, le=2100)
    status: QuestionStatus = "draft"

    @field_validator("text", "explanation", mode="before")
    @classmethod
    def strip_text(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("chapter_id", "exam_name", mode="before")
    @classmethod
    def blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("options")
    @classmethod
    def check_options(cls, v: list[str]) -> list[str]:
        cleaned = [o.strip() for o in v]
        if any(not o for o in cleaned):
            raise ValueError("Answer options cannot be empty.")
        if any(len(o) > 300 for o in cleaned):
            raise ValueError("Each answer option must be 300 characters or fewer.")
        if len({o.casefold() for o in cleaned}) != len(cleaned):
            raise ValueError("Answer options must be different from each other.")
        return cleaned

    @model_validator(mode="after")
    def check_correct_index(self):
        if self.correct_index >= len(self.options):
            raise ValueError("The correct answer must be one of the options.")
        return self


class StatusUpdate(BaseModel):
    status: QuestionStatus


class QuestionAdminItem(BaseModel):
    id: str
    subject: SubjectRef
    chapter: ChapterRef | None = None
    text: str
    options: list[str]
    correct_index: int
    explanation: str
    difficulty: str
    source: str
    exam_name: str | None = None
    year: int | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class QuestionAdminList(BaseModel):
    items: list[QuestionAdminItem]
    total: int
    page: int
    page_size: int