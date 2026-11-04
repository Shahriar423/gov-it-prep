"""Chapter Performance & Written Preparation schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# Configurable thresholds (documented for the frontend too)
MIN_QUESTIONS_FOR_STATUS = 10
WEAK_BELOW = 50
STRONG_AT_OR_ABOVE = 75

ChapterStatus = Literal["insufficient_data", "weak", "needs_revision", "strong"]
WrittenPrepStatus = Literal["not_attempted", "attempted", "needs_improvement", "confident"]


class ChapterPerformanceItem(BaseModel):
    chapter_id: str | None = None
    chapter_title: str
    subject_id: str | None = None
    subject_name: str
    is_unmapped: bool = False
    unmap_reason: str | None = None
    sample_question_ids: list[str] = Field(default_factory=list)
    questions_attempted: int = 0
    correct: int = 0
    incorrect: int = 0
    accuracy_percent: float | None = None
    questions_needed_for_status: int = 0
    revision_due: int = 0
    revision_active: int = 0
    revision_later: int = 0
    last_practiced_at: datetime | None = None
    status: ChapterStatus = "insufficient_data"
    status_label: str = "Insufficient data"
    recommended_action: str = "Practice more questions in this chapter"


class ChapterPerformanceSummary(BaseModel):
    chapters_assessed: int = 0
    chapters_needing_practice: int = 0  # genuinely weak (<50% with enough data)
    chapters_need_more_data: int = 0  # insufficient attempts
    chapters_needing_revision: int = 0
    strong_chapters: int = 0
    revision_due_total: int = 0
    revision_later_total: int = 0
    revision_active_total: int = 0
    revision_mastered_total: int = 0


class ChapterPerformanceResponse(BaseModel):
    summary: ChapterPerformanceSummary
    chapters: list[ChapterPerformanceItem]
    unmapped: list[ChapterPerformanceItem] = Field(default_factory=list)
    thresholds: dict = Field(
        default_factory=lambda: {
            "min_questions": MIN_QUESTIONS_FOR_STATUS,
            "weak_below": WEAK_BELOW,
            "strong_at_or_above": STRONG_AT_OR_ABOVE,
        }
    )


class WrittenQuestionPrepItem(BaseModel):
    question_id: str
    text: str
    subject_id: str | None = None
    subject_name: str
    chapter_id: str | None = None
    chapter_title: str | None = None
    marks: int = 10
    difficulty: str = "medium"
    prep_status: WrittenPrepStatus = "not_attempted"
    self_assessed_marks: int | None = None
    last_reviewed_at: datetime | None = None
    has_model_answer: bool = False


class WrittenChapterPrep(BaseModel):
    chapter_id: str | None = None
    chapter_title: str
    subject_id: str | None = None
    subject_name: str
    available_questions: int = 0
    not_attempted: int = 0
    attempted: int = 0
    needs_improvement: int = 0
    confident: int = 0
    recommended_action: str = "Start with unattempted questions"


class WrittenPrepSummary(BaseModel):
    total_questions: int = 0
    not_attempted: int = 0
    attempted: int = 0
    needs_improvement: int = 0
    confident: int = 0


class WrittenPrepResponse(BaseModel):
    summary: WrittenPrepSummary
    chapters: list[WrittenChapterPrep]
    questions: list[WrittenQuestionPrepItem] = Field(default_factory=list)


class WrittenPrepUpdate(BaseModel):
    status: WrittenPrepStatus
    self_assessed_marks: int | None = Field(default=None, ge=0, le=10)