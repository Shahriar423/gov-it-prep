"""Checks and creates the standard exam structure: the three Non-Technical subjects and the
standard Technical chapters. Nothing is ever deleted or renamed, and running it twice is safe."""
import uuid
from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.core.constants import (
    LEGACY_TECHNICAL_SUBJECT_NAME,
    NON_TECHNICAL_SUBJECTS,
    TECHNICAL_CHAPTERS,
    TECHNICAL_SUBJECT_NAME,
)
from app.core.errors import ConflictError
from app.db.mongo import get_db
from app.services.content_service import make_slug

NON_TECH_KEYS = {name.casefold() for name in NON_TECHNICAL_SUBJECTS}
STANDARD_KEYS = {title.casefold() for title in TECHNICAL_CHAPTERS}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key(text: str) -> str:
    return text.strip().casefold()


async def get_structure() -> dict:
    db = get_db()
    subjects = await db["subjects"].find({}, {"name": 1}).sort([("order", 1), ("name", 1)]).to_list(length=None)
    chapters = await db["chapters"].find({}, {"title": 1, "subject_id": 1}).to_list(length=None)

    technical = [s for s in subjects if _key(s["name"]) not in NON_TECH_KEYS]
    technical_ids = {s["_id"] for s in technical}
    non_technical_by_key = {_key(s["name"]): s for s in subjects if _key(s["name"]) in NON_TECH_KEYS}

    technical_chapter_keys = {_key(c["title"]) for c in chapters if c["subject_id"] in technical_ids}
    chapter_counts: dict = {}
    for chapter in chapters:
        chapter_counts[chapter["subject_id"]] = chapter_counts.get(chapter["subject_id"], 0) + 1

    non_technical = [
        {
            "name": name,
            "exists": name.casefold() in non_technical_by_key,
            "subject_id": (
                str(non_technical_by_key[name.casefold()]["_id"])
                if name.casefold() in non_technical_by_key
                else None
            ),
        }
        for name in NON_TECHNICAL_SUBJECTS
    ]
    standard = [{"title": title, "exists": title.casefold() in technical_chapter_keys} for title in TECHNICAL_CHAPTERS]
    extra = sum(
        1 for c in chapters if c["subject_id"] in technical_ids and _key(c["title"]) not in STANDARD_KEYS
    )

    return {
        "non_technical": non_technical,
        "technical_subjects": [
            {"id": str(s["_id"]), "name": s["name"], "chapters_total": chapter_counts.get(s["_id"], 0)}
            for s in technical
        ],
        "technical_chapters": standard,
        "extra_technical_chapters": extra,
        "complete": all(n["exists"] for n in non_technical) and all(c["exists"] for c in standard),
    }


async def _create_subject(name: str) -> dict:
    db = get_db()
    top = await db["subjects"].find_one({}, {"order": 1}, sort=[("order", -1)])
    order = (top.get("order", 0) + 1) if top else 1
    now = _now()
    base_slug = make_slug(name)

    for attempt in range(3):
        slug = base_slug if attempt == 0 else f"{base_slug}-{uuid.uuid4().hex[:4]}"
        doc = {
            "name": name,
            "slug": slug,
            "description": "",
            "order": order,
            "created_at": now,
            "updated_at": now,
        }
        try:
            result = await db["subjects"].insert_one(doc)
        except DuplicateKeyError:
            continue  # the slug is taken: try again with a different one
        doc["_id"] = result.inserted_id
        return doc
    raise ConflictError("Could not create the subject. Please try again.")


async def seed_structure() -> dict:
    db = get_db()
    subjects = await db["subjects"].find({}, {"name": 1}).to_list(length=None)
    existing_keys = {_key(s["name"]) for s in subjects}
    created_subjects: list[str] = []

    # Non-Technical: exactly Bangla, English and General Knowledge
    for name in NON_TECHNICAL_SUBJECTS:
        if name.casefold() not in existing_keys:
            await _create_subject(name)
            created_subjects.append(name)

    # Technical: add only the standard chapters that are missing from every Technical subject
    technical = [s for s in subjects if _key(s["name"]) not in NON_TECH_KEYS]
    technical_ids = [s["_id"] for s in technical]
    chapters = (
        await db["chapters"].find({"subject_id": {"$in": technical_ids}}, {"title": 1}).to_list(length=None)
        if technical_ids
        else []
    )
    present = {_key(c["title"]) for c in chapters}
    missing = [title for title in TECHNICAL_CHAPTERS if title.casefold() not in present]

    created_chapters = 0
    if missing:
        # Prefer the canonical IT subject; fall back to the legacy "Technical" name
        # so a renamed DB still receives missing chapters without creating a duplicate.
        canonical_key = TECHNICAL_SUBJECT_NAME.casefold()
        legacy_key = LEGACY_TECHNICAL_SUBJECT_NAME.casefold()
        holder = next((s for s in technical if _key(s["name"]) == canonical_key), None)
        if holder is None:
            holder = next((s for s in technical if _key(s["name"]) == legacy_key), None)
        if holder is None:
            holder = await _create_subject(TECHNICAL_SUBJECT_NAME)
            created_subjects.append(TECHNICAL_SUBJECT_NAME)

        top = await db["chapters"].find_one({"subject_id": holder["_id"]}, {"order": 1}, sort=[("order", -1)])
        start = (top.get("order", 0) + 1) if top else 1
        now = _now()
        docs = [
            {
                "subject_id": holder["_id"],
                "title": title,
                "summary": "",
                "content": "",
                "order": start + index,
                # Unpublished, so students do not see empty chapters in Subjects.
                # The exam builder lists chapters whether or not they are published.
                "is_published": False,
                "created_at": now,
                "updated_at": now,
            }
            for index, title in enumerate(missing)
        ]
        await db["chapters"].insert_many(docs)
        created_chapters = len(docs)

    return {
        "created_subjects": created_subjects,
        "created_chapters": created_chapters,
        "structure": await get_structure(),
    }