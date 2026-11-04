"""Exam History & Performance Analytics routes."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.schemas.history import (
    AnalyticsResponse,
    HistoryListResponse,
    WrittenHistoryDetail,
)
from app.services import history_service

router = APIRouter(prefix="/api/exams/history", tags=["exam-history"])


@router.get("", response_model=HistoryListResponse)
async def list_exam_history(
    exam_type: str = Query(default="all", pattern="^(all|mcq|written)$"),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort: str = Query(default="newest", pattern="^(newest|oldest|score_desc|score_asc)$"),
    user: dict = Depends(get_current_user),
):
    return await history_service.list_history(
        user,
        exam_type=exam_type,
        status=status,
        q=q,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort=sort,
    )


@router.get("/analytics", response_model=AnalyticsResponse)
async def exam_analytics(user: dict = Depends(get_current_user)):
    return await history_service.get_analytics(user)


@router.get("/written/{session_id}", response_model=WrittenHistoryDetail)
async def written_history_detail(session_id: str, user: dict = Depends(get_current_user)):
    return await history_service.get_written_history(user, session_id)