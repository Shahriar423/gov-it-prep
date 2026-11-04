from fastapi import APIRouter, Depends

from app.core.deps import require_admin
from app.schemas.structure import SeedResult, StructureOut
from app.services import structure_service

# Every route in this file requires an admin (checked on the server)
router = APIRouter(
    prefix="/api/admin/exam-structure",
    tags=["admin-structure"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=StructureOut)
async def get_structure():
    return await structure_service.get_structure()


@router.post("/seed", response_model=SeedResult)
async def seed_structure():
    return await structure_service.seed_structure()