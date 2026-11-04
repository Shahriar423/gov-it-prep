"""Weak-spot (revision) scheduling and queries.

Shared by Practice, Mock exams, the revision quiz, the Weak spots page and the dashboard.
A weak spot only counts while its question still exists and is approved."""
import random
from datetime import datetime, timedelta, timezone

from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError

from app.core.errors import BadRequestError
from app.core.ids import parse_object_id
from app.db.mongo import get_db

FIRST_REVIEW_DAYS = 2     # a wrong answer comes back for review after 2 days
SECOND_REVIEW_DAYS = 4    # after one correct review, it comes back after 4 more days
MASTERY_STREAK = 2        # two correct reviews in a row = mastered


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ======================================================================
# Scheduling (writing)
# ======================================================================
def _wrong_update(question: dict, now: datetime) -> dict:
    return {
        "$set": {
            "subject_id": question["subject_id"],
            "chapter_id": question.get("chapter_id"),
            "status": "active",
            "correct_streak": 0,
            "next_review_at": now + timedelta(days=FIRST_REVIEW_DAYS),
            "updated_at": now,
        },
        "$inc": {"wrong_count": 1},
        "$setOnInsert": {"created_at": now},
    }


def _correct_changes(schedule: dict, now: datetime) -> tuple[dict, bool, int | None]:
    """What a correct answer does to a weak spot that is due. Returns (changes, mastered, next_days)."""
    streak = schedule.get("correct_streak", 0) + 1
    changes: dict = {"correct_streak": streak, "updated_at": now}
    if streak >= MASTERY_STREAK:
        changes["status"] = "mastered"
        return changes, True, None
    changes["next_review_at"] = now + timedelta(days=SECOND_REVIEW_DAYS)
    return changes, False, SECOND_REVIEW_DAYS


async def record_revision(user_id, question: dict, is_correct: bool) -> dict:
    """One answer (Practice and the revision quiz).

    Returns {"saved": bool, "mastered": bool, "next_review_days": int | None}
    saved            -> a wrong answer was saved/refreshed as a weak spot
    mastered         -> a correct review just made the question mastered
    next_review_days -> in how many days the question comes back (None if it does not)
    """
    schedules = get_db()["revision_schedules"]
    now = _now()
    key = {"user_id": user_id, "question_id": question["_id"]}
    outcome: dict = {"saved": False, "mastered": False, "next_review_days": None}

    if not is_correct:
        update = _wrong_update(question, now)
        try:
            await schedules.update_one(key, update, upsert=True)
        except DuplicateKeyError:
            # Two answers arrived at the same moment; the second attempt simply updates
            await schedules.update_one(key, update, upsert=True)
        outcome.update(saved=True, next_review_days=FIRST_REVIEW_DAYS)
        return outcome

    # Correct answer: it only counts toward mastery once the review is actually due
    existing = await schedules.find_one({**key, "status": "active"})
    if existing:
        due_at = existing.get("next_review_at")
        if due_at is None or due_at <= now:
            changes, mastered, days = _correct_changes(existing, now)
            await schedules.update_one({"_id": existing["_id"]}, {"$set": changes})
            outcome.update(mastered=mastered, next_review_days=days)
    return outcome


async def record_results(user_id, graded: list[tuple[dict, bool]]) -> int:
    """Many answers at once (Mock exams), written in a single database round trip.

    graded: [(question, is_correct), ...] for ANSWERED questions only.
    Returns how many wrong answers were saved as weak spots.
    """
    if not graded:
        return 0

    schedules = get_db()["revision_schedules"]
    now = _now()
    ops = []
    wrong_count = 0
    correct_ids = []

    for question, is_correct in graded:
        if is_correct:
            correct_ids.append(question["_id"])
            continue
        wrong_count += 1
        ops.append(
            UpdateOne(
                {"user_id": user_id, "question_id": question["_id"]},
                _wrong_update(question, now),
                upsert=True,
            )
        )

    if correct_ids:
        due = await schedules.find(
            {
                "user_id": user_id,
                "status": "active",
                "question_id": {"$in": correct_ids},
                "next_review_at": {"$lte": now},
            }
        ).to_list(length=None)
        for schedule in due:
            changes, _, _ = _correct_changes(schedule, now)
            ops.append(UpdateOne({"_id": schedule["_id"]}, {"$set": changes}))

    if ops:
        await schedules.bulk_write(ops, ordered=False)
    return wrong_count


