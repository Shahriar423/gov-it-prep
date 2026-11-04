from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.content import ChapterRef, SubjectRef
from app.schemas.question import Difficulty


class PracticeChapterOption(BaseModel):
    id: str
    title: str
    question_count: int


class PracticeSubjectOption(BaseModel):
    id: str
    name: str
    question_count: int
    chapters: list[PracticeChapterOption]


class PracticeOptions(BaseModel):
    subjects: list[PracticeSubjectOption]


class PracticeStartRequest(BaseModel):
    subject_id: str | None = None
    chapter_id: str | None = None
    difficulty: Difficulty | None = None
    count: int = Field(default=10, ge=1, le=50)


class PracticeQuestion(BaseModel):
    """A question as the student sees it BEFORE answering: no answer, no explanation."""

    id: str
    text: str
    options: list[str]
    difficulty: str
    source: str
    exam_name: str | None = None
    year: int | None = None
    subject: SubjectRef


class PracticeStartResponse(BaseModel):
    questions: list[PracticeQuestion]


class AnswerRequest(BaseModel):
    question_id: str
    selected_index: int = Field(ge=0, le=5)
    # "revision" answers do not change the student's Practice statistics
    mode: Literal["practice", "revision"] = "practice"


class AnswerResult(BaseModel):
    question_id: str
    is_correct: bool
    correct_index: int
    explanation: str
    chapter: ChapterRef | None = None
    added_to_weak_spots: bool
    mastered: bool = False
    next_review_days: int | None = None


class PracticeStats(BaseModel):
    answered: int
    correct: int
    accuracy_percent: int | None = None