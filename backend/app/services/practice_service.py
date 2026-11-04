"""Student practice: choosing questions, checking answers, saving weak spots."""
from app.core.errors import BadRequestError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.practice import PracticeStartRequest
from app.services.progress_service import percent
from app.services.revision_service import record_revision


# ---------------------------------------------------------------- options
async def get_practice_options() -> dict:
    db = get_db()

    groups_cursor = await db["questions"].aggregate(
        [
            {"$match": {"status": "approved"}},
            {"$group": {"_id": {"s": "$subject_id", "c": "$chapter_id"}, "n": {"$sum": 1}}},
        ]
    )
    groups = await groups_cursor.to_list(length=None)

    per_subject: dict = {}
    per_chapter: dict = {}
    for g in groups:
        sid, cid, n = g["_id"]["s"], g["_id"].get("c"), g["n"]
        per_subject[sid] = per_subject.get(sid, 0) + n
        if cid is not None:
            per_chapter[cid] = per_chapter.get(cid, 0) + n

    subjects = (
        await db["subjects"].find({}, {"name": 1}).sort([("order", 1), ("name", 1)]).to_list(length=None)
    )
    chapters = (
        await db["chapters"]
        .find({"is_published": True}, {"title": 1, "subject_id": 1})
        .sort([("order", 1), ("_id", 1)])
        .to_list(length=None)
    )

    chapters_by_subject: dict = {}
    for ch in chapters:
        count = per_chapter.get(ch["_id"], 0)
        if count > 0:
            chapters_by_subject.setdefault(ch["subject_id"], []).append(
                {"id": str(ch["_id"]), "title": ch["title"], "question_count": count}
            )

    result = []
    for s in subjects:
        count = per_subject.get(s["_id"], 0)
        if count > 0:
            result.append(
                {
                    "id": str(s["_id"]),
                    "name": s["name"],
                    "question_count": count,
                    "chapters": chapters_by_subject.get(s["_id"], []),
                }
            )
    return {"subjects": result}


# ---------------------------------------------------------------- start
async def start_practice(data: PracticeStartRequest) -> dict:
    db = get_db()
    match: dict = {"status": "approved"}
    if data.chapter_id:
        match["chapter_id"] = parse_object_id(data.chapter_id, BadRequestError, "Invalid chapter.")
    elif data.subject_id:
        match["subject_id"] = parse_object_id(data.subject_id, BadRequestError, "Invalid subject.")
    if data.difficulty:
        match["difficulty"] = data.difficulty

    pipeline = [
        {"$match": match},
        {"$sample": {"size": data.count}},
        # Whitelist: the answer and explanation are deliberately NOT included
        {
            "$project": {
                "text": 1,
                "options": 1,
                "difficulty": 1,
                "source": 1,
                "exam_name": 1,
                "year": 1,
                "subject_id": 1,
            }
        },
    ]
    cursor = await db["questions"].aggregate(pipeline)
    docs = await cursor.to_list(length=None)

    seen = set()
    unique_docs = []
    for d in docs:
        if d["_id"] not in seen:
            seen.add(d["_id"])
            unique_docs.append(d)

    if not unique_docs:
        raise BadRequestError("No approved questions match these settings. Try different options.")

    subject_ids = list({d["subject_id"] for d in unique_docs})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    names = {s["_id"]: s["name"] for s in subjects}

    return {
        "questions": [
            {
                "id": str(d["_id"]),
                "text": d["text"],
                "options": d["options"],
                "difficulty": d.get("difficulty", "medium"),
                "source": d.get("source", "pyq"),
                "exam_name": d.get("exam_name"),
                "year": d.get("year"),
                "subject": {"id": str(d["subject_id"]), "name": names.get(d["subject_id"], "Subject")},
            }
            for d in unique_docs
        ]
    }


# ---------------------------------------------------------------- answer
async def submit_answer(user: dict, question_id: str, selected_index: int, mode: str = "practice") -> dict:
    db = get_db()
    qid = parse_object_id(question_id, NotFoundError, "Question not found.")
    question = await db["questions"].find_one({"_id": qid, "status": "approved"})
    if question is None:
        raise NotFoundError("Question not found.")
    if selected_index >= len(question["options"]):
        raise BadRequestError("That option does not exist.")

    is_correct = selected_index == question["correct_index"]

    # Revision answers do not count toward the Practice statistics
    if mode == "practice":
        await db["users"].update_one(
            {"_id": user["_id"]},
            {"$inc": {"practice_answered": 1, "practice_correct": 1 if is_correct else 0}},
        )
    outcome = await record_revision(user["_id"], question, is_correct)

    chapter_ref = None
    if question.get("chapter_id"):
        chapter = await db["chapters"].find_one(
            {"_id": question["chapter_id"], "is_published": True}, {"title": 1}
        )
        if chapter:
            chapter_ref = {"id": str(chapter["_id"]), "title": chapter["title"]}

    return {
        "question_id": str(question["_id"]),
        "is_correct": is_correct,
        "correct_index": question["correct_index"],
        "explanation": question.get("explanation", ""),
        "chapter": chapter_ref,
        "added_to_weak_spots": outcome["saved"],
        "mastered": outcome["mastered"],
        "next_review_days": outcome["next_review_days"],
    }


# ---------------------------------------------------------------- stats
def get_practice_stats(user: dict) -> dict:
    answered = int(user.get("practice_answered") or 0)
    correct = int(user.get("practice_correct") or 0)
    return {
        "answered": answered,
        "correct": correct,
        "accuracy_percent": percent(correct, answered) if answered else None,
    }