from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.schemas.practice import PracticeStartResponse
from app.schemas.revision import (
    RevisionItemList,
    RevisionStartRequest,
    RevisionSummary,
)
from app.services import revision_service

router = APIRouter(prefix="/api/revision", tags=["revision"])


@router.get("/summary", response_model=RevisionSummary)
async def revision_summary(user: dict = Depends(get_current_user)):
    return await revision_service.get_summary(user["_id"])


@router.get("/items", response_model=RevisionItemList)
async def revision_items(
    status: Literal["due", "upcoming", "mastered"] = "due",
    subject_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    return await revision_service.list_items(user["_id"], status, subject_id, page, page_size)


@router.post("/start", response_model=PracticeStartResponse)
async def revision_start(payload: RevisionStartRequest, user: dict = Depends(get_current_user)):
    return await revision_service.start_revision(
        user["_id"], payload.subject_id, payload.count, payload.include_upcoming
    )