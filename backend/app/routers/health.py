from fastapi import APIRouter

from app.core.config import settings
from app.db.mongo import ping_database

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    db_ok = await ping_database()
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.environment,
        "database": "connected" if db_ok else "unavailable",
        "utf8_check": "বাংলা ও English",
    }
