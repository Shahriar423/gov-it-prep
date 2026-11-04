from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.content import ChapterRef, SubjectRef


class RevisionSubject(BaseModel):
    id: str
    name: str
    active: int
    due: int


class RevisionSummary(BaseModel):
    active: int
    due: int
    mastered: int
    next_due_at: datetime | None = None
    subjects: list[RevisionSubject]


class RevisionItem(BaseModel):
    """A weak question as listed on the Weak spots page: no options, no answer."""

    question_id: str
    text: str
    difficulty: str
    subject: SubjectRef
    chapter: ChapterRef | None = None
    status: Literal["due", "upcoming", "mastered"]
    next_review_at: datetime | None = None
    wrong_count: int
    correct_streak: int


class RevisionItemList(BaseModel):
    items: list[RevisionItem]
    total: int
    page: int
    page_size: int


class RevisionStartRequest(BaseModel):
    subject_id: str | None = None
    count: int = Field(default=10, ge=1, le=50)
    include_upcoming: bool = False