from fastapi import APIRouter, Depends

from app.core.deps import require_admin
from app.schemas.content import (
    AdminChapterList,
    ChapterAdminDetail,
    ChapterIn,
    SubjectAdminItem,
    SubjectIn,
)
from app.services import content_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin",
    tags=["admin-content"],
    dependencies=[Depends(require_admin)],
)


# ---------- subjects ----------
@router.get("/subjects", response_model=list[SubjectAdminItem])
async def admin_list_subjects():
    return await content_service.admin_list_subjects()


@router.post("/subjects", response_model=SubjectAdminItem, status_code=201)
async def admin_create_subject(payload: SubjectIn):
    return await content_service.create_subject(payload)


@router.put("/subjects/{subject_id}", response_model=SubjectAdminItem)
async def admin_update_subject(subject_id: str, payload: SubjectIn):
    return await content_service.update_subject(subject_id, payload)


@router.delete("/subjects/{subject_id}", status_code=204)
async def admin_delete_subject(subject_id: str):
    await content_service.delete_subject(subject_id)


# ---------- chapters ----------
@router.get("/subjects/{subject_id}/chapters", response_model=AdminChapterList)
async def admin_list_chapters(subject_id: str):
    return await content_service.admin_list_chapters(subject_id)


@router.post("/subjects/{subject_id}/chapters", response_model=ChapterAdminDetail, status_code=201)
async def admin_create_chapter(subject_id: str, payload: ChapterIn):
    return await content_service.create_chapter(subject_id, payload)


@router.get("/chapters/{chapter_id}", response_model=ChapterAdminDetail)
async def admin_get_chapter(chapter_id: str):
    return await content_service.admin_get_chapter(chapter_id)


@router.put("/chapters/{chapter_id}", response_model=ChapterAdminDetail)
async def admin_update_chapter(chapter_id: str, payload: ChapterIn):
    return await content_service.update_chapter(chapter_id, payload)


@router.delete("/chapters/{chapter_id}", status_code=204)
async def admin_delete_chapter(chapter_id: str):
    await content_service.delete_chapter(chapter_id)