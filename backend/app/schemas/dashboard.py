from datetime import datetime

from pydantic import BaseModel


class DashboardStats(BaseModel):
    subjects_count: int
    chapters_total: int
    chapters_completed: int
    overall_progress_percent: int
    exams_taken: int
    average_score_percent: int | None = None
    weak_spots_total: int
    weak_spots_due: int


class SubjectProgress(BaseModel):
    id: str
    name: str
    slug: str | None = None
    chapters_total: int
    chapters_completed: int
    progress_percent: int


class RecentAttempt(BaseModel):
    id: str
    title: str
    score_percent: int
    submitted_at: datetime | None = None


class DashboardSummary(BaseModel):
    stats: DashboardStats
    subjects: list[SubjectProgress]
    recent_attempts: list[RecentAttempt]