from fastapi import APIRouter, Depends, Query

from app.ai import llm_client
from app.core.deps import require_admin
from app.core.errors import ConflictError
from app.schemas.generation import (
    AiStatusOut,
    GeneratedQuestionList,
    GenerationOverview,
    JobItem,
    StartGenerationRequest,
    TestResult,
)
from app.services import generation_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/ai",
    tags=["admin-ai"],
    dependencies=[Depends(require_admin)],
)


async def _require_generation_job(job_id: str) -> None:
    """Previous-year extraction jobs share the same collection but are managed on their own page."""
    job = await generation_service._get_job(job_id)
    if job.get("type", generation_service.JOB_TYPE) != generation_service.JOB_TYPE:
        raise ConflictError(
            "This job extracts questions from a previous-year paper. Manage it on the Previous-year papers page."
        )


@router.get("/status", response_model=AiStatusOut)
async def ai_status():
    return await generation_service.ai_status_out()


@router.post("/test", response_model=TestResult)
async def test_connection():
    """Sends one small real request to the provider (it counts toward the daily limit)."""
    return await llm_client.test_connection()


@router.get("/materials/{material_id}/overview", response_model=GenerationOverview)
async def generation_overview(material_id: str):
    return await generation_service.get_overview(material_id)


@router.post("/materials/{material_id}/generate-mcq", response_model=JobItem, status_code=201)
async def start_generation(
    material_id: str, payload: StartGenerationRequest, admin: dict = Depends(require_admin)
):
    return await generation_service.start_job(material_id, payload.questions_per_chunk, admin)


@router.get("/materials/{material_id}/questions", response_model=GeneratedQuestionList)
async def generated_questions(
    material_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
):
    return await generation_service.list_generated_questions(material_id, page, page_size)


@router.post("/jobs/{job_id}/resume", response_model=JobItem)
async def resume_generation(job_id: str):
    await _require_generation_job(job_id)
    return await generation_service.resume_job(job_id)


@router.post("/jobs/{job_id}/stop", response_model=JobItem)
async def stop_generation(job_id: str):
    await _require_generation_job(job_id)
    return await generation_service.stop_job(job_id)