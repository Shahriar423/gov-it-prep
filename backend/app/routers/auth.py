from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(payload: RegisterRequest):
    try:
        user = await auth_service.register_user(payload)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    return TokenResponse(
        access_token=create_access_token(str(user["_id"])),
        user=auth_service.to_public_user(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await auth_service.authenticate_user(payload.email, payload.password)
    if user is None:
        # Same message for "unknown email" and "wrong password" on purpose
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    return TokenResponse(
        access_token=create_access_token(str(user["_id"])),
        user=auth_service.to_public_user(user),
    )


@router.get("/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return auth_service.to_public_user(user)
