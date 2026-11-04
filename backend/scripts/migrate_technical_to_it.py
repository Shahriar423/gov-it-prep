"""
One-time migration: consolidate the subject formerly named "Technical" into "IT"
and rewrite denormalized subject_name snapshots in exam attempts.

Safe to run more than once (idempotent for the common cases).

Usage (from the backend project root, with the same env/Mongo URL as the app):

    python -m app.scripts.migrate_technical_to_it

What it does:
1. Finds subjects named "Technical" and/or "IT" (case-insensitive).
2. Chooses a single canonical subject (prefers existing "IT"; otherwise renames
   "Technical" -> "IT").
3. If both documents exist, moves chapters, questions, written_questions,
   source_materials, and extracted questions that pointed at the legacy subject
   onto the canonical IT subject, then deletes the empty legacy subject.
4. Rewrites items[].subject_name "Technical" -> "IT" inside exam_attempts
   (and config_snapshot titles are left alone).
5. Does NOT delete user progress, exam history, or answers.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.db.mongo import get_db, connect_to_mongo, close_mongo

logger = logging.getLogger("migrate_technical_to_it")
logging.basicConfig(level=logging.INFO)

CANONICAL = "IT"
LEGACY = "Technical"


def _key(name: str | None) -> str:
    return (name or "").strip().casefold()


async def run() -> None:
    await connect_to_mongo()
    db = get_db()
    subjects = await db["subjects"].find({}).to_list(length=None)
    by_key = {_key(s.get("name")): s for s in subjects}

    it_doc = by_key.get(_key(CANONICAL))
    tech_doc = by_key.get(_key(LEGACY))

    if it_doc is None and tech_doc is None:
        logger.info("No subject named 'IT' or 'Technical' found. Nothing to do for subjects.")
        canonical_id = None
    elif it_doc is not None and tech_doc is None:
        logger.info("Canonical subject 'IT' already exists (id=%s). No rename needed.", it_doc["_id"])
        canonical_id = it_doc["_id"]
    elif it_doc is None and tech_doc is not None:
        # Rename Technical -> IT
        new_slug = "it"
        # Avoid slug collision
        if await db["subjects"].find_one({"slug": new_slug, "_id": {"$ne": tech_doc["_id"]}}):
            new_slug = f"it-{str(tech_doc['_id'])[-4:]}"
        await db["subjects"].update_one(
            {"_id": tech_doc["_id"]},
            {"$set": {"name": CANONICAL, "slug": new_slug, "updated_at": datetime.now(timezone.utc)}},
        )
        logger.info("Renamed subject 'Technical' -> 'IT' (id=%s, slug=%s).", tech_doc["_id"], new_slug)
        canonical_id = tech_doc["_id"]
    else:
        # Both exist: merge Technical into IT
        canonical_id = it_doc["_id"]
        legacy_id = tech_doc["_id"]
        logger.info(
            "Both 'IT' (%s) and 'Technical' (%s) exist. Merging references onto IT.",
            canonical_id,
            legacy_id,
        )
        for coll, field in (
            ("chapters", "subject_id"),
            ("questions", "subject_id"),
            ("written_questions", "subject_id"),
            ("source_materials", "subject_id"),
            ("extracted_questions", "subject_id"),
            ("extracted_written_questions", "subject_id"),
        ):
            if coll not in await db.list_collection_names():
                continue
            res = await db[coll].update_many({field: legacy_id}, {"$set": {field: canonical_id}})
            if res.modified_count:
                logger.info("  %s: moved %s document(s) to IT subject.", coll, res.modified_count)

        # Also fix materials that store subject_ids as an array if present
        if "source_materials" in await db.list_collection_names():
            await db["source_materials"].update_many(
                {"subject_ids": legacy_id},
                {"$set": {"subject_ids.$": canonical_id}},
            )

        # Delete legacy subject only if nothing still points at it
        remaining = 0
        for coll, field in (("chapters", "subject_id"), ("questions", "subject_id")):
            remaining += await db[coll].count_documents({field: legacy_id})
        if remaining == 0:
            await db["subjects"].delete_one({"_id": legacy_id})
            logger.info("Deleted empty legacy 'Technical' subject.")
        else:
            logger.warning(
                "Legacy 'Technical' subject still has %s references; left in place for manual review.",
                remaining,
            )

    # --- Rewrite denormalized subject_name snapshots in exam_attempts ---
    attempts = db["exam_attempts"]
    cursor = attempts.find({"items.subject_name": {"$regex": "^\\s*technical\\s*$", "$options": "i"}})
    updated_attempts = 0
    async for doc in cursor:
        items = doc.get("items") or []
        changed = False
        for item in items:
            name = item.get("subject_name")
            if isinstance(name, str) and name.strip().casefold() == "technical":
                item["subject_name"] = CANONICAL
                changed = True
        if changed:
            await attempts.update_one({"_id": doc["_id"]}, {"$set": {"items": items}})
            updated_attempts += 1
    logger.info("Updated subject_name snapshots in %s exam attempt(s).", updated_attempts)

    # written sessions if they store similar snapshots
    if "written_exam_sessions" in await db.list_collection_names():
        w_updated = 0
        cursor = db["written_exam_sessions"].find(
            {"items.subject_name": {"$regex": "^\\s*technical\\s*$", "$options": "i"}}
        )
        async for doc in cursor:
            items = doc.get("items") or []
            changed = False
            for item in items:
                name = item.get("subject_name")
                if isinstance(name, str) and name.strip().casefold() == "technical":
                    item["subject_name"] = CANONICAL
                    changed = True
            if changed:
                await db["written_exam_sessions"].update_one({"_id": doc["_id"]}, {"$set": {"items": items}})
                w_updated += 1
        logger.info("Updated subject_name snapshots in %s written session(s).", w_updated)

    logger.info("Migration finished. Canonical subject id: %s", canonical_id)
    await close_mongo()


if __name__ == "__main__":
    asyncio.run(run())