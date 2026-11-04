"""Profile updates: name, password, and avatar (PyMongo async GridFS)."""
from datetime import datetime, timezone

from bson import ObjectId
from gridfs.asynchronous import AsyncGridFSBucket

from app.core.errors import BadRequestError, NotFoundError
from app.core.security import hash_password_async, verify_password_async
from app.db.mongo import get_db
from app.schemas.profile import ProfileUpdate

ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB


def _fs() -> AsyncGridFSBucket:
    """GridFS bucket on the same AsyncDatabase used by the rest of the app."""
    return AsyncGridFSBucket(get_db(), bucket_name="avatars")


async def update_profile(user: dict, data: ProfileUpdate) -> dict:
    changes = {"name": data.name, "target_exam": data.target_exam}
    await get_db()["users"].update_one({"_id": user["_id"]}, {"$set": changes})
    return {**user, **changes}


async def change_password(user: dict, current_password: str, new_password: str) -> None:
    if not await verify_password_async(current_password, user["password_hash"]):
        raise BadRequestError("Your current password is incorrect.")
    if await verify_password_async(new_password, user["password_hash"]):
        raise BadRequestError("The new password must be different from the current one.")

    new_hash = await hash_password_async(new_password)
    await get_db()["users"].update_one({"_id": user["_id"]}, {"$set": {"password_hash": new_hash}})


async def _delete_grid_file(fs: AsyncGridFSBucket, file_id) -> None:
    """Best-effort delete of a GridFS file (ignore missing/orphan)."""
    if not file_id:
        return
    try:
        oid = file_id if isinstance(file_id, ObjectId) else ObjectId(str(file_id))
        await fs.delete(oid)
    except Exception:
        pass


async def upload_avatar(user: dict, data: bytes, content_type: str) -> dict:
    if content_type not in ALLOWED_AVATAR_TYPES:
        raise BadRequestError("Avatar must be a JPG, PNG, or WebP image.")
    if not data:
        raise BadRequestError("Empty file.")
    if len(data) > MAX_AVATAR_BYTES:
        raise BadRequestError("Avatar must be 2 MB or smaller.")

    # Basic magic-byte check (do not trust Content-Type alone)
    if content_type == "image/jpeg" and not data.startswith(b"\xff\xd8"):
        raise BadRequestError("File content is not a valid JPEG image.")
    if content_type == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise BadRequestError("File content is not a valid PNG image.")
    if content_type == "image/webp" and not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        raise BadRequestError("File content is not a valid WebP image.")

    fs = _fs()
    old_id = user.get("avatar_file_id")
    filename = f"avatar_{user['_id']}{ALLOWED_AVATAR_TYPES[content_type]}"

    file_id = await fs.upload_from_stream(
        filename,
        data,
        metadata={
            "user_id": str(user["_id"]),
            "content_type": content_type,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    await get_db()["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"avatar_file_id": file_id, "avatar_content_type": content_type}},
    )

    # Remove previous GridFS object so replacements do not leave orphans
    await _delete_grid_file(fs, old_id)

    return {
        **user,
        "avatar_file_id": file_id,
        "avatar_content_type": content_type,
    }


async def delete_avatar(user: dict) -> dict:
    file_id = user.get("avatar_file_id")
    if not file_id:
        return user

    fs = _fs()
    await _delete_grid_file(fs, file_id)

    await get_db()["users"].update_one(
        {"_id": user["_id"]},
        {"$unset": {"avatar_file_id": "", "avatar_content_type": ""}},
    )
    updated = {**user}
    updated.pop("avatar_file_id", None)
    updated.pop("avatar_content_type", None)
    return updated


async def get_avatar_stream(user_id: str) -> tuple[bytes, str]:
    """Return (bytes, content_type) for a user's avatar, or raise NotFoundError."""
    try:
        oid = ObjectId(user_id)
    except Exception as exp:
        raise NotFoundError("User not found.") from exp

    user = await get_db()["users"].find_one(
        {"_id": oid}, {"avatar_file_id": 1, "avatar_content_type": 1}
    )
    if not user or not user.get("avatar_file_id"):
        raise NotFoundError("No profile picture.")

    fs = _fs()
    file_id = user["avatar_file_id"]
    if not isinstance(file_id, ObjectId):
        file_id = ObjectId(str(file_id))

    try:
        grid_out = await fs.open_download_stream(file_id)
    except Exception as exp:
        raise NotFoundError("No profile picture.") from exp

    chunks: list[bytes] = []
    while True:
        chunk = await grid_out.read(256 * 1024)
        if not chunk:
            break
        chunks.append(chunk)
    data = b"".join(chunks)
    content_type = user.get("avatar_content_type") or "image/jpeg"
    return data, content_type