"""Chapter Performance & Written Preparation routes."""
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.schemas.chapter_performance import (
    ChapterPerformanceResponse,
    WrittenPrepResponse,
    WrittenPrepUpdate,
)
from app.services import chapter_performance_service

router = APIRouter(prefix="/api/performance", tags=["chapter-performance"])


@router.get("/chapters", response_model=ChapterPerformanceResponse)
async def chapter_performance(user: dict = Depends(get_current_user)):
    return await chapter_performance_service.get_chapter_performance(user["_id"])


@router.get("/written", response_model=WrittenPrepResponse)
async def written_prep(
    subject_id: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
):
    return await chapter_performance_service.get_written_prep(user["_id"], subject_id)


@router.put("/written/{question_id}")
async def update_written_prep(
    question_id: str,
    payload: WrittenPrepUpdate,
    user: dict = Depends(get_current_user),
):
    return await chapter_performance_service.update_written_prep(
        user["_id"], question_id, payload.status, payload.self_assessed_marks
    )