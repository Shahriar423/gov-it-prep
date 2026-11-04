from fastapi import APIRouter, Depends, Query

from app.core.deps import require_admin
from app.schemas.question import Difficulty, QuestionStatus, StatusUpdate
from app.schemas.written import WrittenQuestionIn, WrittenQuestionItem, WrittenQuestionList
from app.services import written_question_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/written-questions",
    tags=["admin-written"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=WrittenQuestionList)
async def list_questions(
    subject_id: str | None = None,
    chapter_id: str | None = None,
    status: QuestionStatus | None = None,
    difficulty: Difficulty | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    return await written_question_service.list_questions(
        subject_id=subject_id,
        chapter_id=chapter_id,
        status=status,
        difficulty=difficulty,
        search=q,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=WrittenQuestionItem, status_code=201)
async def create_question(payload: WrittenQuestionIn, admin: dict = Depends(require_admin)):
    return await written_question_service.create_question(payload, admin)


@router.get("/{question_id}", response_model=WrittenQuestionItem)
async def get_question(question_id: str):
    return await written_question_service.get_question(question_id)


@router.put("/{question_id}", response_model=WrittenQuestionItem)
async def update_question(question_id: str, payload: WrittenQuestionIn):
    return await written_question_service.update_question(question_id, payload)


@router.patch("/{question_id}/status", response_model=WrittenQuestionItem)
async def update_status(question_id: str, payload: StatusUpdate):
    return await written_question_service.set_status(question_id, payload.status)


@router.delete("/{question_id}", status_code=204)
async def delete_question(question_id: str):
    await written_question_service.delete_question(question_id)