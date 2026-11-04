"""Database connection test. Run from the backend folder:  python -m scripts.check_db"""
import asyncio
from datetime import datetime, timezone

from app.db.mongo import close_mongo, connect_to_mongo, get_db, ping_database

TEST_TEXT = "বাংলা ও English — সংযোগ পরীক্ষা"


async def main() -> int:
    await connect_to_mongo()
    try:
        if not await ping_database():
            print("FAIL: Could not reach MongoDB.")
            print("Check MONGODB_URI, the database password, and Atlas Network Access (your IP).")
            return 1
        print("OK: ping succeeded")

        collection = get_db()["_phase0_check"]
        result = await collection.insert_one(
            {"text": TEST_TEXT, "created_at": datetime.now(timezone.utc)}
        )
        saved = await collection.find_one({"_id": result.inserted_id})
        await collection.delete_one({"_id": result.inserted_id})

        if saved and saved["text"] == TEST_TEXT:
            print("OK: Bangla text was saved and read back correctly")
            return 0
        print("FAIL: Text read back did not match what was saved")
        return 1
    finally:
        await close_mongo()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
