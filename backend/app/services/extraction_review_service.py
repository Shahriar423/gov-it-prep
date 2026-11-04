"""Admin review of questions extracted from previous-year PDFs.

Extracted questions stay in `extracted_questions` as 'pending'. Only an admin's approval copies a
question into the approved question bank (`questions`), and only when it passes the same rules a
question written by hand has to pass."""
import re
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.ai import pyq_logic
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.extraction import ExtractedQuestionIn

CLEAN_BATCH = 200
SORT = [("chunk_index", 1), ("_id", 1)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _get(question_id: str) -> dict:
    qid = parse_object_id(question_id, NotFoundError, "Extracted question not found.")
    doc = await get_db()["extracted_questions"].find_one({"_id": qid})
    if doc is None:
        raise NotFoundError("Extracted question not found.")
    return doc


async def _lookup_names(docs: list[dict]) -> tuple[dict, dict]:
    db = get_db()
    subject_ids = list({d["subject_id"] for d in docs if d.get("subject_id")})
    chapter_ids = list({d["chapter_id"] for d in docs if d.get("chapter_id")})
    subjects = (
        await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
        if subject_ids
        else []
    )
    chapters = (
        await db["chapters"].find({"_id": {"$in": chapter_ids}}, {"title": 1}).to_list(length=None)
        if chapter_ids
        else []
    )
    return {s["_id"]: s["name"] for s in subjects}, {c["_id"]: c["title"] for c in chapters}


def _item(doc: dict, subject_names: dict, chapter_titles: dict) -> dict:
    subject_id, chapter_id = doc.get("subject_id"), doc.get("chapter_id")
    status = doc["status"]
    return {
        "id": str(doc["_id"]),
        "material_id": str(doc["material_id"]),
        "chunk_index": doc.get("chunk_index", 0),
        "page_start": doc.get("page_start"),
        "page_end": doc.get("page_end"),
        "number": doc.get("number"),
        "text": doc["text"],
        "options": doc.get("options", []),
        "correct_index": doc.get("correct_index"),
        "answer_status": doc.get("answer_status", "missing"),
        "answer_quote": doc.get("answer_quote", ""),
        "explanation": doc.get("explanation", ""),
        "difficulty": doc.get("difficulty", "medium"),
        "subject": ({"id": str(subject_id), "name": subject_names[subject_id]} if subject_id in subject_names else None),
        "chapter": ({"id": str(chapter_id), "title": chapter_titles[chapter_id]} if chapter_id in chapter_titles else None),
        "topic_source": doc.get("topic_source", "material"),
        "exam_name": doc.get("exam_name"),
        "year": doc.get("year"),
        "flags": doc.get("flags", []),
        "problems": [] if status == "approved" else pyq_logic.approval_problems(doc),
        "status": status,
        "question_id": str(doc["question_id"]) if doc.get("question_id") else None,
        "edited": bool(doc.get("edited")),
        "reject_reason": doc.get("reject_reason"),
        "created_at": doc["created_at"],
        "updated_at": doc.get("updated_at") or doc["created_at"],
    }


async def _present(doc: dict) -> dict:
    subject_names, chapter_titles = await _lookup_names([doc])
    return _item(doc, subject_names, chapter_titles)


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


# ======================================================================
# Listing
# ======================================================================
async def list_questions(
    material_id: str,
    *,
    status: str | None,
    attention: bool,
    search: str | None,
    page: int,
    page_size: int,
) -> dict:
    db = get_db()
    mid = parse_object_id(material_id, NotFoundError, "Material not found.")
    collection = db["extracted_questions"]

    query: dict = {"material_id": mid}
    if status:
        query["status"] = status
    if attention:
        # Any real warning flag (ignore legacy possible_duplicate) or missing answer
        query["$or"] = [
            {"correct_index": None},
            {"flags": {"$elemMatch": {"$nin": ["possible_duplicate"]}}},
        ]
    term = (search or "").strip()[:100]
    if term:
        query["text"] = {"$regex": re.escape(term), "$options": "i"}

    total = await collection.count_documents(query)
    docs = await collection.find(query).sort(SORT).skip((page - 1) * page_size).limit(page_size).to_list(length=None)
    subject_names, chapter_titles = await _lookup_names(docs)

    cursor = await collection.aggregate(
        [{"$match": {"material_id": mid}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    )
    by_status = {row["_id"]: row["n"] for row in await cursor.to_list(length=None)}
    attention_count = await collection.count_documents(
        {
            "material_id": mid,
            "status": "pending",
            "$or": [
                {"correct_index": None},
                {"flags": {"$elemMatch": {"$nin": ["possible_duplicate"]}}},
            ],
        }
    )

    return {
        "items": [_item(d, subject_names, chapter_titles) for d in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": {
            "pending": by_status.get("pending", 0),
            "approved": by_status.get("approved", 0),
            "rejected": by_status.get("rejected", 0),
            "attention": attention_count,
        },
    }


# ======================================================================
# Editing and decisions
# ======================================================================
async def update_question(question_id: str, data: ExtractedQuestionIn) -> dict:
    doc = await _get(question_id)
    if doc["status"] == "approved":
        raise ConflictError("This question is already approved. Edit it in the Question bank.")

    subject, chapter = await _resolve_refs(data.subject_id, data.chapter_id)
    chapter_id = chapter["_id"] if chapter else None

    changes = {
        "text": data.text,
        "options": data.options,
        "correct_index": data.correct_index,
        "explanation": data.explanation,
        "difficulty": data.difficulty,
        "exam_name": data.exam_name,
        "year": data.year,
        "subject_id": subject["_id"],
        "chapter_id": chapter_id,
        "edited": True,
        "updated_at": _now(),
    }
    if data.correct_index != doc.get("correct_index"):
        # An answer chosen by the admin replaces whatever was extracted
        changes["answer_status"] = "manual" if data.correct_index is not None else "missing"
        changes["answer_quote"] = ""
    if subject["_id"] != doc.get("subject_id") or chapter_id != doc.get("chapter_id"):
        changes["topic_source"] = "manual"

    await get_db()["extracted_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _present({**doc, **changes})


async def approve_question(question_id: str, admin: dict) -> dict:
    db = get_db()
    doc = await _get(question_id)
    if doc["status"] == "approved":
        return await _present(doc)  # already done: approving twice changes nothing

    problems = pyq_logic.approval_problems(doc)
    if problems:
        raise BadRequestError("This question cannot be approved yet. " + " ".join(problems))

    if await db["subjects"].find_one({"_id": doc["subject_id"]}, {"_id": 1}) is None:
        raise BadRequestError("The subject of this question no longer exists. Edit the question and choose another.")
    if doc.get("chapter_id") and await db["chapters"].find_one(
        {"_id": doc["chapter_id"], "subject_id": doc["subject_id"]}, {"_id": 1}
    ) is None:
        raise BadRequestError("The chapter of this question no longer exists. Edit the question and choose another.")

    now = _now()
    bank_doc = {
        "subject_id": doc["subject_id"],
        "chapter_id": doc.get("chapter_id"),
        "type": "mcq",
        "text": doc["text"],
        "options": doc["options"],
        "correct_index": doc["correct_index"],
        "explanation": doc.get("explanation", ""),
        "difficulty": doc.get("difficulty", "medium"),
        "source": "pyq",
        "exam_name": doc.get("exam_name"),
        "year": doc.get("year"),
        "exam_tags": doc.get("exam_tags", []),
        "status": "approved",
        "text_hash": pyq_logic.question_hash(doc["text"]),
        "extracted_id": doc["_id"],
        "material_id": doc["material_id"],
        "page_start": doc.get("page_start"),
        "page_end": doc.get("page_end"),
        "created_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
    }
    try:
        inserted = await db["questions"].insert_one(bank_doc)
        bank_id = inserted.inserted_id
    except DuplicateKeyError:
        # Already copied by an earlier (interrupted or repeated) approval: reuse that question
        existing = await db["questions"].find_one({"extracted_id": doc["_id"]}, {"_id": 1})
        if existing is None:
            raise ConflictError("Could not approve this question. Please try again.")
        bank_id = existing["_id"]

    updated = await db["extracted_questions"].find_one_and_update(
        {"_id": doc["_id"], "status": {"$in": ["pending", "rejected"]}},
        {
            "$set": {
                "status": "approved",
                "question_id": bank_id,
                "reviewed_by": admin["_id"],
                "reviewed_at": now,
                "reject_reason": None,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        updated = await db["extracted_questions"].find_one({"_id": doc["_id"]})
    return await _present(updated)


async def reject_question(question_id: str, admin: dict, reason: str) -> dict:
    doc = await _get(question_id)
    if doc["status"] == "approved":
        raise ConflictError("This question is already approved. Move it to draft or delete it in the Question bank.")

    now = _now()
    changes = {
        "status": "rejected",
        "reject_reason": reason.strip()[:200] or None,
        "reviewed_by": admin["_id"],
        "reviewed_at": now,
        "updated_at": now,
    }
    await get_db()["extracted_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _present({**doc, **changes})


async def restore_question(question_id: str) -> dict:
    doc = await _get(question_id)
    if doc["status"] != "rejected":
        raise ConflictError("Only a rejected question can be restored to pending.")

    changes = {"status": "pending", "reject_reason": None, "reviewed_by": None, "reviewed_at": None, "updated_at": _now()}
    await get_db()["extracted_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _present({**doc, **changes})


async def approve_clean(material_id: str, admin: dict) -> dict:
    """Approves the pending questions that have a verified answer and no real warnings."""
    db = get_db()
    mid = parse_object_id(material_id, NotFoundError, "Material not found.")
    query = {
        "material_id": mid,
        "status": "pending",
        "correct_index": {"$ne": None},
        # Allow empty flags, or only the legacy possible_duplicate flag
        "$or": [
            {"flags": {"$size": 0}},
            {"flags": ["possible_duplicate"]},
            {"flags": {"$exists": False}},
        ],
    }
    docs = await db["extracted_questions"].find(query).sort(SORT).limit(CLEAN_BATCH + 1).to_list(length=None)

    approved = skipped = 0
    for doc in docs[:CLEAN_BATCH]:
        try:
            await approve_question(str(doc["_id"]), admin)
            approved += 1
        except (BadRequestError, ConflictError):
            skipped += 1
    return {"approved": approved, "skipped": skipped, "more": len(docs) > CLEAN_BATCH}