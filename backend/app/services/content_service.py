"""Subjects and chapters: admin management and student reading."""
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError, NotFoundError
from app.db.mongo import get_db
from app.schemas.content import ChapterIn, SubjectIn
from app.services.progress_service import (
    completed_chapter_ids,
    percent,
    set_chapter_completion,
)

SUBJECT_SORT = [("order", 1), ("name", 1)]
CHAPTER_SORT = [("order", 1), ("_id", 1)]


# ---------- helpers ----------
def _oid(value: str, what: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise NotFoundError(f"{what} not found.")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def make_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "subject"


async def _next_order(collection, query: dict) -> int:
    top = await collection.find_one(query, {"order": 1}, sort=[("order", -1)])
    return (top.get("order", 0) + 1) if top else 1


async def _get_subject(subject_id: str) -> dict:
    subject = await get_db()["subjects"].find_one({"_id": _oid(subject_id, "Subject")})
    if subject is None:
        raise NotFoundError("Subject not found.")
    return subject


def _subject_ref(subject: dict) -> dict:
    return {"id": str(subject["_id"]), "name": subject["name"]}


async def _chapter_counts() -> tuple[dict, dict]:
    docs = await get_db()["chapters"].find({}, {"subject_id": 1, "is_published": 1}).to_list(length=None)
    total: dict = {}
    published: dict = {}
    for doc in docs:
        sid = doc.get("subject_id")
        total[sid] = total.get(sid, 0) + 1
        if doc.get("is_published"):
            published[sid] = published.get(sid, 0) + 1
    return total, published


# ======================================================================
# ADMIN: subjects
# ======================================================================
def _admin_subject_item(doc: dict, total: int, published: int) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "slug": doc["slug"],
        "description": doc.get("description", ""),
        "order": doc.get("order", 0),
        "chapters_total": total,
        "chapters_published": published,
    }


async def admin_list_subjects() -> list[dict]:
    subjects = await get_db()["subjects"].find().sort(SUBJECT_SORT).to_list(length=None)
    total, published = await _chapter_counts()
    return [
        _admin_subject_item(s, total.get(s["_id"], 0), published.get(s["_id"], 0))
        for s in subjects
    ]


async def _assert_unique_subject_name(db, name: str, exclude_id=None) -> None:
    """Reject another subject with the same name ignoring case/whitespace."""
    key = name.strip().casefold()
    query: dict = {}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    for existing in await db["subjects"].find(query, {"name": 1}).to_list(length=None):
        if (existing.get("name") or "").strip().casefold() == key:
            raise ConflictError("A subject with this name already exists.")


async def create_subject(data: SubjectIn) -> dict:
    db = get_db()
    await _assert_unique_subject_name(db, data.name)
    order = data.order if data.order is not None else await _next_order(db["subjects"], {})
    now = _now()
    doc = {
        "name": data.name.strip(),
        "slug": make_slug(data.name),
        "description": data.description,
        "order": order,
        "created_at": now,
        "updated_at": now,
    }
    try:
        result = await db["subjects"].insert_one(doc)
    except DuplicateKeyError:
        raise ConflictError("A subject with a similar name already exists.")
    doc["_id"] = result.inserted_id
    return _admin_subject_item(doc, 0, 0)


async def update_subject(subject_id: str, data: SubjectIn) -> dict:
    db = get_db()
    subject = await _get_subject(subject_id)
    await _assert_unique_subject_name(db, data.name, exclude_id=subject["_id"])
    changes = {
        "name": data.name.strip(),
        "slug": make_slug(data.name),
        "description": data.description,
        "updated_at": _now(),
    }
    if data.order is not None:
        changes["order"] = data.order
    try:
        await db["subjects"].update_one({"_id": subject["_id"]}, {"$set": changes})
    except DuplicateKeyError:
        raise ConflictError("A subject with a similar name already exists.")

    total = await db["chapters"].count_documents({"subject_id": subject["_id"]})
    published = await db["chapters"].count_documents(
        {"subject_id": subject["_id"], "is_published": True}
    )
    return _admin_subject_item({**subject, **changes}, total, published)


