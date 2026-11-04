from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.constants import MAX_WRITTEN_QUESTIONS
from app.schemas.exam import validate_negative

ExamType = Literal["mcq", "written"]
Category = Literal["technical", "non_technical"]
ExamDifficulty = Literal["mixed", "easy", "medium", "hard"]


class CreateExamRequest(BaseModel):
    type: ExamType
    category: Category
    selection: str = Field(default="all", min_length=1, max_length=40)  # "all" or a chapter/subject id
    count: int = Field(ge=1, le=100)
    duration_minutes: int = Field(ge=1, le=240)
    difficulty: ExamDifficulty = "mixed"
    negative_marking: float = 0.0  # MCQ only

    @field_validator("negative_marking")
    @classmethod
    def check_negative(cls, v: float) -> float:
        return validate_negative(v)

    @model_validator(mode="after")
    def check_written(self):
        if self.type == "written":
            self.negative_marking = 0.0  # written exams are never scored
            if self.count > MAX_WRITTEN_QUESTIONS:
                raise ValueError(f"A written exam can have at most {MAX_WRITTEN_QUESTIONS} questions.")
        return self


# ---------------------------------------------------------------- builder options
class BuilderItem(BaseModel):
    id: str
    label: str
    group: str | None = None
    mcq_count: int
    written_count: int


class BuilderCategory(BaseModel):
    key: Category
    label: str
    items: list[BuilderItem]
    mcq_total: int
    written_total: int


class ActiveExam(BaseModel):
    type: ExamType
    id: str
    title: str
    remaining_seconds: int


class BuilderOptions(BaseModel):
    categories: list[BuilderCategory]
    active_exam: ActiveExam | None = None


# ---------------------------------------------------------------- availability and creation
class AvailabilityPart(BaseModel):
    label: str
    available: int
    needed: int


class Availability(BaseModel):
    ok: bool
    type: ExamType
    requested: int
    available: int
    parts: list[AvailabilityPart]
    message: str


class CreateExamResponse(BaseModel):
    type: ExamType
    id: str


# ---------------------------------------------------------------- written exam session
class WrittenQuestionOut(BaseModel):
    number: int
    id: str
    text: str
    marks: int
    subject_name: str
    chapter_title: str | None = None
    difficulty: str


class WrittenState(BaseModel):
    id: str
    title: str
    status: Literal["in_progress", "ended"]
    end_reason: str | None = None  # "time_up" | "finished_early"
    duration_minutes: int
    question_count: int
    marks_per_question: int
    total_marks: int
    remaining_seconds: int
    # Empty unless the session is in progress and the deadline has not passed
    questions: list[WrittenQuestionOut]