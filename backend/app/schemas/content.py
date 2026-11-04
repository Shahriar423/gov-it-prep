from datetime import datetime

from pydantic import BaseModel, Field, field_validator


def _strip(value):
    return value.strip() if isinstance(value, str) else value


# ---------- Input (admin) ----------
class SubjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=500)
    order: int | None = Field(default=None, ge=0, le=10000)

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _strip(v)


class ChapterIn(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    summary: str = Field(default="", max_length=300)
    content: str = Field(default="", max_length=50000)  # Markdown
    order: int | None = Field(default=None, ge=0, le=10000)
    is_published: bool = False

    @field_validator("title", "summary", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _strip(v)


class CompletionRequest(BaseModel):
    completed: bool


# ---------- Small references ----------
class SubjectRef(BaseModel):
    id: str
    name: str


class ChapterRef(BaseModel):
    id: str
    title: str


# ---------- Output (admin) ----------
class SubjectAdminItem(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    order: int
    chapters_total: int
    chapters_published: int


class ChapterAdminItem(BaseModel):
    id: str
    title: str
    summary: str
    order: int
    is_published: bool
    updated_at: datetime


class AdminChapterList(BaseModel):
    subject: SubjectRef
    chapters: list[ChapterAdminItem]


class ChapterAdminDetail(BaseModel):
    id: str
    subject: SubjectRef
    title: str
    summary: str
    content: str
    order: int
    is_published: bool
    updated_at: datetime


# ---------- Output (student) ----------
class SubjectStudentItem(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    chapters_total: int
    chapters_completed: int
    progress_percent: int


class ChapterStudentItem(BaseModel):
    id: str
    title: str
    summary: str
    order: int
    is_completed: bool


class SubjectStudentDetail(SubjectStudentItem):
    chapters: list[ChapterStudentItem]


class ChapterStudentDetail(BaseModel):
    id: str
    title: str
    summary: str
    content: str
    order: int
    subject: SubjectRef
    is_completed: bool
    prev_chapter: ChapterRef | None = None
    next_chapter: ChapterRef | None = None


class CompletionResponse(BaseModel):
    chapter_id: str
    is_completed: bool