async def delete_subject(subject_id: str) -> None:
    db = get_db()
    subject = await _get_subject(subject_id)
    if await db["chapters"].count_documents({"subject_id": subject["_id"]}) > 0:
        raise ConflictError("This subject still has chapters. Delete its chapters first.")
    if await db["questions"].count_documents({"subject_id": subject["_id"]}) > 0:
        raise ConflictError("This subject still has questions. Delete or move its questions first.")
    await db["subjects"].delete_one({"_id": subject["_id"]})


# ======================================================================
# ADMIN: chapters
# ======================================================================
def _admin_chapter_item(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "summary": doc.get("summary", ""),
        "order": doc.get("order", 0),
        "is_published": bool(doc.get("is_published")),
        "updated_at": doc.get("updated_at") or doc.get("created_at"),
    }


def _admin_chapter_detail(doc: dict, subject: dict) -> dict:
    return {
        **_admin_chapter_item(doc),
        "subject": _subject_ref(subject),
        "content": doc.get("content", ""),
    }


async def admin_list_chapters(subject_id: str) -> dict:
    subject = await _get_subject(subject_id)
    docs = (
        await get_db()["chapters"]
        .find({"subject_id": subject["_id"]}, {"content": 0})
        .sort(CHAPTER_SORT)
        .to_list(length=None)
    )
    return {
        "subject": _subject_ref(subject),
        "chapters": [_admin_chapter_item(d) for d in docs],
    }


async def _get_chapter(chapter_id: str) -> dict:
    chapter = await get_db()["chapters"].find_one({"_id": _oid(chapter_id, "Chapter")})
    if chapter is None:
        raise NotFoundError("Chapter not found.")
    return chapter


