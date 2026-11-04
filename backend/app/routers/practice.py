from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.schemas.practice import (
    AnswerRequest,
    AnswerResult,
    PracticeOptions,
    PracticeStartRequest,
    PracticeStartResponse,
    PracticeStats,
)
from app.services import practice_service

router = APIRouter(prefix="/api/practice", tags=["practice"])


@router.get("/options", response_model=PracticeOptions)
async def practice_options(user: dict = Depends(get_current_user)):
    return await practice_service.get_practice_options()


@router.get("/stats", response_model=PracticeStats)
async def practice_stats(user: dict = Depends(get_current_user)):
    return practice_service.get_practice_stats(user)


@router.post("/start", response_model=PracticeStartResponse)
async def practice_start(payload: PracticeStartRequest, user: dict = Depends(get_current_user)):
    return await practice_service.start_practice(payload)


@router.post("/answer", response_model=AnswerResult)
async def practice_answer(payload: AnswerRequest, user: dict = Depends(get_current_user)):
    return await practice_service.submit_answer(
        user, payload.question_id, payload.selected_index, payload.mode
    )