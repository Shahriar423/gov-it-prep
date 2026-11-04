from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.schemas.exam import (
    AttemptState,
    ExamListResponse,
    ExamResult,
    SaveAnswersRequest,
    SaveAnswersResponse,
    StartExamRequest,
    StartExamResponse,
    SubmitRequest,
    SubmitResponse,
)
from app.services import exam_service

router = APIRouter(prefix="/api/exams", tags=["exams"])


@router.get("", response_model=ExamListResponse)
async def list_exams(user: dict = Depends(get_current_user)):
    return await exam_service.list_exams(user)


@router.post("/start", response_model=StartExamResponse, status_code=201)
async def start_exam(payload: StartExamRequest, user: dict = Depends(get_current_user)):
    return await exam_service.start_exam(user, payload)


@router.get("/attempts/{attempt_id}", response_model=AttemptState)
async def get_attempt(attempt_id: str, user: dict = Depends(get_current_user)):
    return await exam_service.get_attempt(user, attempt_id)


@router.put("/attempts/{attempt_id}/answers", response_model=SaveAnswersResponse)
async def save_answers(
    attempt_id: str, payload: SaveAnswersRequest, user: dict = Depends(get_current_user)
):
    return await exam_service.save_answers(user, attempt_id, payload.answers)


@router.post("/attempts/{attempt_id}/submit", response_model=SubmitResponse)
async def submit_attempt(
    attempt_id: str, payload: SubmitRequest, user: dict = Depends(get_current_user)
):
    return await exam_service.submit_attempt(user, attempt_id, payload.answers)


@router.get("/attempts/{attempt_id}/result", response_model=ExamResult)
async def get_result(attempt_id: str, user: dict = Depends(get_current_user)):
    return await exam_service.get_result(user, attempt_id)