"""Student exams: starting an attempt, saving answers, grading, and results."""
import logging
import math
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.exam import StartExamRequest
from app.services.exam_admin_service import count_available_questions
from app.services.progress_service import percent
from app.services.revision_service import record_results

logger = logging.getLogger("uvicorn.error")

GRACE_SECONDS = 15  # extra time allowed for the final submission to reach the server
GRADED = ["submitted", "expired"]
ACTIVE_EXISTS = "You already have an exam in progress. Finish it before starting another."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _remaining(attempt: dict, now: datetime) -> int:
    return max(0, math.ceil((attempt["deadline_at"] - now).total_seconds()))


def _overdue(attempt: dict, now: datetime) -> bool:
    return now > attempt["deadline_at"] + timedelta(seconds=GRACE_SECONDS)


# ======================================================================
# Grading
# ======================================================================
def _clean_answers(attempt: dict, raw: dict | None) -> dict:
    """Keeps only answers that belong to this attempt and point at a real option."""
    sizes = {str(i["question_id"]): len(i["options"]) for i in attempt["items"]}
    cleaned = {}
    for key, value in (raw or {}).items():
        size = sizes.get(key)
        if size is not None and isinstance(value, int) and 0 <= value < size:
            cleaned[key] = value
    return cleaned


async def _grade(attempt: dict, raw_answers: dict | None, status: str) -> dict:
    """Grades an attempt exactly once. If another request already graded it, returns that result."""
    db = get_db()
    now = _now()
    answers = _clean_answers(attempt, raw_answers)
    negative = attempt["config_snapshot"]["negative_marking"]

    correct = wrong = 0
    graded: list[tuple[dict, bool]] = []
    for item in attempt["items"]:
        selected = answers.get(str(item["question_id"]))
        if selected is None:
            continue
        is_correct = selected == item["correct_index"]
        if is_correct:
            correct += 1
        else:
            wrong += 1
        graded.append(
            (
                {
                    "_id": item["question_id"],
                    "subject_id": item["subject_id"],
                    "chapter_id": item.get("chapter_id"),
                },
                is_correct,
            )
        )

    total = len(attempt["items"])
    score = round(correct - wrong * negative, 2)
    score_percent = max(0, min(100, round(score * 100 / total))) if total else 0

    fields = {
        "status": status,
        "answers": answers,
        "submitted_at": attempt["deadline_at"] if status == "expired" else now,
        "timed_out": now > attempt["deadline_at"],
        "score": score,
        "max_score": total,
        "correct_count": correct,
        "wrong_count": wrong,
        "unanswered_count": total - correct - wrong,
        "answered_count": correct + wrong,
        "score_percent": score_percent,
        "weak_spots_added": 0,
    }

    # The status filter makes sure only ONE request can grade this attempt
    result = await db["exam_attempts"].update_one(
        {"_id": attempt["_id"], "status": "in_progress"}, {"$set": fields}
    )
    if result.modified_count == 0:
        return await db["exam_attempts"].find_one({"_id": attempt["_id"]})

    weak = 0
    try:
        weak = await record_results(attempt["user_id"], graded)
        if weak:
            await db["exam_attempts"].update_one(
                {"_id": attempt["_id"]}, {"$set": {"weak_spots_added": weak}}
            )
    except PyMongoError:
        # The grade is already saved; failing to record weak spots must not break the result
        logger.warning("Could not save weak spots for exam attempt %s", attempt["_id"])

    return {**attempt, **fields, "weak_spots_added": weak}


async def _finalize_if_overdue(attempt: dict) -> dict:
    if attempt["status"] == "in_progress" and _overdue(attempt, _now()):
        return await _grade(attempt, attempt.get("answers", {}), "expired")
    return attempt


async def _load_attempt(user: dict, attempt_id: str) -> dict:
    aid = parse_object_id(attempt_id, NotFoundError, "Exam attempt not found.")
    attempt = await get_db()["exam_attempts"].find_one({"_id": aid, "user_id": user["_id"]})
    if attempt is None:
        raise NotFoundError("Exam attempt not found.")
    return await _finalize_if_overdue(attempt)


