"""Admin management of the written question bank (every question is worth exactly 10 marks)."""
import re
from datetime import datetime, timezone

from app.core.constants import WRITTEN_MARKS_PER_QUESTION
from app.core.errors import BadRequestError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.written import WrittenQuestionIn

SORT = [("created_at", -1), ("_id", -1)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_refs(subject_id: str, chapter_id: str | None):
    db = get_db()
    sid = parse_object_id(subject_id, BadRequestError, "Please choose a valid subject.")
    subject = await db["subjects"].find_one({"_id": sid})
    if subject is None:
        raise BadRequestError("The selected subject does not exist.")

    chapter = None
    if chapter_id:
        cid = parse_object_id(chapter_id, BadRequestError, "Please choose a valid chapter.")
        chapter = await db["chapters"].find_one({"_id": cid, "subject_id": sid})
        if chapter is None:
            raise BadRequestError("The selected chapter does not belong to this subject.")
    return subject, chapter


def _item(doc: dict, subject: dict | None, chapter: dict | None) -> dict:
    return {
        "id": str(doc["_id"]),
        "subject": (
            {"id": str(subject["_id"]), "name": subject["name"]}
            if subject
            else {"id": str(doc["subject_id"]), "name": "Unknown subject"}
        ),
        "chapter": ({"id": str(chapter["_id"]), "title": chapter["title"]} if chapter else None),
        "text": doc["text"],
        "marks": WRITTEN_MARKS_PER_QUESTION,
        "difficulty": doc.get("difficulty", "medium"),
        "status": doc.get("status", "draft"),
        "source": doc.get("source", "manual"),
        "created_at": doc["created_at"],
        "updated_at": doc.get("updated_at") or doc["created_at"],
    }


async def _get_doc(question_id: str) -> dict:
    qid = parse_object_id(question_id, NotFoundError, "Written question not found.")
    doc = await get_db()["written_questions"].find_one({"_id": qid})
    if doc is None:
        raise NotFoundError("Written question not found.")
    return doc


async def _lookup_refs(doc: dict) -> tuple[dict | None, dict | None]:
    db = get_db()
    subject = await db["subjects"].find_one({"_id": doc["subject_id"]})
    chapter = None
    if doc.get("chapter_id"):
        chapter = await db["chapters"].find_one({"_id": doc["chapter_id"]})
    return subject, chapter


async def list_questions(
    *,
    subject_id: str | None,
    chapter_id: str | None,
    status: str | None,
    difficulty: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> dict:
    db = get_db()
    query: dict = {}
    if subject_id:
        query["subject_id"] = parse_object_id(subject_id, BadRequestError, "Invalid subject filter.")
    if chapter_id:
        query["chapter_id"] = parse_object_id(chapter_id, BadRequestError, "Invalid chapter filter.")
    if status:
        query["status"] = status
    if difficulty:
        query["difficulty"] = difficulty
    term = (search or "").strip()[:100]
    if term:
        query["text"] = {"$regex": re.escape(term), "$options": "i"}

    collection = db["written_questions"]
    total = await collection.count_documents(query)
    docs = (
        await collection.find(query)
        .sort(SORT)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(length=None)
    )

    subject_ids = list({d["subject_id"] for d in docs})
    chapter_ids = list({d["chapter_id"] for d in docs if d.get("chapter_id")})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    chapters = (
        await db["chapters"].find({"_id": {"$in": chapter_ids}}, {"title": 1}).to_list(length=None)
        if chapter_ids
        else []
    )
    subject_map = {s["_id"]: s for s in subjects}
    chapter_map = {c["_id"]: c for c in chapters}

    return {
        "items": [
            _item(d, subject_map.get(d["subject_id"]), chapter_map.get(d.get("chapter_id"))) for d in docs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def create_question(data: WrittenQuestionIn, admin: dict) -> dict:
    subject, chapter = await _resolve_refs(data.subject_id, data.chapter_id)
    now = _now()
    doc = {
        "subject_id": subject["_id"],
        "chapter_id": chapter["_id"] if chapter else None,
        "text": data.text,
        "difficulty": data.difficulty,
        "status": data.status,
        "source": "manual",
        "created_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
    }
    result = await get_db()["written_questions"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _item(doc, subject, chapter)


async def get_question(question_id: str) -> dict:
    doc = await _get_doc(question_id)
    subject, chapter = await _lookup_refs(doc)
    return _item(doc, subject, chapter)


async def update_question(question_id: str, data: WrittenQuestionIn) -> dict:
    doc = await _get_doc(question_id)
    subject, chapter = await _resolve_refs(data.subject_id, data.chapter_id)
    changes = {
        "subject_id": subject["_id"],
        "chapter_id": chapter["_id"] if chapter else None,
        "text": data.text,
        "difficulty": data.difficulty,
        "status": data.status,
        "updated_at": _now(),
    }
    await get_db()["written_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return _item({**doc, **changes}, subject, chapter)


async def set_status(question_id: str, status: str) -> dict:
    doc = await _get_doc(question_id)
    changes = {"status": status, "updated_at": _now()}
    await get_db()["written_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    subject, chapter = await _lookup_refs(doc)
    return _item({**doc, **changes}, subject, chapter)


async def delete_question(question_id: str) -> None:
    doc = await _get_doc(question_id)
    await get_db()["written_questions"].delete_one({"_id": doc["_id"]})