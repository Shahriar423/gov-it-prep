
import asyncio
from app.db.mongo import connect_to_mongo, get_db, close_mongo
from pymongo.errors import PyMongoError


async def main():
    await connect_to_mongo()

    try:
        db = get_db()
        result = await db.command("ping")
        print("SUCCESS: MongoDB connection works.")
        print("Ping result:", result)

    except PyMongoError as e:
        print("ERROR TYPE:", type(e).__name__)
        print("ERROR DETAILS:", str(e))

    except Exception as e:
        print("OTHER ERROR:", type(e).__name__)
        print("DETAILS:", str(e))

    finally:
        await close_mongo()


if __name__ == "__main__":
    asyncio.run(main())