async def _get_active_attempt(user_id) -> dict | None:
    attempt = await get_db()["exam_attempts"].find_one({"user_id": user_id, "status": "in_progress"})
    if attempt is None:
        return None
    attempt = await _finalize_if_overdue(attempt)
    return attempt if attempt["status"] == "in_progress" else None


# ======================================================================
# Listing
# ======================================================================
async def list_exams(user: dict) -> dict:
    db = get_db()

    # Done first: it may finish an overdue attempt, which then appears in the history
    active = await _get_active_attempt(user["_id"])

    exams = await db["exams"].find({"status": "published"}).sort([("created_at", -1)]).to_list(length=None)
    counts = await count_available_questions(exams, approved_only=True)

    stats: dict = {}
    ids = [e["_id"] for e in exams]
    if ids:
        cursor = await db["exam_attempts"].aggregate(
            [
                {
                    "$match": {
                        "user_id": user["_id"],
                        "exam_id": {"$in": ids},
                        "status": {"$in": GRADED},
                        "answered_count": {"$gt": 0},
                    }
                },
                {"$group": {"_id": "$exam_id", "attempts": {"$sum": 1}, "best": {"$max": "$score_percent"}}},
            ]
        )
        for row in await cursor.to_list(length=None):
            stats[row["_id"]] = row

    history_docs = (
        await db["exam_attempts"]
        .find(
            {"user_id": user["_id"], "status": {"$in": GRADED}, "answered_count": {"$gt": 0}},
            {"config_snapshot": 1, "score": 1, "max_score": 1, "score_percent": 1, "submitted_at": 1, "timed_out": 1},
        )
        .sort([("submitted_at", -1)])
        .limit(10)
        .to_list(length=None)
    )

    return {
        "exams": [
            {
                "id": str(e["_id"]),
                "title": e["title"],
                "description": e.get("description", ""),
                "duration_minutes": e["duration_minutes"],
                "negative_marking": e["negative_marking"],
                "question_count": counts[e["_id"]],
                "attempts_count": stats.get(e["_id"], {}).get("attempts", 0),
                "best_percent": stats.get(e["_id"], {}).get("best"),
            }
            for e in exams
            if counts[e["_id"]] > 0
        ],
        "active_attempt": (
            {
                "id": str(active["_id"]),
                "title": active["config_snapshot"]["title"],
                "remaining_seconds": _remaining(active, _now()),
            }
            if active
            else None
        ),
        "history": [
            {
                "id": str(h["_id"]),
                "title": h["config_snapshot"]["title"],
                "score": h["score"],
                "max_score": h["max_score"],
                "score_percent": h["score_percent"],
                "submitted_at": h.get("submitted_at"),
                "timed_out": bool(h.get("timed_out")),
            }
            for h in history_docs
        ],
    }


