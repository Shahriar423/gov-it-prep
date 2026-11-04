from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.content import ChapterRef, SubjectRef
from app.schemas.question import Difficulty

PipelineKey = Literal["uploaded", "processing", "review_required", "completed", "failed", "paused"]
ReviewStatus = Literal["pending", "approved", "rejected"]
PaperType = Literal["mcq", "written"]


# ---------------------------------------------------------------- PDFs and their extraction status
class PipelineInfo(BaseModel):
    key: PipelineKey
    message: str


class ExtractionCounts(BaseModel):
    total: int
    pending: int
    approved: int
    rejected: int
    needs_attention: int


class ExtractionProgress(BaseModel):
    chunks_total: int
    chunks_done: int
    chunks_failed: int


class ExtractionJobOut(BaseModel):
    id: str
    status: str  # extracting | paused | completed
    pause_reason: str | None = None
    pause_kind: str | None = None
    chunks_processed: int
    chunks_failed: int
    chunks_skipped: int
    questions_found: int
    saved: int
    skipped_existing: int
    rejected: int
    flagged: int
    answers_from_key: int
    rejected_by_reason: dict[str, int]
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None


class ExtractionMaterial(BaseModel):
    id: str
    title: str
    paper_type: PaperType
    subject: SubjectRef | None = None
    chapter: ChapterRef | None = None
    year: int | None = None
    exam_tags: list[str]
    original_filename: str
    file_size_bytes: int
    page_count: int
    chunk_count: int
    created_at: datetime
    pipeline: PipelineInfo
    counts: ExtractionCounts
    progress: ExtractionProgress
    job: ExtractionJobOut | None = None
    detected_exam_name: str | None = None
    detected_year: int | None = None
    warnings: list[str]


class ExtractionList(BaseModel):
    items: list[ExtractionMaterial]
    total: int
    page: int
    page_size: int
    summary: dict[str, int]


class ExtractionDetail(ExtractionMaterial):
    can_start: bool
    can_resume: bool
    blocked_reason: str | None = None


# ---------------------------------------------------------------- extracted MCQs
class DuplicateInfo(BaseModel):
    kind: Literal["exact", "similar"]
    of_type: Literal["question", "written", "extracted"]
    of_id: str
    of_label: str


class ExtractedQuestionOut(BaseModel):
    id: str
    material_id: str
    chunk_index: int
    page_start: int | None = None
    page_end: int | None = None
    number: str | None = None
    text: str
    options: list[str]
    correct_index: int | None = None
    answer_status: str  # printed | key | manual | missing
    answer_quote: str
    explanation: str
    difficulty: str
    subject: SubjectRef | None = None
    chapter: ChapterRef | None = None
    topic_source: str  # heading | ai (older extractions) | material | manual
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


class ReviewCounts(BaseModel):
    pending: int
    approved: int
    rejected: int
    attention: int


class ExtractedQuestionList(BaseModel):
    items: list[ExtractedQuestionOut]
    total: int
    page: int
    page_size: int
    counts: ReviewCounts


class ExtractedQuestionIn(BaseModel):
    subject_id: str
    chapter_id: str | None = None
    text: str = Field(min_length=1, max_length=2000)
    options: list[str] = Field(default_factory=list, max_length=6)
    correct_index: int | None = Field(default=None, ge=0, le=5)
    explanation: str = Field(default="", max_length=3000)
    difficulty: Difficulty = "medium"
    exam_name: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1980, le=2100)

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
        return cleaned

    @model_validator(mode="after")
    def check_answer(self):
        if self.correct_index is not None and self.correct_index >= len(self.options):
            raise ValueError("The correct answer must be one of the options.")
        return self


class RejectRequest(BaseModel):
    reason: str = Field(default="", max_length=200)


class ApproveCleanResult(BaseModel):
    approved: int
    skipped: int
    more: bool