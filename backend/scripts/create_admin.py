"""Create the first admin (or promote an existing user).
Run from the backend folder:  python -m scripts.create_admin
The password is typed hidden and is never saved in any file."""
import asyncio
import getpass
from datetime import datetime, timezone

from pydantic import EmailStr, TypeAdapter, ValidationError
from pymongo.errors import PyMongoError

from app.core.security import hash_password
from app.db.indexes import ensure_indexes
from app.db.mongo import close_mongo, connect_to_mongo, get_db
from app.schemas.auth import validate_password


async def main() -> int:
    name = input("Admin name: ").strip()
    if len(name) < 2:
        print("FAIL: name must be at least 2 characters.")
        return 1

    try:
        email = TypeAdapter(EmailStr).validate_python(input("Admin email: ").strip()).lower()
    except ValidationError:
        print("FAIL: that is not a valid email address.")
        return 1

    await connect_to_mongo()
    try:
        await ensure_indexes()
        users = get_db()["users"]
        existing = await users.find_one({"email": email})

        if existing:
            if existing.get("role") == "admin":
                print("This user is already an admin. Nothing changed.")
                return 0
            answer = input("A student with this email exists. Promote to admin? (yes/no): ")
            if answer.strip().lower() != "yes":
                print("Cancelled. Nothing changed.")
                return 0
            await users.update_one({"_id": existing["_id"]}, {"$set": {"role": "admin"}})
            print("OK: user promoted to admin (password unchanged).")
            return 0

        password = getpass.getpass("Password (typing is hidden): ")
        if password != getpass.getpass("Repeat password: "):
            print("FAIL: passwords do not match.")
            return 1
        try:
            validate_password(password)
        except ValueError as e:
            print(f"FAIL: {e}")
            return 1

        await users.insert_one(
            {
                "name": name,
                "email": email,
                "password_hash": hash_password(password),
                "role": "admin",
                "target_exam": None,
                "chapters_completed": [],
                "created_at": datetime.now(timezone.utc),
            }
        )
        print(f"OK: admin account created for {email}")
        return 0
    except PyMongoError:
        print("FAIL: database error. Check MONGODB_URI and Atlas Network Access.")
        return 1
    finally:
        await close_mongo()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
