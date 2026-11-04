from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from app.schemas.auto_exam import (
    Availability,
    BuilderOptions,
    Category,
    CreateExamRequest,
    CreateExamResponse,
    ExamDifficulty,
    ExamType,
    WrittenState,
)
from app.services import auto_exam_service

router = APIRouter(prefix="/api/exams", tags=["auto-exams"])


@router.get("/builder", response_model=BuilderOptions)
async def builder(user: dict = Depends(get_current_user)):
    return await auto_exam_service.get_builder(user)


@router.get("/availability", response_model=Availability)
async def availability(
    exam_type: ExamType = Query(alias="type"),
    category: Category = Query(),
    selection: str = Query(default="all", min_length=1, max_length=40),
    difficulty: ExamDifficulty = Query(default="mixed"),
    count: int = Query(default=10, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    return await auto_exam_service.check_availability(
        kind=exam_type, category=category, selection=selection, difficulty=difficulty, count=count
    )


@router.post("/create", response_model=CreateExamResponse, status_code=201)
async def create_exam(payload: CreateExamRequest, user: dict = Depends(get_current_user)):
    return await auto_exam_service.create_exam(user, payload)


@router.get("/written/{session_id}", response_model=WrittenState)
async def get_written(session_id: str, user: dict = Depends(get_current_user)):
    return await auto_exam_service.get_written(user, session_id)


@router.post("/written/{session_id}/finish", response_model=WrittenState)
async def finish_written(session_id: str, user: dict = Depends(get_current_user)):
    return await auto_exam_service.finish_written(user, session_id)