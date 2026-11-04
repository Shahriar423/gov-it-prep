from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.content import ChapterRef, SubjectRef
from app.schemas.extraction import DuplicateInfo, ReviewCounts, ReviewStatus
from app.schemas.question import Difficulty


class WrittenPart(BaseModel):
    label: str
    text: str
    marks: int | None = None


class ExtractedWrittenOut(BaseModel):
    id: str
    material_id: str
    chunk_index: int
    page_start: int | None = None
    page_end: int | None = None
    number: str | None = None
    stem: str
    parts: list[WrittenPart]
    text: str
    pdf_marks: int | None = None  # the marks printed in the PDF (reference only: exams use 10 marks per question)
    difficulty: str
    subject: SubjectRef | None = None
    chapter: ChapterRef | None = None
    topic_source: str
    exam_name: str | None = None
    year: int | None = None
    flags: list[str]
    problems: list[str]
    duplicate: DuplicateInfo | None = None
    status: ReviewStatus
    question_id: str | None = None
    edited: bool
    reject_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class ExtractedWrittenList(BaseModel):
    items: list[ExtractedWrittenOut]
    total: int
    page: int
    page_size: int
    counts: ReviewCounts


class WrittenPartIn(BaseModel):
    label: str = Field(min_length=1, max_length=8)
    text: str = Field(min_length=1, max_length=1500)
    marks: int | None = Field(default=None, ge=0, le=100)

    @field_validator("label", "text", mode="before")
    @classmethod
    def strip_text(cls, v):
        return v.strip() if isinstance(v, str) else v


class ExtractedWrittenIn(BaseModel):
    subject_id: str
    chapter_id: str | None = None
    stem: str = Field(default="", max_length=3000)
    parts: list[WrittenPartIn] = Field(default_factory=list, max_length=12)
    pdf_marks: int | None = Field(default=None, ge=0, le=100)
    difficulty: Difficulty = "medium"
    exam_name: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1980, le=2100)

    @field_validator("stem", mode="before")
    @classmethod
    def strip_stem(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("chapter_id", "exam_name", mode="before")
    @classmethod
    def blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @model_validator(mode="after")
    def needs_text(self):
        if not self.stem and not self.parts:
            raise ValueError("Write the question, or at least one part.")
        return self