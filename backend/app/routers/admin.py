from fastapi import APIRouter, Depends

from app.core.deps import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/ping")
async def admin_ping(admin: dict = Depends(require_admin)):
    """Temporary route that exists only to prove the admin check works."""
    return {"message": "Admin access confirmed.", "admin_email": admin["email"]}
