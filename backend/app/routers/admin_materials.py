from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import ValidationError

from app.core.deps import require_admin
from app.core.errors import BadRequestError
from app.schemas.material import (
    ChunkList,
    MaterialDetail,
    MaterialKind,
    MaterialList,
    MaterialMeta,
    MaterialOptions,
    describe_validation_error,
)
from app.services import extraction_service, material_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/materials",
    tags=["admin-materials"],
    dependencies=[Depends(require_admin)],
)


def _build_meta(title, kind, subject_id, chapter_id, exam_tags, year) -> MaterialMeta:
    """Builds and validates the details sent with the upload form."""
    year_value = None
    if year not in (None, ""):
        try:
            year_value = int(year)
        except ValueError:
            raise BadRequestError("Year must be a number.")
    try:
        return MaterialMeta(
            title=title,
            kind=kind,
            subject_id=subject_id,
            chapter_id=chapter_id or None,
            exam_tags=exam_tags or [],
            year=year_value,
        )
    except ValidationError as error:
        raise BadRequestError(describe_validation_error(error))


def _paper_type_for(kind: str, value: str | None) -> str | None:
    """Only previous-year PDFs have a question paper type. It defaults to MCQ."""
    if kind != "previous_year":
        return None
    chosen = (value or "mcq").strip().lower()
    if chosen not in ("mcq", "written"):
        raise BadRequestError("The question paper type must be MCQ or Written.")
    return chosen


@router.get("/options", response_model=MaterialOptions)
async def material_options():
    return material_service.get_options()


@router.get("", response_model=MaterialList)
async def list_materials(
    kind: MaterialKind | None = None,
    status: Literal["processing", "ready", "failed"] | None = None,
    subject_id: str | None = None,
    exam: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
):
    return await material_service.list_materials(
        kind=kind,
        status=status,
        subject_id=subject_id,
        exam=exam,
        search=q,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=MaterialDetail, status_code=201)
async def upload_material(
    title: str = Form(...),
    kind: str = Form(...),
    subject_id: str = Form(...),
    chapter_id: str | None = Form(default=None),
    exam_tags: list[str] | None = Form(default=None),
    year: str | None = Form(default=None),
    paper_type: str | None = Form(default=None),
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    meta = _build_meta(title, kind, subject_id, chapter_id, exam_tags, year)
    chosen_type = _paper_type_for(meta.kind, paper_type)
    data, filename = await material_service.read_pdf_upload(file)
    material = await material_service.upload_material(meta, data, filename, admin)

    if chosen_type is not None:
        # The type is saved before the PDF is queued, so extraction always uses the right parser
        await extraction_service.set_paper_type(material["id"], chosen_type)
        if material["status"] == "ready":
            await extraction_service.queue_material(material["id"])
    return material


@router.get("/{material_id}", response_model=MaterialDetail)
async def get_material(material_id: str):
    return await material_service.get_material(material_id)


@router.put("/{material_id}", response_model=MaterialDetail)
async def update_material(material_id: str, payload: MaterialMeta):
    return await material_service.update_material(material_id, payload)


@router.get("/{material_id}/chunks", response_model=ChunkList)
async def list_chunks(
    material_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
):
    return await material_service.list_chunks(material_id, page, page_size)


@router.post("/{material_id}/reprocess", response_model=MaterialDetail)
async def reprocess_material(material_id: str, file: UploadFile = File(...)):
    data, filename = await material_service.read_pdf_upload(file)
    material = await material_service.reprocess_material(material_id, data, filename)
    if material["kind"] == "previous_year" and material["status"] == "ready":
        await extraction_service.queue_material(material["id"])
    return material


@router.delete("/{material_id}", status_code=204)
async def delete_material(material_id: str):
    # Extracted questions that nobody reviewed yet must not be lost
    await extraction_service.assert_deletable(material_id)
    # Questions already approved from this material stay in the question banks
    await material_service.delete_material(material_id)