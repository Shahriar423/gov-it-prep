"""Admin review of written questions extracted from Written PDFs.

Extracted written questions stay in `extracted_written_questions` as 'pending'. Only an admin's approval copies a
question into the approved written bank (`written_questions`), which the written exam builder uses.

Marks printed in the PDF are kept for reference only (`pdf_marks`). In exams, every written question is
worth exactly 10 marks."""
import re
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.ai import pyq_logic
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.ingestion import written_parser
from app.schemas.written_extraction import ExtractedWrittenIn
from app.services.extraction_review_service import _lookup_names, _resolve_refs

CLEAN_BATCH = 200
SORT = [("chunk_index", 1), ("_id", 1)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def approval_problems(doc: dict) -> list[str]:
    """What stops a written question from entering the approved bank."""
    problems: list[str] = []
    text = (doc.get("text") or "").strip()
    if not 20 <= len(text) <= written_parser.MAX_TEXT:
        problems.append("The question text must be 20 to 3000 characters long.")
    if not doc.get("subject_id"):
        problems.append("Choose a subject.")
    return problems


async def _get(question_id: str) -> dict:
    qid = parse_object_id(question_id, NotFoundError, "Extracted written question not found.")
    doc = await get_db()["extracted_written_questions"].find_one({"_id": qid})
    if doc is None:
        raise NotFoundError("Extracted written question not found.")
    return doc


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
        "stem": doc.get("stem", ""),
        "parts": [
            {"label": p.get("label", ""), "text": p.get("text", ""), "marks": p.get("marks")}
            for p in doc.get("parts", [])
        ],
        "text": doc["text"],
        "pdf_marks": doc.get("pdf_marks"),
        "difficulty": doc.get("difficulty", "medium"),
        "subject": ({"id": str(subject_id), "name": subject_names[subject_id]} if subject_id in subject_names else None),
        "chapter": ({"id": str(chapter_id), "title": chapter_titles[chapter_id]} if chapter_id in chapter_titles else None),
        "topic_source": doc.get("topic_source", "material"),
        "exam_name": doc.get("exam_name"),
        "year": doc.get("year"),
        "flags": doc.get("flags", []),
        "problems": [] if status == "approved" else approval_problems(doc),
        "duplicate": doc.get("duplicate"),
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


# ======================================================================
# Listing
# ======================================================================
async def list_questions(
    material_id: str, *, status: str | None, attention: bool, search: str | None, page: int, page_size: int
) -> dict:
    mid = parse_object_id(material_id, NotFoundError, "Material not found.")
    collection = get_db()["extracted_written_questions"]

    query: dict = {"material_id": mid}
    if status:
        query["status"] = status
    if attention:
        query["flags.0"] = {"$exists": True}
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
        {"material_id": mid, "status": "pending", "flags.0": {"$exists": True}}
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
async def update_question(question_id: str, data: ExtractedWrittenIn) -> dict:
    doc = await _get(question_id)
    if doc["status"] == "approved":
        raise ConflictError("This question is already approved. Edit it in Admin > Written questions.")

    subject, chapter = await _resolve_refs(data.subject_id, data.chapter_id)
    chapter_id = chapter["_id"] if chapter else None

    parts = [{"label": p.label.lower(), "text": p.text, "marks": p.marks} for p in data.parts]
    text = written_parser.compose_text(data.stem, parts)
    if len(text) > written_parser.MAX_TEXT:
        raise BadRequestError("The question is too long (3000 characters at most, including its parts).")

    changes = {
        "stem": data.stem,
        "parts": parts,
        "text": text,
        "pdf_marks": data.pdf_marks,
        "difficulty": data.difficulty,
        "exam_name": data.exam_name,
        "year": data.year,
        "subject_id": subject["_id"],
        "chapter_id": chapter_id,
        "edited": True,
        "updated_at": _now(),
    }
    if subject["_id"] != doc.get("subject_id") or chapter_id != doc.get("chapter_id"):
        changes["topic_source"] = "manual"

    await get_db()["extracted_written_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _present({**doc, **changes})


async def approve_question(question_id: str, admin: dict) -> dict:
    db = get_db()
    doc = await _get(question_id)
    if doc["status"] == "approved":
        return await _present(doc)  # already done: approving twice changes nothing

    problems = approval_problems(doc)
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
        "text": doc["text"],
        "difficulty": doc.get("difficulty", "medium"),
        "status": "approved",
        "source": "pyq",
        "created_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
        "extracted_id": doc["_id"],
        "material_id": doc["material_id"],
        "page_start": doc.get("page_start"),
        "page_end": doc.get("page_end"),
        "number": doc.get("number"),
        "exam_name": doc.get("exam_name"),
        "year": doc.get("year"),
        "pdf_marks": doc.get("pdf_marks"),
        "text_hash": pyq_logic.question_hash(doc["text"]),
    }
    try:
        inserted = await db["written_questions"].insert_one(bank_doc)
        bank_id = inserted.inserted_id
    except DuplicateKeyError:
        # Already copied by an earlier (interrupted or repeated) approval: reuse that question
        existing = await db["written_questions"].find_one({"extracted_id": doc["_id"]}, {"_id": 1})
        if existing is None:
            raise ConflictError("Could not approve this question. Please try again.")
        bank_id = existing["_id"]

    updated = await db["extracted_written_questions"].find_one_and_update(
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
        updated = await db["extracted_written_questions"].find_one({"_id": doc["_id"]})
    return await _present(updated)


async def reject_question(question_id: str, admin: dict, reason: str) -> dict:
    doc = await _get(question_id)
    if doc["status"] == "approved":
        raise ConflictError("This question is already approved. Move it to draft or delete it in Admin > Written questions.")

    now = _now()
    changes = {
        "status": "rejected",
        "reject_reason": reason.strip()[:200] or None,
        "reviewed_by": admin["_id"],
        "reviewed_at": now,
        "updated_at": now,
    }
    await get_db()["extracted_written_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _present({**doc, **changes})


async def restore_question(question_id: str) -> dict:
    doc = await _get(question_id)
    if doc["status"] != "rejected":
        raise ConflictError("Only a rejected question can be restored to pending.")

    changes = {"status": "pending", "reject_reason": None, "reviewed_by": None, "reviewed_at": None, "updated_at": _now()}
    await get_db()["extracted_written_questions"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _present({**doc, **changes})


async def approve_clean(material_id: str, admin: dict) -> dict:
    """Approves the pending written questions that have no warnings at all."""
    db = get_db()
    mid = parse_object_id(material_id, NotFoundError, "Material not found.")
    query = {"material_id": mid, "status": "pending", "flags": {"$size": 0}}
    docs = await db["extracted_written_questions"].find(query).sort(SORT).limit(CLEAN_BATCH + 1).to_list(length=None)

    approved = skipped = 0
    for doc in docs[:CLEAN_BATCH]:
        try:
            await approve_question(str(doc["_id"]), admin)
            approved += 1
        except (BadRequestError, ConflictError):
            skipped += 1
    return {"approved": approved, "skipped": skipped, "more": len(docs) > CLEAN_BATCH}