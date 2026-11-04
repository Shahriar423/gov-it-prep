from fastapi import APIRouter, Depends, Query

from app.core.deps import require_admin
from app.core.errors import BadRequestError
from app.schemas.question import (
    Difficulty,
    QuestionAdminItem,
    QuestionAdminList,
    QuestionIn,
    QuestionSource,
    QuestionStatus,
    StatusUpdate,
)
from app.services import question_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/questions",
    tags=["admin-questions"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=QuestionAdminList)
async def list_questions(
    subject_id: str | None = None,
    chapter_id: str | None = None,
    status: QuestionStatus | None = None,
    source: QuestionSource | None = None,
    difficulty: Difficulty | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    return await question_service.list_questions(
        subject_id=subject_id,
        chapter_id=chapter_id,
        status=status,
        source=source,
        difficulty=difficulty,
        search=q,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=QuestionAdminItem, status_code=201)
async def create_question(payload: QuestionIn, admin: dict = Depends(require_admin)):
    if payload.source == "ai":
        raise BadRequestError(
            "AI-generated questions are created by the generation tool on a source material. "
            "Choose another source for a question you write yourself."
        )
    return await question_service.create_question(payload, admin)


@router.get("/{question_id}", response_model=QuestionAdminItem)
async def get_question(question_id: str):
    return await question_service.get_question(question_id)


@router.put("/{question_id}", response_model=QuestionAdminItem)
async def update_question(question_id: str, payload: QuestionIn):
    existing = await question_service.get_question(question_id)
    if existing["source"] == "ai" and payload.source != "ai":
        raise BadRequestError("The source of an AI-generated question cannot be changed.")
    if existing["source"] != "ai" and payload.source == "ai":
        raise BadRequestError("Only the generation tool can create AI-generated questions.")
    return await question_service.update_question(question_id, payload)


@router.patch("/{question_id}/status", response_model=QuestionAdminItem)
async def update_question_status(question_id: str, payload: StatusUpdate):
    return await question_service.set_status(question_id, payload.status)


@router.delete("/{question_id}", status_code=204)
async def delete_question(question_id: str):
    await question_service.delete_question(question_id)