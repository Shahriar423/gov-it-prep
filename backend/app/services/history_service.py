"""Exam History & Performance Analytics.

Reads from the existing `exam_attempts` (MCQ) and `written_exam_sessions` (Written)
collections. Never invents scores or answers. Written sessions currently discard
question items and student answers on end — history reflects only what is stored.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.errors import NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db

GRADED_MCQ = ("submitted", "expired")
PAGE_SIZE_DEFAULT = 20


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _time_taken_seconds(
    started: datetime | None, ended: datetime | None, duration_minutes: int | None
) -> int | None:
    if not started or not ended:
        return None
    started = _as_utc(started)
    ended = _as_utc(ended)
    raw = (ended - started).total_seconds()
    if duration_minutes is not None:
        raw = min(raw, duration_minutes * 60)
    return max(0, int(raw))


def _mcq_status_label(status: str, timed_out: bool) -> str:
    if status == "in_progress":
        return "In Progress"
    if status == "expired" or timed_out:
        return "Timed Out"
    if status == "submitted":
        return "Completed"
    return status.replace("_", " ").title()


def _written_status_label(status: str, end_reason: str | None) -> str:
    if status == "in_progress":
        return "In Progress"
    if end_reason == "finished_early":
        return "Submitted"
    if end_reason == "time_up":
        return "Timed Out"
    return "Ended"


def _canonical_subject_name(name: str | None) -> str | None:
    """Map legacy snapshot names to the current canonical subject name."""
    if not name:
        return name
    if name.strip().casefold() == "technical":
        return "IT"
    return name


def _subject_names_from_items(items: list[dict]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        name = _canonical_subject_name(item.get("subject_name"))
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def _chapter_titles_from_items(items: list[dict]) -> list[str]:
    titles: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        title = item.get("chapter_title")
        if title and title not in seen:
            seen.add(title)
            titles.append(title)
    return titles


# ======================================================================
# Stats
# ======================================================================
async def compute_stats(user_id) -> dict:
    db = get_db()

    mcq_cursor = db["exam_attempts"].find(
        {"user_id": user_id, "status": {"$in": list(GRADED_MCQ)}}
    )
    mcq_docs = await mcq_cursor.to_list(length=None)

    written_cursor = db["written_exam_sessions"].find(
        {"user_id": user_id, "status": "ended"}
    )
    written_docs = await written_cursor.to_list(length=None)

    mcq_in_progress = await db["exam_attempts"].count_documents(
        {"user_id": user_id, "status": "in_progress"}
    )
    written_in_progress = await db["written_exam_sessions"].count_documents(
        {"user_id": user_id, "status": "in_progress"}
    )

    total_mcq = len(mcq_docs)
    percents = [d.get("score_percent") for d in mcq_docs if d.get("score_percent") is not None]
    best = max(percents) if percents else None
    avg_score = round(sum(percents) / len(percents), 1) if percents else None

    total_correct = sum(d.get("correct_count", 0) for d in mcq_docs)
    total_questions = sum(len(d.get("items") or d.get("question_ids") or []) for d in mcq_docs)
    avg_accuracy = (
        round(total_correct * 100 / total_questions, 1) if total_questions else None
    )

    times: list[int] = []
    for d in mcq_docs:
        snap = d.get("config_snapshot") or {}
        t = _time_taken_seconds(d.get("started_at"), d.get("submitted_at"), snap.get("duration_minutes"))
        if t is not None:
            times.append(t)
    avg_time = round(sum(times) / len(times), 0) if times else None

    return {
        "total_mcq_completed": total_mcq,
        "total_written_submitted": len(written_docs),
        "average_mcq_score_percent": avg_score,
        "average_mcq_accuracy_percent": avg_accuracy,
        "average_time_seconds_mcq": avg_time,
        "written_pending_evaluation": len(written_docs),
        "best_mcq_score_percent": best,
        "mcq_in_progress": mcq_in_progress,
        "written_in_progress": written_in_progress,
    }


# ======================================================================
# List
# ======================================================================
def _mcq_to_item(doc: dict) -> dict:
    snap = doc.get("config_snapshot") or {}
    items = doc.get("items") or []
    status = doc.get("status", "")
    timed_out = bool(doc.get("timed_out"))
    total_q = len(items) or len(doc.get("question_ids") or []) or snap.get("question_count") or 0
    correct = doc.get("correct_count")
    accuracy = None
    if correct is not None and total_q:
        accuracy = round(correct * 100 / total_q, 1)

    started = doc.get("started_at")
    submitted = doc.get("submitted_at")
    time_taken = _time_taken_seconds(started, submitted, snap.get("duration_minutes"))

    can_view = status in GRADED_MCQ

    return {
        "id": str(doc["_id"]),
        "exam_type": "mcq",
        "title": snap.get("title") or "MCQ Exam",
        "status": status,
        "status_label": _mcq_status_label(status, timed_out),
        "score": doc.get("score"),
        "max_score": doc.get("max_score", total_q),
        "score_percent": doc.get("score_percent"),
        "accuracy_percent": accuracy,
        "correct": correct,
        "wrong": doc.get("wrong_count"),
        "unanswered": doc.get("unanswered_count"),
        "time_taken_seconds": time_taken,
        "started_at": started,
        "submitted_at": submitted,
        "timed_out": timed_out,
        "subject_names": _subject_names_from_items(items),
        "chapter_titles": _chapter_titles_from_items(items),
        "question_count": total_q,
        "total_marks": None,
        "end_reason": None,
        "can_view_result": can_view,
        "can_view_paper": False,
    }


def _written_to_item(doc: dict) -> dict:
    snap = doc.get("config_snapshot") or {}
    items = doc.get("items") or []
    status = doc.get("status", "")
    end_reason = doc.get("end_reason")
    started = doc.get("started_at")
    ended = doc.get("ended_at")
    time_taken = _time_taken_seconds(started, ended, snap.get("duration_minutes"))
    q_count = snap.get("question_count") or len(doc.get("question_ids") or []) or len(items)

    return {
        "id": str(doc["_id"]),
        "exam_type": "written",
        "title": snap.get("title") or "Written Exam",
        "status": status,
        "status_label": _written_status_label(status, end_reason),
        "score": None,
        "max_score": None,
        "score_percent": None,
        "accuracy_percent": None,
        "correct": None,
        "wrong": None,
        "unanswered": None,
        "time_taken_seconds": time_taken,
        "started_at": started,
        "submitted_at": ended,
        "timed_out": end_reason == "time_up",
        "subject_names": _subject_names_from_items(items),
        "chapter_titles": _chapter_titles_from_items(items),
        "question_count": q_count,
        "total_marks": snap.get("total_marks"),
        "end_reason": end_reason,
        "can_view_result": False,
        "can_view_paper": bool(items),
    }


async def list_history(
    user: dict,
    *,
    exam_type: str = "all",
    status: str | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = 1,
    page_size: int = PAGE_SIZE_DEFAULT,
    sort: str = "newest",
) -> dict:
    user_id = user["_id"]
    items: list[dict] = []

    if exam_type in ("all", "mcq"):
        query: dict[str, Any] = {"user_id": user_id}
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": ["submitted", "expired", "in_progress"]}
        cursor = get_db()["exam_attempts"].find(query)
        for doc in await cursor.to_list(length=None):
            items.append(_mcq_to_item(doc))

    if exam_type in ("all", "written"):
        query = {"user_id": user_id}
        if status:
            query["status"] = status
        else:
            query["status"] = {"$in": ["ended", "in_progress"]}
        cursor = get_db()["written_exam_sessions"].find(query)
        for doc in await cursor.to_list(length=None):
            items.append(_written_to_item(doc))

    if q:
        needle = q.strip().lower()
        if needle:
            items = [i for i in items if needle in (i.get("title") or "").lower()]

    if date_from or date_to:
        filtered = []
        for i in items:
            ts = _as_utc(i.get("submitted_at") or i.get("started_at"))
            if ts is None:
                continue
            if date_from and ts < _as_utc(date_from):
                continue
            if date_to and ts > _as_utc(date_to):
                continue
            filtered.append(i)
        items = filtered

    if sort in ("newest", "oldest"):
        items.sort(
            key=lambda i: _as_utc(i.get("submitted_at") or i.get("started_at"))
            or datetime.min.replace(tzinfo=timezone.utc),
            reverse=(sort == "newest"),
        )
    elif sort == "score_desc":
        items.sort(key=lambda i: (i.get("score_percent") is None, -(i.get("score_percent") or 0)))
    elif sort == "score_asc":
        items.sort(key=lambda i: (i.get("score_percent") is None, i.get("score_percent") or 0))

    total = len(items)
    start = (page - 1) * page_size
    page_items = items[start : start + page_size]

    stats = await compute_stats(user_id)

    return {
        "items": page_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "stats": stats,
    }


# ======================================================================
# Written detail (metadata only)
# ======================================================================
async def get_written_history(user: dict, session_id: str) -> dict:
    sid = parse_object_id(session_id)
    doc = await get_db()["written_exam_sessions"].find_one({"_id": sid, "user_id": user["_id"]})
    if not doc:
        raise NotFoundError("Written exam session not found.")

    snap = doc.get("config_snapshot") or {}
    items = doc.get("items") or []
    status = doc.get("status", "")
    end_reason = doc.get("end_reason")
    started = doc.get("started_at")
    ended = doc.get("ended_at")

    return {
        "id": str(doc["_id"]),
        "title": snap.get("title") or "Written Exam",
        "status": status,
        "status_label": _written_status_label(status, end_reason),
        "end_reason": end_reason,
        "started_at": started,
        "ended_at": ended,
        "duration_minutes": snap.get("duration_minutes") or 0,
        "time_taken_seconds": _time_taken_seconds(started, ended, snap.get("duration_minutes")),
        "question_count": snap.get("question_count") or len(doc.get("question_ids") or []),
        "marks_per_question": snap.get("marks_per_question") or 10,
        "total_marks": snap.get("total_marks") or 0,
        "evaluation_status": "pending_evaluation" if status == "ended" else "not_applicable",
        "subject_names": _subject_names_from_items(items),
        "note": (
            "Written answers are not stored after the session ends, "
            "and questions are not re-shown for security. "
            "Only session metadata is available in history."
        ),
    }


# ======================================================================
# Analytics (MCQ only — written has no scores)
# ======================================================================
async def get_analytics(user: dict) -> dict:
    user_id = user["_id"]
    docs = (
        await get_db()["exam_attempts"]
        .find({"user_id": user_id, "status": {"$in": list(GRADED_MCQ)}})
        .sort([("submitted_at", 1)])
        .to_list(length=None)
    )

    trend = []
    subject_acc: dict[str, dict] = {}
    chapter_acc: dict[str, dict] = {}
    total_correct = total_wrong = total_unanswered = 0

    for doc in docs:
        snap = doc.get("config_snapshot") or {}
        percent = doc.get("score_percent")
        if percent is not None:
            trend.append(
                {
                    "attempt_id": str(doc["_id"]),
                    "title": snap.get("title") or "MCQ Exam",
                    "submitted_at": doc.get("submitted_at"),
                    "score_percent": percent,
                    "exam_type": "mcq",
                }
            )

        total_correct += doc.get("correct_count") or 0
        total_wrong += doc.get("wrong_count") or 0
        total_unanswered += doc.get("unanswered_count") or 0

        answers = doc.get("answers") or {}
        for item in doc.get("items") or []:
            qid = str(item.get("question_id"))
            selected = answers.get(qid)
            is_correct = selected is not None and selected == item.get("correct_index")
            is_wrong = selected is not None and not is_correct

            sname = _canonical_subject_name(item.get("subject_name")) or "Unknown"
            if sname not in subject_acc:
                subject_acc[sname] = {
                    "name": sname,
                    "attempts": 0,
                    "questions": 0,
                    "correct": 0,
                    "wrong": 0,
                    "unanswered": 0,
                }
            subject_acc[sname]["questions"] += 1
            if is_correct:
                subject_acc[sname]["correct"] += 1
            elif is_wrong:
                subject_acc[sname]["wrong"] += 1
            else:
                subject_acc[sname]["unanswered"] += 1

            ctitle = item.get("chapter_title")
            if ctitle:
                key = f"{sname}::{ctitle}"
                if key not in chapter_acc:
                    chapter_acc[key] = {
                        "name": ctitle,
                        "subject_name": sname,
                        "questions": 0,
                        "correct": 0,
                    }
                chapter_acc[key]["questions"] += 1
                if is_correct:
                    chapter_acc[key]["correct"] += 1

        for n in _subject_names_from_items(doc.get("items") or []):
            if n in subject_acc:
                subject_acc[n]["attempts"] += 1

    subject_list = []
    for s in subject_acc.values():
        q = s["questions"] or 1
        subject_list.append({**s, "accuracy_percent": round(s["correct"] * 100 / q, 1)})
    subject_list.sort(key=lambda x: -x["questions"])

    chapter_list = []
    for c in chapter_acc.values():
        q = c["questions"] or 1
        chapter_list.append({**c, "accuracy_percent": round(c["correct"] * 100 / q, 1)})
    chapter_list.sort(key=lambda x: -x["questions"])

    return {
        "score_trend": trend[-30:],
        "subject_performance": subject_list[:20],
        "chapter_performance": chapter_list[:20],
        "total_correct": total_correct,
        "total_wrong": total_wrong,
        "total_unanswered": total_unanswered,
        "mcq_attempt_count": len(docs),
        "has_enough_data": len(docs) >= 1,
    }