# ======================================================================
# Starting
# ======================================================================
async def start_exam(user: dict, data: StartExamRequest) -> dict:
    db = get_db()

    if await _get_active_attempt(user["_id"]):
        raise ConflictError(ACTIVE_EXISTS)

    exam_id = None
    filters = None

    if data.exam_id:
        exam_oid = parse_object_id(data.exam_id, NotFoundError, "Exam not found.")
        exam = await db["exams"].find_one({"_id": exam_oid, "status": "published"})
        if exam is None:
            raise NotFoundError("Exam not found.")
        ordered_ids = exam.get("question_ids", [])
        docs = await db["questions"].find(
            {"_id": {"$in": ordered_ids}, "status": "approved"}
        ).to_list(length=None)
        by_id = {d["_id"]: d for d in docs}
        questions = [by_id[q] for q in ordered_ids if q in by_id]
        title = exam["title"]
        duration = exam["duration_minutes"]
        negative = exam["negative_marking"]
        exam_id = exam["_id"]
        kind = "mock"
    else:
        if data.duration_minutes is None:
            raise BadRequestError("Please choose how long the exam should last.")
        negative = data.negative_marking if data.negative_marking is not None else 0.25
        duration = data.duration_minutes

        match: dict = {"status": "approved"}
        if data.chapter_id:
            match["chapter_id"] = parse_object_id(data.chapter_id, BadRequestError, "Invalid chapter.")
        elif data.subject_id:
            match["subject_id"] = parse_object_id(data.subject_id, BadRequestError, "Invalid subject.")
        if data.difficulty:
            match["difficulty"] = data.difficulty

        cursor = await db["questions"].aggregate([{"$match": match}, {"$sample": {"size": data.count}}])
        sampled = await cursor.to_list(length=None)
        seen = set()
        questions = []
        for q in sampled:  # $sample can occasionally repeat a document
            if q["_id"] not in seen:
                seen.add(q["_id"])
                questions.append(q)

        title = "Custom exam"
        kind = "custom"
        filters = {
            "subject_id": data.subject_id,
            "chapter_id": data.chapter_id,
            "difficulty": data.difficulty,
            "requested_count": data.count,
        }

    if not questions:
        raise BadRequestError("No approved questions are available for this exam.")

    subject_ids = list({q["subject_id"] for q in questions})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    names = {s["_id"]: s["name"] for s in subjects}

    # A private copy of each question. Grading and results use this copy, so later edits or
    # deletions in the question bank can never change an exam that was already taken.
    items = [
        {
            "question_id": q["_id"],
            "text": q["text"],
            "options": q["options"],
            "correct_index": q["correct_index"],
            "explanation": q.get("explanation", ""),
            "subject_id": q["subject_id"],
            "subject_name": names.get(q["subject_id"], "Subject"),
            "chapter_id": q.get("chapter_id"),
            "difficulty": q.get("difficulty", "medium"),
            "source": q.get("source", "pyq"),
            "exam_name": q.get("exam_name"),
            "year": q.get("year"),
        }
        for q in questions
    ]

    now = _now()
    attempt = {
        "user_id": user["_id"],
        "exam_id": exam_id,
        "kind": kind,
        "config_snapshot": {
            "title": title,
            "duration_minutes": duration,
            "negative_marking": negative,
            "question_count": len(items),
            "filters": filters,
        },
        "question_ids": [i["question_id"] for i in items],
        "items": items,
        "answers": {},
        "started_at": now,
        "deadline_at": now + timedelta(minutes=duration),
        "status": "in_progress",
        "created_at": now,
    }
    try:
        result = await db["exam_attempts"].insert_one(attempt)
    except DuplicateKeyError:
        # The database allows only one in-progress attempt per user
        raise ConflictError(ACTIVE_EXISTS)
    return {"attempt_id": str(result.inserted_id)}


# ======================================================================
# Taking the exam
# ======================================================================
async def get_attempt(user: dict, attempt_id: str) -> dict:
    attempt = await _load_attempt(user, attempt_id)
    snapshot = attempt["config_snapshot"]
    in_progress = attempt["status"] == "in_progress"
    now = _now()

    questions = []
    if in_progress:
        questions = [
            {
                "id": str(i["question_id"]),
                "text": i["text"],
                "options": i["options"],
                "difficulty": i["difficulty"],
                "subject_name": i["subject_name"],
            }
            for i in attempt["items"]
        ]

    return {
        "id": str(attempt["_id"]),
        "title": snapshot["title"],
        "status": attempt["status"],
        "duration_minutes": snapshot["duration_minutes"],
        "negative_marking": snapshot["negative_marking"],
        "total_questions": len(attempt["items"]),
        "remaining_seconds": _remaining(attempt, now) if in_progress else 0,
        "questions": questions,
        "answers": attempt.get("answers", {}) if in_progress else {},
    }


