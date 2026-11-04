from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.schemas.content import (
    ChapterStudentDetail,
    CompletionRequest,
    CompletionResponse,
    SubjectStudentDetail,
    SubjectStudentItem,
)
from app.services import content_service

router = APIRouter(prefix="/api", tags=["content"])


@router.get("/subjects", response_model=list[SubjectStudentItem])
async def list_subjects(user: dict = Depends(get_current_user)):
    return await content_service.list_subjects_for_student(user)


@router.get("/subjects/{subject_id}", response_model=SubjectStudentDetail)
async def get_subject(subject_id: str, user: dict = Depends(get_current_user)):
    return await content_service.get_subject_for_student(user, subject_id)


@router.get("/chapters/{chapter_id}", response_model=ChapterStudentDetail)
async def get_chapter(chapter_id: str, user: dict = Depends(get_current_user)):
    return await content_service.get_chapter_for_student(user, chapter_id)


@router.put("/chapters/{chapter_id}/completion", response_model=CompletionResponse)
async def set_chapter_completion(
    chapter_id: str, payload: CompletionRequest, user: dict = Depends(get_current_user)
):
    return await content_service.set_completion(user, chapter_id, payload.completed)