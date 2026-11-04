from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response

from app.core.deps import get_current_user
from app.core.errors import BadRequestError
from app.schemas.auth import UserPublic
from app.schemas.profile import PasswordChange, ProfileUpdate
from app.services import auth_service, profile_service

router = APIRouter(prefix="/api/users", tags=["users"])

MAX_AVATAR_BYTES = 2 * 1024 * 1024


@router.put("/me", response_model=UserPublic)
async def update_me(payload: ProfileUpdate, user: dict = Depends(get_current_user)):
    updated = await profile_service.update_profile(user, payload)
    return auth_service.to_public_user(updated)


@router.post("/me/password")
async def change_my_password(payload: PasswordChange, user: dict = Depends(get_current_user)):
    await profile_service.change_password(user, payload.current_password, payload.new_password)
    return {"message": "Password updated."}


@router.post("/me/avatar", response_model=UserPublic)
async def upload_my_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    data = await file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise BadRequestError("Avatar must be 2 MB or smaller.")
    updated = await profile_service.upload_avatar(user, data, content_type)
    return auth_service.to_public_user(updated)


@router.delete("/me/avatar", response_model=UserPublic)
async def delete_my_avatar(user: dict = Depends(get_current_user)):
    updated = await profile_service.delete_avatar(user)
    return auth_service.to_public_user(updated)


@router.get("/{user_id}/avatar")
async def get_user_avatar(user_id: str):
    """Public avatar image (no auth required) so <img src> works without tokens."""
    data, content_type = await profile_service.get_avatar_stream(user_id)
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )