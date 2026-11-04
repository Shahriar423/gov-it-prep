"""Builds the numbers shown on the student dashboard."""
from app.db.mongo import get_db
from app.services.progress_service import completed_chapter_ids, percent
from app.services.revision_service import get_summary as get_revision_summary


async def build_dashboard_summary(user: dict) -> dict:
    db = get_db()
    user_id = user["_id"]

    # ---- Subjects and chapter progress (published chapters only) ----
    subject_docs = (
        await db["subjects"]
        .find({}, {"name": 1, "slug": 1})
        .sort([("order", 1), ("name", 1)])
        .to_list(length=None)
    )
    chapter_docs = (
        await db["chapters"].find({"is_published": True}, {"subject_id": 1}).to_list(length=None)
    )

    completed_ids = completed_chapter_ids(user)
    totals: dict = {}
    done: dict = {}
    for chapter in chapter_docs:
        subject_id = chapter.get("subject_id")
        totals[subject_id] = totals.get(subject_id, 0) + 1
        if chapter["_id"] in completed_ids:
            done[subject_id] = done.get(subject_id, 0) + 1

    subjects = []
    chapters_total = 0
    chapters_completed = 0
    for subject in subject_docs:
        total = totals.get(subject["_id"], 0)
        completed = done.get(subject["_id"], 0)
        chapters_total += total
        chapters_completed += completed
        subjects.append(
            {
                "id": str(subject["_id"]),
                "name": subject.get("name", "Untitled subject"),
                "slug": subject.get("slug"),
                "chapters_total": total,
                "chapters_completed": completed,
                "progress_percent": percent(completed, total),
            }
        )

    # ---- Weak spots (same calculation as the Weak spots page) ----
    revision = await get_revision_summary(user_id)

    # ---- Exam attempts (graded ones where at least one question was answered) ----
    attempts = db["exam_attempts"]
    graded = {
        "user_id": user_id,
        "status": {"$in": ["submitted", "expired"]},
        "answered_count": {"$gt": 0},
    }
    exams_taken = await attempts.count_documents(graded)
    recent_docs = (
        await attempts.find(graded, {"score_percent": 1, "submitted_at": 1, "config_snapshot": 1})
        .sort("submitted_at", -1)
        .limit(20)
        .to_list(length=None)
    )

    recent_attempts = []
    percents = []
    for doc in recent_docs:
        pct = int(doc.get("score_percent") or 0)
        percents.append(pct)
        recent_attempts.append(
            {
                "id": str(doc["_id"]),
                "title": (doc.get("config_snapshot") or {}).get("title", "Exam"),
                "score_percent": pct,
                "submitted_at": doc.get("submitted_at"),
            }
        )

    return {
        "stats": {
            "subjects_count": len(subjects),
            "chapters_total": chapters_total,
            "chapters_completed": chapters_completed,
            "overall_progress_percent": percent(chapters_completed, chapters_total),
            "exams_taken": exams_taken,
            "average_score_percent": round(sum(percents) / len(percents)) if percents else None,
            "weak_spots_total": revision["active"],
            "weak_spots_due": revision["due"],
        },
        "subjects": subjects,
        "recent_attempts": recent_attempts[:5],
    }