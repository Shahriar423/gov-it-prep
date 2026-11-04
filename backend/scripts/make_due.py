"""Development helper: makes a user's active weak spots due right now, so the
revision quiz can be tested without waiting 2 days.

Run from the backend folder:  python -m scripts.make_due student@example.com
It only works when ENVIRONMENT=development in backend/.env."""
import asyncio
import sys
from datetime import datetime, timedelta, timezone

from pymongo.errors import PyMongoError

from app.core.config import settings
from app.db.mongo import close_mongo, connect_to_mongo, get_db


async def main(email: str) -> int:
    if settings.environment != "development":
        print("REFUSED: this helper only runs when ENVIRONMENT=development.")
        return 1

    await connect_to_mongo()
    try:
        db = get_db()
        user = await db["users"].find_one({"email": email.strip().lower()}, {"_id": 1})
        if user is None:
            print("FAIL: no user with that email.")
            return 1

        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        result = await db["revision_schedules"].update_many(
            {"user_id": user["_id"], "status": "active"},
            {"$set": {"next_review_at": past}},
        )
        print(f"OK: {result.modified_count} weak spot(s) are now due.")
        return 0
    except PyMongoError:
        print("FAIL: database error. Check MONGODB_URI and Atlas Network Access.")
        return 1
    finally:
        await close_mongo()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.make_due student@example.com")
        raise SystemExit(1)
    raise SystemExit(asyncio.run(main(sys.argv[1])))