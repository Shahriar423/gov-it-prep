from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.schemas.dashboard import DashboardSummary
from app.services import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(user: dict = Depends(get_current_user)):
    return await dashboard_service.build_dashboard_summary(user)