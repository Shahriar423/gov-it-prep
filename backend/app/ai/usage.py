"""Counts AI requests per day (UTC) in the database, so a daily cap survives server restarts."""
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.ai.errors import AiQuotaError
from app.db.mongo import get_db


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def reserve_request(daily_limit: int) -> int:
    """Counts one request. Raises AiQuotaError when today's limit is already reached."""
    day = _today()
    try:
        doc = await get_db()["ai_usage"].find_one_and_update(
            {"_id": day, "requests": {"$lt": daily_limit}},
            {"$inc": {"requests": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # The document for today exists but is already at the limit
        raise AiQuotaError(
            f"The daily limit of {daily_limit} AI requests has been reached (it resets at midnight UTC). "
            "Resume tomorrow, or raise AI_MAX_REQUESTS_PER_DAY in backend/.env if your provider allows it."
        )
    return int(doc["requests"])


async def get_used_today() -> int:
    doc = await get_db()["ai_usage"].find_one({"_id": _today()})
    return int(doc["requests"]) if doc else 0