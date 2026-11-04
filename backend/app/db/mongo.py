from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.core.config import settings

client: AsyncMongoClient | None = None


async def connect_to_mongo() -> None:
    """Create the client. This does not connect yet, so the server can still start if Atlas is down."""
    global client
    client = AsyncMongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=5000,
        tz_aware=True,
    )


async def close_mongo() -> None:
    global client
    if client is not None:
        await client.close()
        client = None


def get_db():
    if client is None:
        raise RuntimeError("Database client is not initialised")
    return client[settings.mongodb_db_name]


async def ping_database() -> bool:
    if client is None:
        return False
    try:
        await client.admin.command("ping")
        return True
    except PyMongoError:
        return False
