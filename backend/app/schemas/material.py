from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from app.core.constants import TARGET_EXAMS
from app.schemas.content import ChapterRef, SubjectRef

MaterialKind = Literal["notes", "previous_year"]
MaterialStatus = Literal["processing", "ready", "failed"]

_FIELD_LABELS = {
    "title": "Title",
    "kind": "Material type",
    "subject_id": "Subject",
    "chapter_id": "Chapter",
    "exam_tags": "Recruitment exams",
    "year": "Year",
}


class MaterialMeta(BaseModel):
    """The details an admin provides about a source material."""

    title: str = Field(min_length=3, max_length=150)
    kind: MaterialKind
    subject_id: str = Field(min_length=1)
    chapter_id: str | None = None
    # An empty list means "applies to every recruitment exam"
    exam_tags: list[str] = Field(default_factory=list, max_length=20)
    year: int | None = Field(default=None, ge=1980, le=2100)

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("chapter_id", mode="before")
    @classmethod
    def blank_chapter(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("exam_tags")
    @classmethod
    def check_tags(cls, v: list[str]) -> list[str]:
        unique: list[str] = []
        for tag in v:
            if tag not in TARGET_EXAMS:
                raise ValueError(f"Unknown recruitment exam: {tag}.")
            if tag not in unique:
                unique.append(tag)
        return unique

    @model_validator(mode="after")
    def year_only_for_papers(self):
        if self.kind == "notes":
            self.year = None
        return self


def describe_validation_error(error: ValidationError) -> str:
    """One readable sentence for the first problem in a validation error."""
    first = error.errors()[0]
    message = str(first.get("msg", "Invalid value")).removeprefix("Value error, ")
    location = first.get("loc") or ()
    label = _FIELD_LABELS.get(str(location[-1])) if location else None
    if first.get("type") == "value_error" or not label:
        return message
    return f"{label}: {message}"


# ---------------------------------------------------------------- output
class MaterialItem(BaseModel):
    id: str
    title: str
    kind: str
    subject: SubjectRef | None = None
    chapter: ChapterRef | None = None
    exam_tags: list[str]
    year: int | None = None
    original_filename: str
    file_size_bytes: int
    page_count: int
    pages_with_text: int
    chunk_count: int
    word_count: int
    char_count: int
    status: MaterialStatus
    error: str | None = None
    warnings: list[str]
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None = None


class MaterialDetail(MaterialItem):
    preview: str = ""


class MaterialList(BaseModel):
    items: list[MaterialItem]
    total: int
    page: int
    page_size: int


class ChunkItem(BaseModel):
    index: int
    page_start: int
    page_end: int
    text: str
    char_count: int
    word_count: int


class ChunkList(BaseModel):
    items: list[ChunkItem]
    total: int
    page: int
    page_size: int


class KindOption(BaseModel):
    value: str
    label: str


class MaterialLimits(BaseModel):
    max_upload_mb: int
    max_pdf_pages: int


class MaterialOptions(BaseModel):
    target_exams: list[str]
    kinds: list[KindOption]
    limits: MaterialLimits