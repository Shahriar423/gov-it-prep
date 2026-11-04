"""Chapter-completion helpers shared by the dashboard and the content pages."""
from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongo import get_db


def percent(part: int, whole: int) -> int:
    return round(part * 100 / whole) if whole else 0


def completed_chapter_ids(user: dict) -> set:
    """users.chapters_completed holds entries like {chapter_id, completed_at}."""
    ids = set()
    for entry in user.get("chapters_completed") or []:
        raw = entry.get("chapter_id") if isinstance(entry, dict) else entry
        if isinstance(raw, ObjectId):
            ids.add(raw)
        elif isinstance(raw, str) and ObjectId.is_valid(raw):
            ids.add(ObjectId(raw))
    return ids


async def set_chapter_completion(user_id: ObjectId, chapter_id: ObjectId, completed: bool) -> None:
    users = get_db()["users"]
    if completed:
        # The $ne filter makes this safe to repeat: it never adds a chapter twice
        await users.update_one(
            {"_id": user_id, "chapters_completed.chapter_id": {"$ne": chapter_id}},
            {
                "$push": {
                    "chapters_completed": {
                        "chapter_id": chapter_id,
                        "completed_at": datetime.now(timezone.utc),
                    }
                }
            },
        )
    else:
        await users.update_one(
            {"_id": user_id},
            {"$pull": {"chapters_completed": {"chapter_id": chapter_id}}},
        )