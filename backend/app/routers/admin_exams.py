from fastapi import APIRouter, Depends

from app.core.deps import require_admin
from app.schemas.exam import ExamAdminDetail, ExamAdminItem, ExamIn
from app.services import exam_admin_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/exams",
    tags=["admin-exams"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=list[ExamAdminItem])
async def list_exams():
    return await exam_admin_service.list_exams()


@router.post("", response_model=ExamAdminDetail, status_code=201)
async def create_exam(payload: ExamIn, admin: dict = Depends(require_admin)):
    return await exam_admin_service.create_exam(payload, admin)


@router.get("/{exam_id}", response_model=ExamAdminDetail)
async def get_exam(exam_id: str):
    return await exam_admin_service.get_exam(exam_id)


@router.put("/{exam_id}", response_model=ExamAdminDetail)
async def update_exam(exam_id: str, payload: ExamIn):
    return await exam_admin_service.update_exam(exam_id, payload)


@router.delete("/{exam_id}", status_code=204)
async def delete_exam(exam_id: str):
    await exam_admin_service.delete_exam(exam_id)