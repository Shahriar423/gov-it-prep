from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.content import ChapterRef
from app.schemas.question import Difficulty

ALLOWED_NEGATIVE = (0.0, 0.25, 0.5)
AnswerIndex = Annotated[int, Field(ge=0, le=5)]


def validate_negative(value: float) -> float:
    value = round(float(value), 2)
    if value not in ALLOWED_NEGATIVE:
        raise ValueError("Negative marking must be 0, 0.25, or 0.5.")
    return value


def _strip(value):
    return value.strip() if isinstance(value, str) else value


def _limit_answers(value):
    if value is not None and len(value) > 200:
        raise ValueError("Too many answers.")
    return value


# ======================================================================
# Admin
# ======================================================================
class ExamIn(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=500)
    duration_minutes: int = Field(ge=1, le=240)
    negative_marking: float = 0.25
    status: Literal["draft", "published"] = "draft"
    question_ids: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_text(cls, v):
        return _strip(v)

    @field_validator("negative_marking")
    @classmethod
    def check_negative(cls, v: float) -> float:
        return validate_negative(v)


class ExamAdminItem(BaseModel):
    id: str
    title: str
    description: str
    duration_minutes: int
    negative_marking: float
    status: str
    question_count: int
    created_at: datetime
    updated_at: datetime


class ExamQuestionSummary(BaseModel):
    id: str
    text: str
    subject_name: str
    difficulty: str
    status: str


class ExamAdminDetail(ExamAdminItem):
    questions: list[ExamQuestionSummary]


# ======================================================================
# Student: listing and starting
# ======================================================================
class ExamListItem(BaseModel):
    id: str
    title: str
    description: str
    duration_minutes: int
    negative_marking: float
    question_count: int
    attempts_count: int
    best_percent: int | None = None


class ActiveAttempt(BaseModel):
    id: str
    title: str
    remaining_seconds: int


class HistoryItem(BaseModel):
    id: str
    title: str
    score: float
    max_score: int
    score_percent: int
    submitted_at: datetime | None = None
    timed_out: bool = False


class ExamListResponse(BaseModel):
    exams: list[ExamListItem]
    active_attempt: ActiveAttempt | None = None
    history: list[HistoryItem]


class StartExamRequest(BaseModel):
    # Either exam_id (a published paper) or the custom settings below
    exam_id: str | None = None
    subject_id: str | None = None
    chapter_id: str | None = None
    difficulty: Difficulty | None = None
    count: int = Field(default=10, ge=1, le=100)
    duration_minutes: int | None = Field(default=None, ge=1, le=240)
    negative_marking: float | None = None

    @field_validator("negative_marking")
    @classmethod
    def check_negative(cls, v):
        return None if v is None else validate_negative(v)


class StartExamResponse(BaseModel):
    attempt_id: str


# ======================================================================
# Student: taking the exam
# ======================================================================
class AttemptQuestion(BaseModel):
    """What the student sees DURING the exam: no correct answer, no explanation."""

    id: str
    text: str
    options: list[str]
    difficulty: str
    subject_name: str


class AttemptState(BaseModel):
    id: str
    title: str
    status: str
    duration_minutes: int
    negative_marking: float
    total_questions: int
    remaining_seconds: int
    questions: list[AttemptQuestion]
    answers: dict[str, int]


class SaveAnswersRequest(BaseModel):
    answers: dict[str, AnswerIndex]

    @field_validator("answers")
    @classmethod
    def limit(cls, v):
        return _limit_answers(v)


class SaveAnswersResponse(BaseModel):
    status: str
    remaining_seconds: int


class SubmitRequest(BaseModel):
    answers: dict[str, AnswerIndex] | None = None

    @field_validator("answers")
    @classmethod
    def limit(cls, v):
        return _limit_answers(v)


class SubmitResponse(BaseModel):
    attempt_id: str
    status: str


# ======================================================================
# Student: results
# ======================================================================
class ResultQuestion(BaseModel):
    id: str
    number: int
    text: str
    options: list[str]
    selected_index: int | None = None
    correct_index: int
    state: Literal["correct", "wrong", "unanswered"]
    explanation: str
    difficulty: str
    source: str
    exam_name: str | None = None
    year: int | None = None
    subject_name: str
    chapter: ChapterRef | None = None


class SubjectBreakdown(BaseModel):
    name: str
    total: int
    correct: int
    wrong: int
    unanswered: int
    percent: int


class ExamResult(BaseModel):
    id: str
    title: str
    status: str
    timed_out: bool
    started_at: datetime
    submitted_at: datetime | None = None
    duration_minutes: int
    time_taken_seconds: int
    negative_marking: float
    total_questions: int
    correct: int
    wrong: int
    unanswered: int
    score: float
    max_score: int
    score_percent: int
    weak_spots_added: int
    subjects: list[SubjectBreakdown]
    questions: list[ResultQuestion]