async def save_answers(user: dict, attempt_id: str, answers: dict) -> dict:
    attempt = await _load_attempt(user, attempt_id)
    if attempt["status"] != "in_progress":
        return {"status": attempt["status"], "remaining_seconds": 0}

    now = _now()
    await get_db()["exam_attempts"].update_one(
        {"_id": attempt["_id"], "status": "in_progress"},
        {"$set": {"answers": _clean_answers(attempt, answers), "updated_at": now}},
    )
    return {"status": "in_progress", "remaining_seconds": _remaining(attempt, now)}


async def submit_attempt(user: dict, attempt_id: str, answers: dict | None) -> dict:
    attempt = await _load_attempt(user, attempt_id)
    if attempt["status"] != "in_progress":
        # Already graded (double click, or a retry after a slow response): nothing more to do
        return {"attempt_id": str(attempt["_id"]), "status": attempt["status"]}

    final_answers = answers if answers is not None else attempt.get("answers", {})
    graded = await _grade(attempt, final_answers, "submitted")
    return {"attempt_id": str(graded["_id"]), "status": graded["status"]}


# ======================================================================
# Results
# ======================================================================
async def get_result(user: dict, attempt_id: str) -> dict:
    attempt = await _load_attempt(user, attempt_id)
    if attempt["status"] == "in_progress":
        raise ConflictError("This exam is still in progress.")

    items = attempt["items"]
    answers = attempt.get("answers", {})
    snapshot = attempt["config_snapshot"]

    chapter_ids = list({i["chapter_id"] for i in items if i.get("chapter_id")})
    chapters: dict = {}
    if chapter_ids:
        docs = await get_db()["chapters"].find(
            {"_id": {"$in": chapter_ids}, "is_published": True}, {"title": 1}
        ).to_list(length=None)
        chapters = {c["_id"]: c for c in docs}

    questions = []
    groups: dict = {}
    for number, item in enumerate(items, start=1):
        selected = answers.get(str(item["question_id"]))
        if selected is None:
            state = "unanswered"
        elif selected == item["correct_index"]:
            state = "correct"
        else:
            state = "wrong"

        chapter = chapters.get(item.get("chapter_id"))
        questions.append(
            {
                "id": str(item["question_id"]),
                "number": number,
                "text": item["text"],
                "options": item["options"],
                "selected_index": selected,
                "correct_index": item["correct_index"],
                "state": state,
                "explanation": item.get("explanation", ""),
                "difficulty": item["difficulty"],
                "source": item["source"],
                "exam_name": item.get("exam_name"),
                "year": item.get("year"),
                "subject_name": item["subject_name"],
                "chapter": {"id": str(chapter["_id"]), "title": chapter["title"]} if chapter else None,
            }
        )

                # Normalize legacy "Technical" snapshots to canonical "IT"
        sname = item.get("subject_name") or "Unknown"
        if isinstance(sname, str) and sname.strip().casefold() == "technical":
            sname = "IT"
        group = groups.setdefault(
            sname,
            {"name": sname, "total": 0, "correct": 0, "wrong": 0, "unanswered": 0},
        )
        group["total"] += 1
        group[state] += 1

    started = attempt["started_at"]
    submitted = attempt.get("submitted_at") or started
    taken = min((submitted - started).total_seconds(), snapshot["duration_minutes"] * 60)

    return {
        "id": str(attempt["_id"]),
        "title": snapshot["title"],
        "status": attempt["status"],
        "timed_out": bool(attempt.get("timed_out")),
        "started_at": started,
        "submitted_at": attempt.get("submitted_at"),
        "duration_minutes": snapshot["duration_minutes"],
        "time_taken_seconds": max(0, int(taken)),
        "negative_marking": snapshot["negative_marking"],
        "total_questions": len(items),
        "correct": attempt.get("correct_count", 0),
        "wrong": attempt.get("wrong_count", 0),
        "unanswered": attempt.get("unanswered_count", 0),
        "score": attempt.get("score", 0),
        "max_score": attempt.get("max_score", len(items)),
        "score_percent": attempt.get("score_percent", 0),
        "weak_spots_added": attempt.get("weak_spots_added", 0),
        "subjects": [{**g, "percent": percent(g["correct"], g["total"])} for g in groups.values()],
        "questions": questions,
    }