# ======================================================================
# Queries (reading)
# ======================================================================
def _approved_join(user_id, match: dict | None = None) -> list[dict]:
    """Pipeline start: this user's schedules whose question still exists and is approved."""
    return [
        {"$match": {"user_id": user_id, **(match or {})}},
        {
            "$lookup": {
                "from": "questions",
                "localField": "question_id",
                "foreignField": "_id",
                "as": "q",
            }
        },
        {"$match": {"q.status": "approved"}},
    ]


async def get_summary(user_id) -> dict:
    db = get_db()
    now = _now()
    is_active = {"$eq": ["$status", "active"]}

    pipeline = _approved_join(user_id) + [
        {
            "$group": {
                "_id": "$subject_id",
                "active": {"$sum": {"$cond": [is_active, 1, 0]}},
                "due": {
                    "$sum": {"$cond": [{"$and": [is_active, {"$lte": ["$next_review_at", now]}]}, 1, 0]}
                },
                "mastered": {"$sum": {"$cond": [{"$eq": ["$status", "mastered"]}, 1, 0]}},
                "wrong_total": {"$sum": {"$ifNull": ["$wrong_count", 0]}},
                "chapters": {"$addToSet": "$chapter_id"},
                "next_due": {
                    "$min": {
                        "$cond": [
                            {"$and": [is_active, {"$gt": ["$next_review_at", now]}]},
                            "$next_review_at",
                            None,
                        ]
                    }
                },
            }
        }
    ]
    cursor = await db["revision_schedules"].aggregate(pipeline)
    rows = await cursor.to_list(length=None)

    subject_ids = [r["_id"] for r in rows if r["_id"] is not None]
    names: dict = {}
    if subject_ids:
        docs = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
        names = {d["_id"]: d["name"] for d in docs}

    subjects = []
    chapter_ids = set()
    for r in rows:
        if r["_id"] is None or r["active"] <= 0:
            continue
        for cid in r.get("chapters") or []:
            if cid is not None:
                chapter_ids.add(cid)
        active = r["active"]
        # Rough topic strength: lower when more active weak items (display only)
        strength = max(5, min(95, int(100 - (active * 8))))
        subjects.append(
            {
                "id": str(r["_id"]),
                "name": names.get(r["_id"], "Unknown subject"),
                "active": active,
                "due": r["due"],
                "wrong_total": int(r.get("wrong_total") or 0),
                "score_percent": strength,
                "status": "weak" if strength < 50 else "needs_work",
            }
        )
    subjects.sort(key=lambda s: (-s["due"], -s["active"], s["name"].lower()))

    user = await db["users"].find_one({"_id": user_id}, {"practice_answered": 1, "practice_correct": 1})
    answered = int((user or {}).get("practice_answered") or 0)
    correct = int((user or {}).get("practice_correct") or 0)
    accuracy = round((correct * 100) / answered) if answered else None

    return {
        "active": sum(r["active"] for r in rows),
        "due": sum(r["due"] for r in rows),
        "mastered": sum(r["mastered"] for r in rows),
        "next_due_at": min((r["next_due"] for r in rows if r.get("next_due")), default=None),
        "subjects": subjects,
        "weak_chapters": len(chapter_ids),
        "incorrect_answers": sum(int(r.get("wrong_total") or 0) for r in rows),
        "topics_needing_revision": len(subjects),
        "overall_accuracy_percent": accuracy,
    }


def _item_status(doc: dict, now: datetime) -> str:
    if doc.get("status") == "mastered":
        return "mastered"
    due_at = doc.get("next_review_at")
    return "due" if due_at is None or due_at <= now else "upcoming"


