"""Schemas for the Exam History & Performance Analytics module."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Summary statistics (top of the History page)
# ---------------------------------------------------------------------------
class HistoryStats(BaseModel):
    total_mcq_completed: int = 0
    total_written_submitted: int = 0
    average_mcq_score_percent: float | None = None
    average_mcq_accuracy_percent: float | None = None
    average_time_seconds_mcq: float | None = None
    written_pending_evaluation: int = 0  # always 0 until an evaluation flow exists
    best_mcq_score_percent: int | None = None
    # unfinished / abandoned
    mcq_in_progress: int = 0
    written_in_progress: int = 0


# ---------------------------------------------------------------------------
# List item for one historical attempt (MCQ or Written)
# ---------------------------------------------------------------------------
class HistoryAttemptItem(BaseModel):
    id: str
    exam_type: Literal["mcq", "written"]
    title: str
    status: str  # submitted | expired | in_progress | ended
    status_label: str  # human-friendly
    score: float | None = None
    max_score: int | None = None
    score_percent: int | None = None
    accuracy_percent: float | None = None  # MCQ only: correct / total * 100
    correct: int | None = None
    wrong: int | None = None
    unanswered: int | None = None
    time_taken_seconds: int | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    timed_out: bool = False
    # optional context
    subject_names: list[str] = Field(default_factory=list)
    chapter_titles: list[str] = Field(default_factory=list)
    question_count: int = 0
    total_marks: int | None = None  # written
    end_reason: str | None = None  # written: finished_early | time_up
    can_view_result: bool = False  # True for graded MCQ
    can_view_paper: bool = False  # True while written session still has items (rare)


class HistoryListResponse(BaseModel):
    items: list[HistoryAttemptItem]
    total: int
    page: int
    page_size: int
    stats: HistoryStats


# ---------------------------------------------------------------------------
# Filters accepted by the list endpoint
# ---------------------------------------------------------------------------
class HistoryFilters(BaseModel):
    exam_type: Literal["mcq", "written", "all"] = "all"
    status: str | None = None  # submitted, expired, ended, in_progress
    q: str | None = None  # free-text search on title
    date_from: datetime | None = None
    date_to: datetime | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort: Literal["newest", "oldest", "score_desc", "score_asc"] = "newest"


# ---------------------------------------------------------------------------
# Written session history detail (metadata only — questions are not re-exposed)
# ---------------------------------------------------------------------------
class WrittenHistoryDetail(BaseModel):
    id: str
    title: str
    status: str
    status_label: str
    end_reason: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int
    time_taken_seconds: int | None = None
    question_count: int
    marks_per_question: int
    total_marks: int
    # Evaluation is not implemented in the current product
    evaluation_status: Literal["pending_evaluation", "not_applicable"] = "pending_evaluation"
    subject_names: list[str] = Field(default_factory=list)
    note: str = (
        "Written answers are not stored after the session ends, "
        "and questions are not re-shown for security. "
        "Only session metadata is available in history."
    )


# ---------------------------------------------------------------------------
# Performance analytics
# ---------------------------------------------------------------------------
class ScoreTrendPoint(BaseModel):
    attempt_id: str
    title: str
    submitted_at: datetime | None = None
    score_percent: int
    exam_type: Literal["mcq"] = "mcq"


class SubjectPerformance(BaseModel):
    name: str
    attempts: int
    questions: int
    correct: int
    wrong: int
    unanswered: int
    accuracy_percent: float


class ChapterPerformance(BaseModel):
    name: str
    subject_name: str
    questions: int
    correct: int
    accuracy_percent: float


class AnalyticsResponse(BaseModel):
    score_trend: list[ScoreTrendPoint]
    subject_performance: list[SubjectPerformance]
    chapter_performance: list[ChapterPerformance]
    total_correct: int
    total_wrong: int
    total_unanswered: int
    mcq_attempt_count: int
    has_enough_data: bool