async def create_chapter(subject_id: str, data: ChapterIn) -> dict:
    db = get_db()
    subject = await _get_subject(subject_id)
    order = (
        data.order
        if data.order is not None
        else await _next_order(db["chapters"], {"subject_id": subject["_id"]})
    )
    now = _now()
    doc = {
        "subject_id": subject["_id"],
        "title": data.title,
        "summary": data.summary,
        "content": data.content,
        "order": order,
        "is_published": data.is_published,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["chapters"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _admin_chapter_detail(doc, subject)


async def admin_get_chapter(chapter_id: str) -> dict:
    chapter = await _get_chapter(chapter_id)
    subject = await get_db()["subjects"].find_one({"_id": chapter["subject_id"]})
    if subject is None:
        raise NotFoundError("The subject of this chapter no longer exists.")
    return _admin_chapter_detail(chapter, subject)


async def update_chapter(chapter_id: str, data: ChapterIn) -> dict:
    db = get_db()
    chapter = await _get_chapter(chapter_id)
    changes = {
        "title": data.title,
        "summary": data.summary,
        "content": data.content,
        "is_published": data.is_published,
        "updated_at": _now(),
    }
    if data.order is not None:
        changes["order"] = data.order
    await db["chapters"].update_one({"_id": chapter["_id"]}, {"$set": changes})
    subject = await db["subjects"].find_one({"_id": chapter["subject_id"]})
    if subject is None:
        raise NotFoundError("The subject of this chapter no longer exists.")
    return _admin_chapter_detail({**chapter, **changes}, subject)


async def delete_chapter(chapter_id: str) -> None:
    db = get_db()
    chapter = await _get_chapter(chapter_id)
    await db["chapters"].delete_one({"_id": chapter["_id"]})
    # Remove it from every student's completed list so progress stays accurate
    await db["users"].update_many(
        {}, {"$pull": {"chapters_completed": {"chapter_id": chapter["_id"]}}}
    )
    # Questions stay in the question bank but are no longer linked to this chapter
    await db["questions"].update_many(
        {"chapter_id": chapter["_id"]}, {"$set": {"chapter_id": None}}
    )
    await db["revision_schedules"].update_many(
        {"chapter_id": chapter["_id"]}, {"$set": {"chapter_id": None}}
    )


# ======================================================================
# STUDENT: reading
# ======================================================================
async def list_subjects_for_student(user: dict) -> list[dict]:
    db = get_db()
    subjects = await db["subjects"].find().sort(SUBJECT_SORT).to_list(length=None)
    chapters = await db["chapters"].find({"is_published": True}, {"subject_id": 1}).to_list(length=None)
    completed = completed_chapter_ids(user)

    total: dict = {}
    done: dict = {}
    for chapter in chapters:
        sid = chapter.get("subject_id")
        total[sid] = total.get(sid, 0) + 1
        if chapter["_id"] in completed:
            done[sid] = done.get(sid, 0) + 1

    items = []
    for s in subjects:
        t = total.get(s["_id"], 0)
        c = done.get(s["_id"], 0)
        items.append(
            {
                "id": str(s["_id"]),
                "name": s["name"],
                "slug": s["slug"],
                "description": s.get("description", ""),
                "chapters_total": t,
                "chapters_completed": c,
                "progress_percent": percent(c, t),
            }
        )
    return items


async def get_subject_for_student(user: dict, subject_id: str) -> dict:
    subject = await _get_subject(subject_id)
    docs = (
        await get_db()["chapters"]
        .find({"subject_id": subject["_id"], "is_published": True}, {"content": 0})
        .sort(CHAPTER_SORT)
        .to_list(length=None)
    )
    completed = completed_chapter_ids(user)
    chapters = [
        {
            "id": str(d["_id"]),
            "title": d["title"],
            "summary": d.get("summary", ""),
            "order": d.get("order", 0),
            "is_completed": d["_id"] in completed,
        }
        for d in docs
    ]
    done = sum(1 for c in chapters if c["is_completed"])
    return {
        "id": str(subject["_id"]),
        "name": subject["name"],
        "slug": subject["slug"],
        "description": subject.get("description", ""),
        "chapters_total": len(chapters),
        "chapters_completed": done,
        "progress_percent": percent(done, len(chapters)),
        "chapters": chapters,
    }


async def _get_published_chapter(chapter_id: str) -> dict:
    chapter = await get_db()["chapters"].find_one(
        {"_id": _oid(chapter_id, "Chapter"), "is_published": True}
    )
    if chapter is None:
        raise NotFoundError("Chapter not found.")
    return chapter


async def get_chapter_for_student(user: dict, chapter_id: str) -> dict:
    db = get_db()
    chapter = await _get_published_chapter(chapter_id)
    subject = await db["subjects"].find_one({"_id": chapter["subject_id"]})
    if subject is None:
        raise NotFoundError("Chapter not found.")

    siblings = (
        await db["chapters"]
        .find({"subject_id": chapter["subject_id"], "is_published": True}, {"title": 1})
        .sort(CHAPTER_SORT)
        .to_list(length=None)
    )
    ids = [s["_id"] for s in siblings]
    index = ids.index(chapter["_id"]) if chapter["_id"] in ids else -1

    def ref(doc):
        return {"id": str(doc["_id"]), "title": doc["title"]}

    return {
        "id": str(chapter["_id"]),
        "title": chapter["title"],
        "summary": chapter.get("summary", ""),
        "content": chapter.get("content", ""),
        "order": chapter.get("order", 0),
        "subject": _subject_ref(subject),
        "is_completed": chapter["_id"] in completed_chapter_ids(user),
        "prev_chapter": ref(siblings[index - 1]) if index > 0 else None,
        "next_chapter": ref(siblings[index + 1]) if 0 <= index < len(siblings) - 1 else None,
    }


async def set_completion(user: dict, chapter_id: str, completed: bool) -> dict:
    chapter = await _get_published_chapter(chapter_id)
    await set_chapter_completion(user["_id"], chapter["_id"], completed)
    return {"chapter_id": str(chapter["_id"]), "is_completed": completed}