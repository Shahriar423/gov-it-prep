from datetime import datetime

from pydantic import BaseModel, Field


class AiStatusOut(BaseModel):
    configured: bool
    provider: str
    model: str
    missing: list[str]
    message: str
    used_today: int
    daily_limit: int
    per_minute_limit: int


class TestResult(BaseModel):
    ok: bool
    message: str
    provider: str
    model: str
    latency_ms: int | None = None


class StartGenerationRequest(BaseModel):
    questions_per_chunk: int = Field(default=3, ge=1, le=5)


class JobItem(BaseModel):
    id: str
    material_id: str
    material_title: str
    status: str  # running | paused | completed
    pause_reason: str | None = None
    questions_per_chunk: int
    provider: str
    model: str
    chunks_processed: int
    chunks_failed: int
    chunks_skipped: int
    candidates: int
    accepted: int
    rejected: int
    rejected_by_reason: dict[str, int]
    api_calls: int
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    finished_at: datetime | None = None


class GenerationOverview(BaseModel):
    material_id: str
    material_title: str
    material_status: str
    material_kind: str
    chunks_total: int
    chunks_done: int
    chunks_failed: int
    chunks_remaining: int
    questions_total: int
    questions_approved: int
    active_job: JobItem | None = None
    latest_job: JobItem | None = None
    can_start: bool
    can_resume: bool
    blocked_reason: str | None = None
    ai: AiStatusOut


class GeneratedQuestion(BaseModel):
    id: str
    text: str
    options: list[str]
    correct_index: int
    explanation: str
    evidence: str
    difficulty: str
    status: str
    page_start: int | None = None
    page_end: int | None = None
    created_at: datetime


class GeneratedQuestionList(BaseModel):
    items: list[GeneratedQuestion]
    total: int
    page: int
    page_size: int