"""Business logic for registration and login."""
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.core.security import (
    burn_password_check,
    hash_password_async,
    verify_password_async,
)
from app.db.mongo import get_db
from app.schemas.auth import RegisterRequest, UserPublic


class EmailAlreadyRegistered(Exception):
    pass


def normalize_email(email: str) -> str:
    return str(email).strip().lower()


def to_public_user(doc: dict) -> UserPublic:
    avatar_url = None
    if doc.get("avatar_file_id"):
        avatar_url = f"/api/users/{doc['_id']}/avatar"
    return UserPublic(
        id=str(doc["_id"]),
        name=doc["name"],
        email=doc["email"],
        role=doc["role"],
        target_exam=doc.get("target_exam"),
        avatar_url=avatar_url,
        created_at=doc["created_at"],
    )


async def register_user(data: RegisterRequest) -> dict:
    users = get_db()["users"]
    email = normalize_email(data.email)

    if await users.find_one({"email": email}, {"_id": 1}):
        raise EmailAlreadyRegistered()

    doc = {
        "name": data.name,
        "email": email,
        "password_hash": await hash_password_async(data.password),
        "role": "student",  # always student; admins are created with scripts/create_admin.py
        "target_exam": data.target_exam,
        "chapters_completed": [],
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await users.insert_one(doc)
    except DuplicateKeyError:
        # Two people registered the same email at the same moment
        raise EmailAlreadyRegistered()
    doc["_id"] = result.inserted_id
    return doc


async def authenticate_user(email: str, password: str) -> dict | None:
    user = await get_db()["users"].find_one({"email": normalize_email(email)})
    if user is None:
        await burn_password_check(password)
        return None
    if not await verify_password_async(password, user["password_hash"]):
        return None
    return user