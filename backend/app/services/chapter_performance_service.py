"""Chapter Performance & Written Preparation.

MCQ metrics come from graded exam_attempts snapshots + revision_schedules.
Written prep is student self-tracking (answers written on paper).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.core.errors import BadRequestError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.chapter_performance import (
    MIN_QUESTIONS_FOR_STATUS,
    STRONG_AT_OR_ABOVE,
    WEAK_BELOW,
)

GRADED = ("submitted", "expired")
WRITTEN_MARKS = 10


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _status_for(attempted: int, accuracy: float | None) -> tuple[str, str, str]:
    if attempted < MIN_QUESTIONS_FOR_STATUS or accuracy is None:
        need = max(0, MIN_QUESTIONS_FOR_STATUS - attempted)
        return (
            "insufficient_data",
            "Insufficient data",
            f"Answer {need} more question{'s' if need != 1 else ''} to classify this chapter",
        )
    if accuracy < WEAK_BELOW:
        return ("weak", "Weak", "Practice this chapter")
    if accuracy < STRONG_AT_OR_ABOVE:
        return ("needs_revision", "Needs revision", "Revise notes and practice")
    return ("strong", "Strong", "Continue mixed practice or mock exams")


def _as_oid(value):
    """Return ObjectId when possible; otherwise None (treat as unmapped)."""
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


# ======================================================================
# MCQ chapter performance
# ======================================================================
async def get_chapter_performance(user_id) -> dict:
    db = get_db()

    # --- Aggregate answers from graded MCQ attempts ---
    # items store chapter_id + subject_name; chapter_title is often absent and resolved below
    attempts = await db["exam_attempts"].find(
        {"user_id": user_id, "status": {"$in": list(GRADED)}}
    ).to_list(length=None)

    # key: real chapter_id string, or "unmapped:<subject_id>" when chapter_id is missing
    stats: dict[str, dict[str, Any]] = {}

    def bucket_key(chapter_id, subject_id) -> str:
        if chapter_id is not None:
            return str(chapter_id)
        return f"unmapped:{subject_id}"

    for att in attempts:
        answers = att.get("answers") or {}
        submitted = att.get("submitted_at")
        for item in att.get("items") or []:
            raw_cid = item.get("chapter_id")
            cid = _as_oid(raw_cid)  # None if missing or invalid
            sid = item.get("subject_id")
            sid_oid = _as_oid(sid) or sid
            key = bucket_key(cid, sid_oid)
            is_unmapped = cid is None  # missing/invalid chapter_id only — never invent a chapter
            if key not in stats:
                raw_sname = item.get("subject_name") or "Unknown"
                if isinstance(raw_sname, str) and raw_sname.strip().casefold() == "technical":
                    raw_sname = "IT"
                stats[key] = {
                    "chapter_id": cid,
                    "subject_id": sid_oid,
                    "subject_name": raw_sname,
                    "chapter_title": (
                        "Unmapped questions"
                        if is_unmapped
                        else (item.get("chapter_title") or "Chapter")
                    ),
                    "is_unmapped": is_unmapped,
                    "unmap_reason": (
                        "missing_chapter_id"
                        if raw_cid is None
                        else ("invalid_chapter_id" if is_unmapped else None)
                    ),
                    "sample_question_ids": [],
                    "correct": 0,
                    "incorrect": 0,
                    "attempted": 0,
                    "last_practiced_at": None,
                }
            qid = str(item.get("question_id"))
            selected = answers.get(qid)
            if selected is None:
                continue
            stats[key]["attempted"] += 1
            if selected == item.get("correct_index"):
                stats[key]["correct"] += 1
            else:
                stats[key]["incorrect"] += 1
            if is_unmapped and qid and qid not in stats[key]["sample_question_ids"]:
                if len(stats[key]["sample_question_ids"]) < 5:
                    stats[key]["sample_question_ids"].append(qid)
            if submitted and (
                stats[key]["last_practiced_at"] is None
                or submitted > stats[key]["last_practiced_at"]
            ):
                stats[key]["last_practiced_at"] = submitted
            if item.get("chapter_title") and not is_unmapped:
                stats[key]["chapter_title"] = item["chapter_title"]
            if item.get("subject_name"):
                sname = item["subject_name"]
                if isinstance(sname, str) and sname.strip().casefold() == "technical":
                    sname = "IT"
                stats[key]["subject_name"] = sname

    # Resolve chapter titles from the chapters collection (never invent a chapter)
    chapter_oids = [v["chapter_id"] for v in stats.values() if v.get("chapter_id")]
    if chapter_oids:
        ch_docs = await db["chapters"].find(
            {"_id": {"$in": chapter_oids}}, {"title": 1, "subject_id": 1}
        ).to_list(length=None)
        ch_map = {c["_id"]: c for c in ch_docs}
        for v in stats.values():
            cid = v.get("chapter_id")
            if not cid:
                continue
            if cid in ch_map:
                v["chapter_title"] = ch_map[cid].get("title") or v["chapter_title"]
                v["is_unmapped"] = False
                v["unmap_reason"] = None
            else:
                # chapter_id present but chapter document missing — keep out of normal chapter list
                v["chapter_title"] = "Missing chapter record"
                v["is_unmapped"] = True
                v["unmap_reason"] = "chapter_not_found"

    # --- Revision counts per chapter (and unmapped / null chapter_id) ---
    now = _now()
    rev_pipeline = [
        {"$match": {"user_id": user_id}},
        {
            "$group": {
                "_id": "$chapter_id",
                "active": {
                    "$sum": {"$cond": [{"$eq": ["$status", "active"]}, 1, 0]}
                },
                "due": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$eq": ["$status", "active"]},
                                    {"$lte": ["$next_review_at", now]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
                "mastered": {
                    "$sum": {"$cond": [{"$eq": ["$status", "mastered"]}, 1, 0]}
                },
            }
        },
    ]
    rev_cursor = await db["revision_schedules"].aggregate(rev_pipeline)
    rev_rows = await rev_cursor.to_list(length=None)
    rev_by_chapter = {r["_id"]: r for r in rev_rows}

    # Include chapters that only appear in revision (no graded attempts yet)
    for cid, r in rev_by_chapter.items():
        if cid is None:
            key = "unmapped:__none__"
            if key not in stats:
                stats[key] = {
                    "chapter_id": None,
                    "subject_id": None,
                    "subject_name": "Various",
                    "chapter_title": "Unmapped questions",
                    "is_unmapped": True,
                    "correct": 0,
                    "incorrect": 0,
                    "attempted": 0,
                    "last_practiced_at": None,
                }
            continue
        key = str(cid)
        if key not in stats:
            ch = await db["chapters"].find_one({"_id": cid}, {"title": 1, "subject_id": 1})
            subj_name = "Unknown"
            sid = None
            if ch:
                sid = ch.get("subject_id")
                if sid:
                    s = await db["subjects"].find_one({"_id": sid}, {"name": 1})
                    subj_name = (s or {}).get("name") or "Unknown"
            stats[key] = {
                "chapter_id": cid,
                "subject_id": sid,
                "subject_name": subj_name,
                "chapter_title": (ch or {}).get("title") or "Chapter",
                "is_unmapped": False,
                "correct": 0,
                "incorrect": 0,
                "attempted": 0,
                "last_practiced_at": None,
            }

    chapters_out = []
    unmapped_out = []
    sum_assessed = sum_practice = sum_insufficient = sum_revision = sum_strong = 0
    rev_due_total = sum(int(r.get("due") or 0) for r in rev_rows)
    rev_active_total = sum(int(r.get("active") or 0) for r in rev_rows)
    rev_mastered_total = sum(int(r.get("mastered") or 0) for r in rev_rows)
    rev_later_total = max(0, rev_active_total - rev_due_total)

    for key, v in stats.items():
        cid = v.get("chapter_id")
        is_unmapped = bool(v.get("is_unmapped"))
        rev = rev_by_chapter.get(cid) or {}
        due = int(rev.get("due") or 0)
        active = int(rev.get("active") or 0)

        attempted = v["attempted"]
        correct = v["correct"]
        incorrect = v["incorrect"]
        accuracy = round(correct * 100 / attempted, 1) if attempted else None
        status, label, action = _status_for(attempted, accuracy)
        need_more = max(0, MIN_QUESTIONS_FOR_STATUS - attempted)

        if due > 0 and status in ("strong", "needs_revision"):
            action = f"Revise {due} due question{'s' if due != 1 else ''}"

        if not is_unmapped:
            if attempted > 0 or active > 0:
                sum_assessed += 1
            if status == "weak":
                sum_practice += 1  # genuinely weak only
            if status == "insufficient_data" and attempted > 0:
                sum_insufficient = sum_insufficient + 1
            if status == "needs_revision" or due > 0:
                sum_revision += 1
            if status == "strong":
                sum_strong += 1

        row = {
            "chapter_id": str(cid) if cid else None,
            "chapter_title": v["chapter_title"],
            "subject_id": str(v["subject_id"]) if v.get("subject_id") else None,
            "subject_name": v["subject_name"],
            "is_unmapped": is_unmapped,
            "unmap_reason": v.get("unmap_reason"),
            "sample_question_ids": v.get("sample_question_ids") or [],
            "questions_attempted": attempted,
            "correct": correct,
            "incorrect": incorrect,
            "accuracy_percent": accuracy,
            "questions_needed_for_status": need_more if status == "insufficient_data" else 0,
            "revision_due": due,
            "revision_active": active,
            "revision_later": max(0, active - due),
            "last_practiced_at": v.get("last_practiced_at"),
            "status": status,
            "status_label": label,
            "recommended_action": action,
        }
        if is_unmapped:
            unmapped_out.append(row)
        else:
            chapters_out.append(row)

    def sort_key(c):
        order = {"weak": 0, "needs_revision": 1, "insufficient_data": 2, "strong": 3}
        return (order.get(c["status"], 9), -c["revision_due"], -(c["accuracy_percent"] or 0))

    chapters_out.sort(key=sort_key)
    unmapped_out.sort(key=sort_key)

    return {
        "summary": {
            "chapters_assessed": sum_assessed,
            "chapters_needing_practice": sum_practice,
            "chapters_need_more_data": sum_insufficient,
            "chapters_needing_revision": sum_revision,
            "strong_chapters": sum_strong,
            "revision_due_total": rev_due_total,
            "revision_later_total": rev_later_total,
            "revision_active_total": rev_active_total,
            "revision_mastered_total": rev_mastered_total,
        },
        "chapters": chapters_out,
        "unmapped": unmapped_out,
        "thresholds": {
            "min_questions": MIN_QUESTIONS_FOR_STATUS,
            "weak_below": WEAK_BELOW,
            "strong_at_or_above": STRONG_AT_OR_ABOVE,
        },
    }



# ======================================================================
# Written preparation (self-tracking)
# ======================================================================
async def get_written_prep(user_id, subject_id: str | None = None) -> dict:
    db = get_db()
    q_match: dict = {"status": "approved"}
    if subject_id:
        q_match["subject_id"] = parse_object_id(subject_id, BadRequestError, "Invalid subject.")

    questions = await db["written_questions"].find(q_match).to_list(length=None)
    if not questions:
        return {
            "summary": {
                "total_questions": 0,
                "not_attempted": 0,
                "attempted": 0,
                "needs_improvement": 0,
                "confident": 0,
            },
            "chapters": [],
            "questions": [],
        }

    qids = [q["_id"] for q in questions]
    statuses = await db["written_prep_status"].find(
        {"user_id": user_id, "question_id": {"$in": qids}}
    ).to_list(length=None)
    status_map = {s["question_id"]: s for s in statuses}

    subject_ids = list({q["subject_id"] for q in questions if q.get("subject_id")})
    chapter_ids = list({q["chapter_id"] for q in questions if q.get("chapter_id")})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    chapters = (
        await db["chapters"]
        .find({"_id": {"$in": chapter_ids}}, {"title": 1, "subject_id": 1})
        .to_list(length=None)
        if chapter_ids
        else []
    )
    subj_map = {s["_id"]: s["name"] for s in subjects}
    chap_map = {c["_id"]: c for c in chapters}

    # Check for model answers (approved written questions may have model_answer field)
    items = []
    chapter_buckets: dict[str, dict] = {}

    counts = {"not_attempted": 0, "attempted": 0, "needs_improvement": 0, "confident": 0}

    for q in questions:
        st = status_map.get(q["_id"])
        prep = (st or {}).get("status") or "not_attempted"
        if prep not in counts:
            prep = "not_attempted"
        counts[prep] += 1

        cid = q.get("chapter_id")
        sid = q.get("subject_id")
        ctitle = chap_map.get(cid, {}).get("title") if cid else None
        sname = subj_map.get(sid, "Unknown")

        has_model = bool(q.get("model_answer") or q.get("marking_points"))

        items.append(
            {
                "question_id": str(q["_id"]),
                "text": q.get("text") or "",
                "subject_id": str(sid) if sid else None,
                "subject_name": sname,
                "chapter_id": str(cid) if cid else None,
                "chapter_title": ctitle,
                "marks": WRITTEN_MARKS,
                "difficulty": q.get("difficulty") or "medium",
                "prep_status": prep,
                "self_assessed_marks": (st or {}).get("self_assessed_marks"),
                "last_reviewed_at": (st or {}).get("last_reviewed_at"),
                "has_model_answer": has_model,
            }
        )

        bkey = str(cid) if cid else f"none:{sid}"
        if bkey not in chapter_buckets:
            chapter_buckets[bkey] = {
                "chapter_id": str(cid) if cid else None,
                "chapter_title": ctitle or "Uncategorised",
                "subject_id": str(sid) if sid else None,
                "subject_name": sname,
                "available_questions": 0,
                "not_attempted": 0,
                "attempted": 0,
                "needs_improvement": 0,
                "confident": 0,
            }
        b = chapter_buckets[bkey]
        b["available_questions"] += 1
        b[prep] = b.get(prep, 0) + 1

    chapter_list = []
    for b in chapter_buckets.values():
        if b["not_attempted"] > 0:
            action = "Attempt unattempted questions on paper"
        elif b["needs_improvement"] > 0:
            action = "Retry questions marked Needs Improvement"
        elif b["attempted"] > 0:
            action = "Review attempted questions and mark confidence"
        else:
            action = "Maintain confidence with periodic review"
        b["recommended_action"] = action
        chapter_list.append(b)

    chapter_list.sort(key=lambda c: (-c["not_attempted"], -c["needs_improvement"], c["chapter_title"]))

    return {
        "summary": {
            "total_questions": len(questions),
            "not_attempted": counts["not_attempted"],
            "attempted": counts["attempted"],
            "needs_improvement": counts["needs_improvement"],
            "confident": counts["confident"],
        },
        "chapters": chapter_list,
        "questions": items,
    }


async def update_written_prep(user_id, question_id: str, status: str, self_marks: int | None) -> dict:
    db = get_db()
    qid = parse_object_id(question_id, BadRequestError, "Invalid question.")
    q = await db["written_questions"].find_one({"_id": qid, "status": "approved"})
    if not q:
        raise NotFoundError("Written question not found.")

    allowed = {"not_attempted", "attempted", "needs_improvement", "confident"}
    if status not in allowed:
        raise BadRequestError("Invalid preparation status.")

    now = _now()
    doc = {
        "user_id": user_id,
        "question_id": qid,
        "subject_id": q.get("subject_id"),
        "chapter_id": q.get("chapter_id"),
        "status": status,
        "self_assessed_marks": self_marks,
        "last_reviewed_at": now,
        "updated_at": now,
    }
    await db["written_prep_status"].update_one(
        {"user_id": user_id, "question_id": qid},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {
        "question_id": str(qid),
        "prep_status": status,
        "self_assessed_marks": self_marks,
        "last_reviewed_at": now,
    }