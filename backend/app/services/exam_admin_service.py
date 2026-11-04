"""Admin management of mock exam papers."""
from datetime import datetime, timezone

from app.core.errors import BadRequestError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.exam import ExamIn

SORT = [("created_at", -1), ("_id", -1)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _item(doc: dict, question_count: int) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "description": doc.get("description", ""),
        "duration_minutes": doc["duration_minutes"],
        "negative_marking": doc["negative_marking"],
        "status": doc.get("status", "draft"),
        "question_count": question_count,
        "created_at": doc["created_at"],
        "updated_at": doc.get("updated_at") or doc["created_at"],
    }


async def count_available_questions(exams: list[dict], approved_only: bool) -> dict:
    """How many of each exam's questions still exist (and are approved, if asked).

    Questions can be deleted or un-approved after an exam was built, so counts are
    always checked against the question bank instead of trusting the stored list."""
    all_ids = list({qid for e in exams for qid in e.get("question_ids", [])})
    if not all_ids:
        return {e["_id"]: 0 for e in exams}

    query: dict = {"_id": {"$in": all_ids}}
    if approved_only:
        query["status"] = "approved"
    found = await get_db()["questions"].find(query, {"_id": 1}).to_list(length=None)
    ok = {d["_id"] for d in found}
    return {e["_id"]: sum(1 for q in e.get("question_ids", []) if q in ok) for e in exams}


async def _validate_questions(raw_ids: list[str], must_be_approved: bool) -> list:
    seen = set()
    ids = []
    for raw in raw_ids:
        oid = parse_object_id(raw, BadRequestError, "One of the selected questions is invalid.")
        if oid not in seen:
            seen.add(oid)
            ids.append(oid)
    if not ids:
        return ids

    docs = await get_db()["questions"].find({"_id": {"$in": ids}}, {"status": 1}).to_list(length=None)
    found = {d["_id"]: d for d in docs}
    if any(i not in found for i in ids):
        raise BadRequestError("Some selected questions no longer exist. Remove them and try again.")
    if must_be_approved:
        bad = [i for i in ids if found[i].get("status") != "approved"]
        if bad:
            raise BadRequestError(
                f"{len(bad)} selected question(s) are not approved. Approve or remove them before publishing."
            )
    return ids


async def _question_summaries(ids: list) -> list[dict]:
    if not ids:
        return []
    db = get_db()
    docs = await db["questions"].find(
        {"_id": {"$in": ids}}, {"text": 1, "subject_id": 1, "difficulty": 1, "status": 1}
    ).to_list(length=None)
    by_id = {d["_id"]: d for d in docs}
    subject_ids = list({d["subject_id"] for d in docs})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    names = {s["_id"]: s["name"] for s in subjects}

    out = []
    for qid in ids:
        d = by_id.get(qid)
        if d is None:
            continue  # deleted from the question bank
        out.append(
            {
                "id": str(d["_id"]),
                "text": d["text"],
                "subject_name": names.get(d["subject_id"], "Unknown subject"),
                "difficulty": d.get("difficulty", "medium"),
                "status": d.get("status", "draft"),
            }
        )
    return out


async def _detail(doc: dict) -> dict:
    questions = await _question_summaries(doc.get("question_ids", []))
    return {**_item(doc, len(questions)), "questions": questions}


async def _get_doc(exam_id: str) -> dict:
    eid = parse_object_id(exam_id, NotFoundError, "Exam not found.")
    doc = await get_db()["exams"].find_one({"_id": eid})
    if doc is None:
        raise NotFoundError("Exam not found.")
    return doc


async def list_exams() -> list[dict]:
    exams = await get_db()["exams"].find().sort(SORT).to_list(length=None)
    counts = await count_available_questions(exams, approved_only=False)
    return [_item(e, counts[e["_id"]]) for e in exams]


async def get_exam(exam_id: str) -> dict:
    return await _detail(await _get_doc(exam_id))


async def create_exam(data: ExamIn, admin: dict) -> dict:
    publishing = data.status == "published"
    ids = await _validate_questions(data.question_ids, must_be_approved=publishing)
    if publishing and not ids:
        raise BadRequestError("Add at least one question before publishing.")

    now = _now()
    doc = {
        "title": data.title,
        "description": data.description,
        "duration_minutes": data.duration_minutes,
        "negative_marking": data.negative_marking,
        "status": data.status,
        "question_ids": ids,
        "created_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
    }
    result = await get_db()["exams"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _detail(doc)


async def update_exam(exam_id: str, data: ExamIn) -> dict:
    doc = await _get_doc(exam_id)
    publishing = data.status == "published"
    ids = await _validate_questions(data.question_ids, must_be_approved=publishing)
    if publishing and not ids:
        raise BadRequestError("Add at least one question before publishing.")

    changes = {
        "title": data.title,
        "description": data.description,
        "duration_minutes": data.duration_minutes,
        "negative_marking": data.negative_marking,
        "status": data.status,
        "question_ids": ids,
        "updated_at": _now(),
    }
    await get_db()["exams"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return await _detail({**doc, **changes})


async def delete_exam(exam_id: str) -> None:
    doc = await _get_doc(exam_id)
    # Past attempts keep their own snapshot (title, questions, results), so they stay valid
    await get_db()["exams"].delete_one({"_id": doc["_id"]})