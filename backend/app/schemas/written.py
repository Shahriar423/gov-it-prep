from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.content import ChapterRef, SubjectRef
from app.schemas.question import Difficulty, QuestionStatus


class WrittenQuestionIn(BaseModel):
    subject_id: str
    chapter_id: str | None = None
    text: str = Field(min_length=20, max_length=3000)
    difficulty: Difficulty = "medium"
    status: QuestionStatus = "draft"
    # There is deliberately no "marks" field: every written question is exactly 10 marks.

    @field_validator("text", mode="before")
    @classmethod
    def strip_text(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("chapter_id", mode="before")
    @classmethod
    def blank_chapter(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v


class WrittenQuestionItem(BaseModel):
    id: str
    subject: SubjectRef
    chapter: ChapterRef | None = None
    text: str
    marks: int
    difficulty: str
    status: str
    source: str
    created_at: datetime
    updated_at: datetime


class WrittenQuestionList(BaseModel):
    items: list[WrittenQuestionItem]
    total: int
    page: int
    page_size: int