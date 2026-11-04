from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.deps import require_admin
from app.schemas.extraction import (
    ApproveCleanResult,
    ExtractedQuestionIn,
    ExtractedQuestionList,
    ExtractedQuestionOut,
    ExtractionDetail,
    ExtractionList,
    PaperType,
    PipelineKey,
    RejectRequest,
)
from app.schemas.written_extraction import ExtractedWrittenIn, ExtractedWrittenList, ExtractedWrittenOut
from app.services import extraction_review_service, extraction_service, written_review_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/extraction",
    tags=["admin-extraction"],
    dependencies=[Depends(require_admin)],
)


# ---------------------------------------------------------------- PDFs and their extraction
@router.get("/materials", response_model=ExtractionList)
async def list_materials(
    status: PipelineKey | None = None,
    paper_type: PaperType | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    return await extraction_service.list_materials(
        status=status, paper_type=paper_type, search=q, page=page, page_size=page_size
    )


@router.get("/materials/{material_id}", response_model=ExtractionDetail)
async def get_material(material_id: str):
    return await extraction_service.get_detail(material_id)


@router.post("/materials/{material_id}/start", response_model=ExtractionDetail)
async def start_extraction(material_id: str, admin: dict = Depends(require_admin)):
    await extraction_service.start_extraction(material_id, admin)
    return await extraction_service.get_detail(material_id)


@router.post("/materials/{material_id}/paper-type", response_model=ExtractionDetail)
async def set_paper_type(
    material_id: str,
    paper_type: PaperType = Query(..., description="mcq or written"),
):
    """Set MCQ or Written for a study note / previous-year PDF before extraction."""
    await extraction_service.set_paper_type(material_id, paper_type)
    return await extraction_service.get_detail(material_id)




@router.post("/jobs/{job_id}/resume", response_model=ExtractionDetail)
async def resume_extraction(job_id: str):
    job = await extraction_service.resume_extraction(job_id)
    return await extraction_service.get_detail(str(job["material_id"]))


@router.post("/jobs/{job_id}/stop", response_model=ExtractionDetail)
async def stop_extraction(job_id: str):
    job = await extraction_service.stop_extraction(job_id)
    return await extraction_service.get_detail(str(job["material_id"]))


# ---------------------------------------------------------------- reviewing extracted MCQs
@router.get("/materials/{material_id}/questions", response_model=ExtractedQuestionList)
async def list_questions(
    material_id: str,
    status: Literal["pending", "approved", "rejected"] | None = None,
    attention: bool = False,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
):
    return await extraction_review_service.list_questions(
        material_id, status=status, attention=attention, search=q, page=page, page_size=page_size
    )


@router.post("/materials/{material_id}/approve-clean", response_model=ApproveCleanResult)
async def approve_clean(material_id: str, admin: dict = Depends(require_admin)):
    return await extraction_review_service.approve_clean(material_id, admin)


@router.put("/questions/{question_id}", response_model=ExtractedQuestionOut)
async def update_question(question_id: str, payload: ExtractedQuestionIn):
    return await extraction_review_service.update_question(question_id, payload)


@router.post("/questions/{question_id}/approve", response_model=ExtractedQuestionOut)
async def approve_question(question_id: str, admin: dict = Depends(require_admin)):
    return await extraction_review_service.approve_question(question_id, admin)


@router.post("/questions/{question_id}/reject", response_model=ExtractedQuestionOut)
async def reject_question(
    question_id: str, payload: RejectRequest | None = None, admin: dict = Depends(require_admin)
):
    reason = payload.reason if payload else ""
    return await extraction_review_service.reject_question(question_id, admin, reason)


@router.post("/questions/{question_id}/restore", response_model=ExtractedQuestionOut)
async def restore_question(question_id: str):
    return await extraction_review_service.restore_question(question_id)


# ---------------------------------------------------------------- reviewing extracted written questions
@router.get("/written/materials/{material_id}/questions", response_model=ExtractedWrittenList)
async def list_written(
    material_id: str,
    status: Literal["pending", "approved", "rejected"] | None = None,
    attention: bool = False,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
):
    return await written_review_service.list_questions(
        material_id, status=status, attention=attention, search=q, page=page, page_size=page_size
    )


@router.post("/written/materials/{material_id}/approve-clean", response_model=ApproveCleanResult)
async def approve_clean_written(material_id: str, admin: dict = Depends(require_admin)):
    return await written_review_service.approve_clean(material_id, admin)


@router.put("/written/questions/{question_id}", response_model=ExtractedWrittenOut)
async def update_written(question_id: str, payload: ExtractedWrittenIn):
    return await written_review_service.update_question(question_id, payload)


@router.post("/written/questions/{question_id}/approve", response_model=ExtractedWrittenOut)
async def approve_written(question_id: str, admin: dict = Depends(require_admin)):
    return await written_review_service.approve_question(question_id, admin)


@router.post("/written/questions/{question_id}/reject", response_model=ExtractedWrittenOut)
async def reject_written(
    question_id: str, payload: RejectRequest | None = None, admin: dict = Depends(require_admin)
):
    reason = payload.reason if payload else ""
    return await written_review_service.reject_question(question_id, admin, reason)


@router.post("/written/questions/{question_id}/restore", response_model=ExtractedWrittenOut)
async def restore_written(question_id: str):
    return await written_review_service.restore_question(question_id)