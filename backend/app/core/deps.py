"""Reusable checks: 'must be logged in' and 'must be admin'."""
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token
from app.db.mongo import get_db

# auto_error=False so we return one consistent 401 for every failure case
bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Not authenticated.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise _unauthorized()

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise _unauthorized()

    try:
        object_id = ObjectId(user_id)
    except (InvalidId, TypeError):
        raise _unauthorized()

    # The role is read from the database on every request, so changing a
    # user's role takes effect immediately.
    user = await get_db()["users"].find_one({"_id": object_id})
    if user is None:
        raise _unauthorized()
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user