async def list_items(user_id, status: str, subject_id: str | None, page: int, page_size: int) -> dict:
    db = get_db()
    now = _now()

    match: dict = {}
    if subject_id:
        match["subject_id"] = parse_object_id(subject_id, BadRequestError, "Invalid subject.")

    if status == "due":
        match.update({"status": "active", "next_review_at": {"$lte": now}})
        sort = {"next_review_at": 1, "_id": 1}  # most overdue first
    elif status == "upcoming":
        match.update({"status": "active", "next_review_at": {"$gt": now}})
        sort = {"next_review_at": 1, "_id": 1}  # coming soonest first
    else:
        match["status"] = "mastered"
        sort = {"updated_at": -1, "_id": 1}

    pipeline = _approved_join(user_id, match) + [
        {"$sort": sort},
        # Whitelist: the options, correct answer and explanation are deliberately NOT included
        {
            "$project": {
                "question_id": 1,
                "subject_id": 1,
                "chapter_id": 1,
                "status": 1,
                "next_review_at": 1,
                "wrong_count": 1,
                "correct_streak": 1,
                "q.text": 1,
                "q.difficulty": 1,
            }
        },
        {
            "$facet": {
                "items": [{"$skip": (page - 1) * page_size}, {"$limit": page_size}],
                "total": [{"$count": "n"}],
            }
        },
    ]
    cursor = await db["revision_schedules"].aggregate(pipeline)
    rows = await cursor.to_list(length=None)
    facet = rows[0] if rows else {"items": [], "total": []}
    docs = facet["items"]
    total = facet["total"][0]["n"] if facet["total"] else 0

    subject_ids = list({d["subject_id"] for d in docs})
    chapter_ids = list({d["chapter_id"] for d in docs if d.get("chapter_id")})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    chapters = (
        await db["chapters"]
        .find({"_id": {"$in": chapter_ids}, "is_published": True}, {"title": 1})
        .to_list(length=None)
        if chapter_ids
        else []
    )
    subject_map = {s["_id"]: s["name"] for s in subjects}
    chapter_map = {c["_id"]: c["title"] for c in chapters}

    items = []
    for d in docs:
        question = d["q"][0]
        chapter_id = d.get("chapter_id")
        items.append(
            {
                "question_id": str(d["question_id"]),
                "text": question["text"],
                "difficulty": question.get("difficulty", "medium"),
                "subject": {
                    "id": str(d["subject_id"]),
                    "name": subject_map.get(d["subject_id"], "Unknown subject"),
                },
                "chapter": (
                    {"id": str(chapter_id), "title": chapter_map[chapter_id]}
                    if chapter_id in chapter_map
                    else None
                ),
                "status": _item_status(d, now),
                "next_review_at": d.get("next_review_at"),
                "wrong_count": d.get("wrong_count", 1),
                "correct_streak": d.get("correct_streak", 0),
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


async def start_revision(user_id, subject_id: str | None, count: int, include_upcoming: bool) -> dict:
    db = get_db()
    now = _now()

    match: dict = {"status": "active"}
    if subject_id:
        match["subject_id"] = parse_object_id(subject_id, BadRequestError, "Invalid subject.")
    if not include_upcoming:
        match["next_review_at"] = {"$lte": now}

    pipeline = _approved_join(user_id, match) + [
        {"$sort": {"next_review_at": 1, "_id": 1}},  # most overdue first
        {"$limit": count},
        # Whitelist: the correct answer and explanation are deliberately NOT included
        {
            "$project": {
                "question_id": 1,
                "subject_id": 1,
                "q.text": 1,
                "q.options": 1,
                "q.difficulty": 1,
                "q.source": 1,
                "q.exam_name": 1,
                "q.year": 1,
            }
        },
    ]
    cursor = await db["revision_schedules"].aggregate(pipeline)
    docs = await cursor.to_list(length=None)

    if not docs:
        raise BadRequestError(
            "Nothing is due for revision right now."
            if not include_upcoming
            else "You have no weak-spot questions for this selection."
        )

    random.shuffle(docs)  # the selection is the most overdue questions; the order is mixed

    subject_ids = list({d["subject_id"] for d in docs})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    names = {s["_id"]: s["name"] for s in subjects}

    questions = []
    for d in docs:
        q = d["q"][0]
        questions.append(
            {
                "id": str(d["question_id"]),
                "text": q["text"],
                "options": q["options"],
                "difficulty": q.get("difficulty", "medium"),
                "source": q.get("source", "pyq"),
                "exam_name": q.get("exam_name"),
                "year": q.get("year"),
                "subject": {
                    "id": str(d["subject_id"]),
                    "name": names.get(d["subject_id"], "Subject"),
                },
            }
        )
    return {"questions": questions}