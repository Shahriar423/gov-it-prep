"""Automatic exam creation from the approved question banks.

No AI is called here. A student only ever receives questions that already exist in the database
and are approved by an admin.

- MCQ exams reuse the existing `exam_attempts` collection, so the timer, autosave, scoring,
  negative marking, results and Weak Spots work through the existing code unchanged.
- Written exams are display-only sessions in their own collection, so they can never be graded,
  counted in MCQ averages, or touch Weak Spots."""
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.constants import (
    MAX_WRITTEN_QUESTIONS,
    NON_TECHNICAL_SUBJECTS,
    WRITTEN_MARKS_PER_QUESTION,
)
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.schemas.auto_exam import CreateExamRequest
from app.services import exam_planning, exam_service

ACTIVE_EXISTS = "You already have an exam in progress. Finish it before starting another."
COLLECTIONS = {"mcq": "questions", "written": "written_questions"}
CATEGORY_LABELS = {"technical": "Technical", "non_technical": "Non-Technical"}
NON_TECH_KEYS = {name.casefold() for name in NON_TECHNICAL_SUBJECTS}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seconds_left(deadline: datetime, now: datetime) -> int:
    return max(0, math.ceil((deadline - now).total_seconds()))


# ======================================================================
# Structure: which subjects and chapters exist, and how many questions each has
# ======================================================================
@dataclass
class _Structure:
    technical_subjects: list
    non_technical: dict  # casefolded name -> subject document
    chapters: list


async def _load_structure() -> _Structure:
    db = get_db()
    subjects = await db["subjects"].find({}, {"name": 1}).sort([("order", 1), ("name", 1)]).to_list(length=None)
    chapters = (
        await db["chapters"]
        .find({}, {"title": 1, "subject_id": 1})
        .sort([("order", 1), ("_id", 1)])
        .to_list(length=None)
    )
    technical = [s for s in subjects if s["name"].strip().casefold() not in NON_TECH_KEYS]
    non_technical = {
        s["name"].strip().casefold(): s for s in subjects if s["name"].strip().casefold() in NON_TECH_KEYS
    }
    return _Structure(technical, non_technical, chapters)


async def _group_counts(collection: str) -> list[tuple]:
    """[(subject_id, chapter_id or None, number of approved questions), ...]"""
    cursor = await get_db()[collection].aggregate(
        [
            {"$match": {"status": "approved"}},
            {"$group": {"_id": {"s": "$subject_id", "c": "$chapter_id"}, "n": {"$sum": 1}}},
        ]
    )
    return [(row["_id"]["s"], row["_id"].get("c"), row["n"]) for row in await cursor.to_list(length=None)]


def _by_chapter(groups: list[tuple]) -> dict:
    result: dict = {}
    for _, chapter_id, n in groups:
        if chapter_id is not None:
            result[chapter_id] = result.get(chapter_id, 0) + n
    return result


def _by_subject(groups: list[tuple]) -> dict:
    result: dict = {}
    for subject_id, _, n in groups:
        result[subject_id] = result.get(subject_id, 0) + n
    return result


# ======================================================================
# Active exams (an MCQ attempt or a written session)
# ======================================================================
async def _get_active_written(user_id) -> dict | None:
    sessions = get_db()["written_exam_sessions"]
    session = await sessions.find_one({"user_id": user_id, "status": "in_progress"})
    if session is None:
        return None
    now = _now()
    if now >= session["deadline_at"]:
        await _end_written(session, "time_up", now)
        return None
    return session


async def _active_exam(user_id) -> dict | None:
    now = _now()
    attempt = await exam_service._get_active_attempt(user_id)  # also finishes an overdue MCQ attempt
    if attempt:
        return {
            "type": "mcq",
            "id": str(attempt["_id"]),
            "title": attempt["config_snapshot"]["title"],
            "remaining_seconds": _seconds_left(attempt["deadline_at"], now),
        }
    session = await _get_active_written(user_id)
    if session:
        return {
            "type": "written",
            "id": str(session["_id"]),
            "title": session["config_snapshot"]["title"],
            "remaining_seconds": _seconds_left(session["deadline_at"], now),
        }
    return None


# ======================================================================
# Builder options
# ======================================================================
async def get_builder(user: dict) -> dict:
    structure = await _load_structure()
    mcq_groups = await _group_counts("questions")
    written_groups = await _group_counts("written_questions")

    mcq_chapter, written_chapter = _by_chapter(mcq_groups), _by_chapter(written_groups)
    mcq_subject, written_subject = _by_subject(mcq_groups), _by_subject(written_groups)

    tech_names = {s["_id"]: s["name"] for s in structure.technical_subjects}
    technical_items = [
        {
            "id": str(ch["_id"]),
            "label": ch["title"],
            "group": tech_names[ch["subject_id"]],
            "mcq_count": mcq_chapter.get(ch["_id"], 0),
            "written_count": written_chapter.get(ch["_id"], 0),
        }
        for ch in structure.chapters
        if ch["subject_id"] in tech_names
    ]
    technical = {
        "key": "technical",
        "label": CATEGORY_LABELS["technical"],
        "items": technical_items,
        "mcq_total": sum(mcq_subject.get(sid, 0) for sid in tech_names),
        "written_total": sum(written_subject.get(sid, 0) for sid in tech_names),
    }

    non_technical_items = []
    for name in NON_TECHNICAL_SUBJECTS:
        subject = structure.non_technical.get(name.casefold())
        if subject:
            non_technical_items.append(
                {
                    "id": str(subject["_id"]),
                    "label": subject["name"],
                    "group": None,
                    "mcq_count": mcq_subject.get(subject["_id"], 0),
                    "written_count": written_subject.get(subject["_id"], 0),
                }
            )
    non_technical = {
        "key": "non_technical",
        "label": CATEGORY_LABELS["non_technical"],
        "items": non_technical_items,
        "mcq_total": sum(i["mcq_count"] for i in non_technical_items),
        "written_total": sum(i["written_count"] for i in non_technical_items),
    }

    return {
        "categories": [technical, non_technical],
        "active_exam": await _active_exam(user["_id"]),
    }


# ======================================================================
# Planning: what the exam will draw from
# ======================================================================
@dataclass
class _Scope:
    label: str
    match: dict
    available: int = 0
    quota: int = 0


@dataclass
class _Plan:
    title: str
    scopes: list = field(default_factory=list)
    distribute: bool = False  # True: split equally across the scopes (all Non-Technical subjects)
    filters: dict = field(default_factory=dict)


async def _build_plan(*, category: str, selection: str, difficulty: str) -> _Plan:
    structure = await _load_structure()
    label = CATEGORY_LABELS[category]
    filters = {"category": category, "selection": selection, "difficulty": difficulty}

    if category == "technical":
        technical_ids = [s["_id"] for s in structure.technical_subjects]
        if selection == "all":
            if not technical_ids:
                raise BadRequestError(
                    "There are no Technical subjects yet. Ask an admin to set up the exam structure."
                )
            scope = _Scope("All Technical chapters", {"subject_id": {"$in": technical_ids}})
            return _Plan(f"{label} · All chapters", [scope], False, filters)

        chapter_id = parse_object_id(selection, BadRequestError, "Please choose a valid chapter.")
        chapter = next(
            (c for c in structure.chapters if c["_id"] == chapter_id and c["subject_id"] in technical_ids),
            None,
        )
        if chapter is None:
            raise BadRequestError("Please choose a valid Technical chapter.")
        scope = _Scope(chapter["title"], {"chapter_id": chapter["_id"]})
        return _Plan(f"{label} · {chapter['title']}", [scope], False, filters)

    # Non-Technical
    if selection == "all":
        missing = [n for n in NON_TECHNICAL_SUBJECTS if n.casefold() not in structure.non_technical]
        if missing:
            raise BadRequestError(
                f"The Non-Technical subjects are not fully set up (missing: {', '.join(missing)}). "
                "Ask an admin to create them in Admin > Exam structure."
            )
        scopes = [
            _Scope(name, {"subject_id": structure.non_technical[name.casefold()]["_id"]})
            for name in NON_TECHNICAL_SUBJECTS
        ]
        return _Plan(f"{label} · All subjects", scopes, True, filters)

    subject_id = parse_object_id(selection, BadRequestError, "Please choose a valid subject.")
    subject = next((s for s in structure.non_technical.values() if s["_id"] == subject_id), None)
    if subject is None:
        raise BadRequestError("Please choose a valid Non-Technical subject.")
    scope = _Scope(subject["name"], {"subject_id": subject["_id"]})
    return _Plan(f"{label} · {subject['name']}", [scope], False, filters)


def _scope_query(scope: _Scope, difficulty: str) -> dict:
    query = {**scope.match, "status": "approved"}
    if difficulty != "mixed":
        query["difficulty"] = difficulty
    return query


async def _count_scopes(plan: _Plan, kind: str, difficulty: str) -> None:
    collection = get_db()[COLLECTIONS[kind]]
    for scope in plan.scopes:
        scope.available = await collection.count_documents(_scope_query(scope, difficulty))


def _join(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _evaluate(plan: _Plan, kind: str, count: int, rng: random.Random) -> tuple[bool, str]:
    """Fills each scope's quota. Returns (can the exam be built, message for the student)."""
    noun = "MCQ" if kind == "mcq" else "written"
    total = sum(s.available for s in plan.scopes)
    for scope in plan.scopes:
        scope.quota = 0

    if total < count:
        return False, (
            f"Only {total} approved {noun} question{'' if total == 1 else 's'} match these settings, "
            f"but {count} {'was' if count == 1 else 'were'} requested. Choose fewer questions, "
            "a different difficulty or topic, or ask an admin to add more questions."
        )

    if not plan.distribute:
        plan.scopes[0].quota = count
        # Detailed counts are returned for admins; student UI hides them.
        return True, f"{total} approved {noun} questions are available. Your exam will use {count}."

    parts = len(plan.scopes)
    quotas = exam_planning.assign_quotas(count, [s.available for s in plan.scopes], rng)
    if quotas is None:
        base = count // parts
        upper = math.ceil(count / parts)
        lacking = [s.label for s in plan.scopes if s.available < base] or [
            s.label for s in plan.scopes if s.available < upper
        ]
        return False, (
            f"The {count} questions must be split equally across {_join([s.label for s in plan.scopes])} "
            f"(about {upper} from each), but {_join(lacking)} {'does' if len(lacking) == 1 else 'do'} not "
            f"have enough approved {noun} questions for that. Choose fewer questions, a different "
            "difficulty, or one subject, or ask an admin to add more questions."
        )

    for scope, quota in zip(plan.scopes, quotas):
        scope.quota = quota
    return True, (
        f"{total} approved {noun} questions are available. Your {count} questions will be split equally "
        f"across {_join([s.label for s in plan.scopes])}."
    )


# ======================================================================
# Availability (shown live in the builder)
# ======================================================================
async def check_availability(*, kind: str, category: str, selection: str, difficulty: str, count: int) -> dict:
    plan = await _build_plan(category=category, selection=selection, difficulty=difficulty)
    await _count_scopes(plan, kind, difficulty)
    ok, message = _evaluate(plan, kind, count, random.Random())

    parts = []
    if plan.distribute:
        upper = math.ceil(count / len(plan.scopes))
        parts = [
            {"label": s.label, "available": s.available, "needed": s.quota if ok else upper}
            for s in plan.scopes
        ]
    return {
        "ok": ok,
        "type": kind,
        "requested": count,
        "available": sum(s.available for s in plan.scopes),
        "parts": parts,
        "message": message,
    }


# ======================================================================
# Creating an exam
# ======================================================================
async def _sample(plan: _Plan, kind: str, difficulty: str, rng: random.Random) -> list[dict]:
    """Picks the questions at random: exactly each scope's quota, never a duplicate."""
    collection = get_db()[COLLECTIONS[kind]]
    changed = BadRequestError("The available questions changed while the exam was being created. Please try again.")

    picked: list = []
    for scope in plan.scopes:
        if scope.quota == 0:
            continue
        rows = await collection.find(_scope_query(scope, difficulty), {"_id": 1}).to_list(length=None)
        ids = [row["_id"] for row in rows]
        if len(ids) < scope.quota:
            raise changed
        picked.extend(rng.sample(ids, scope.quota))

    docs = await collection.find({"_id": {"$in": picked}, "status": "approved"}).to_list(length=None)
    if len(docs) != len(picked):
        raise changed
    rng.shuffle(docs)
    return docs


async def create_exam(user: dict, request: CreateExamRequest) -> dict:
    kind = request.type
    if kind == "written" and request.count > MAX_WRITTEN_QUESTIONS:
        raise BadRequestError(f"A written exam can have at most {MAX_WRITTEN_QUESTIONS} questions.")

    if await _active_exam(user["_id"]):
        raise ConflictError(ACTIVE_EXISTS)

    rng = random.Random()
    plan = await _build_plan(category=request.category, selection=request.selection, difficulty=request.difficulty)
    await _count_scopes(plan, kind, request.difficulty)
    ok, message = _evaluate(plan, kind, request.count, rng)
    if not ok:
        raise BadRequestError(message)

    questions = await _sample(plan, kind, request.difficulty, rng)
    if kind == "mcq":
        return await _start_mcq(user, plan, request, questions)
    return await _start_written(user, plan, request, questions)


def _filters_snapshot(plan: _Plan, request: CreateExamRequest) -> dict:
    return {
        **plan.filters,
        "requested_count": request.count,
        "distribution": {s.label: s.quota for s in plan.scopes} if plan.distribute else None,
    }


async def _start_mcq(user: dict, plan: _Plan, request: CreateExamRequest, questions: list[dict]) -> dict:
    db = get_db()
    subject_ids = list({q["subject_id"] for q in questions})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    names = {s["_id"]: s["name"] for s in subjects}

    # A private copy of each question, in the same shape the existing exam room and grading expect.
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
        "exam_id": None,
        "kind": "auto",
        "config_snapshot": {
            "title": plan.title,
            "duration_minutes": request.duration_minutes,
            "negative_marking": request.negative_marking,
            "question_count": len(items),
            "filters": _filters_snapshot(plan, request),
        },
        "question_ids": [i["question_id"] for i in items],
        "items": items,
        "answers": {},
        "started_at": now,
        "deadline_at": now + timedelta(minutes=request.duration_minutes),
        "status": "in_progress",
        "created_at": now,
    }
    try:
        result = await db["exam_attempts"].insert_one(attempt)
    except DuplicateKeyError:
        raise ConflictError(ACTIVE_EXISTS)
    return {"type": "mcq", "id": str(result.inserted_id)}


async def _start_written(user: dict, plan: _Plan, request: CreateExamRequest, questions: list[dict]) -> dict:
    db = get_db()
    subject_ids = list({q["subject_id"] for q in questions})
    chapter_ids = list({q["chapter_id"] for q in questions if q.get("chapter_id")})
    subjects = await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
    chapters = (
        await db["chapters"].find({"_id": {"$in": chapter_ids}}, {"title": 1}).to_list(length=None)
        if chapter_ids
        else []
    )
    subject_names = {s["_id"]: s["name"] for s in subjects}
    chapter_titles = {c["_id"]: c["title"] for c in chapters}

    items = [
        {
            "question_id": q["_id"],
            "text": q["text"],
            "marks": WRITTEN_MARKS_PER_QUESTION,  # always exactly 10
            "subject_id": q["subject_id"],
            "subject_name": subject_names.get(q["subject_id"], "Subject"),
            "chapter_id": q.get("chapter_id"),
            "chapter_title": chapter_titles.get(q.get("chapter_id")),
            "difficulty": q.get("difficulty", "medium"),
            "source": q.get("source", "manual"),
        }
        for q in questions
    ]

    now = _now()
    session = {
        "user_id": user["_id"],
        "status": "in_progress",
        "end_reason": None,
        "config_snapshot": {
            "title": plan.title,
            "duration_minutes": request.duration_minutes,
            "question_count": len(items),
            "marks_per_question": WRITTEN_MARKS_PER_QUESTION,
            "total_marks": len(items) * WRITTEN_MARKS_PER_QUESTION,
            "filters": _filters_snapshot(plan, request),
        },
        "question_ids": [i["question_id"] for i in items],
        "items": items,  # removed as soon as the session ends, so the questions can never be shown again
        "started_at": now,
        "deadline_at": now + timedelta(minutes=request.duration_minutes),
        "ended_at": None,
        "created_at": now,
    }
    try:
        result = await db["written_exam_sessions"].insert_one(session)
    except DuplicateKeyError:
        raise ConflictError(ACTIVE_EXISTS)
    return {"type": "written", "id": str(result.inserted_id)}


# ======================================================================
# Written exam sessions: display only, server-enforced deadline
# ======================================================================
async def _load_written(user: dict, session_id: str) -> dict:
    sid = parse_object_id(session_id, NotFoundError, "Written exam not found.")
    session = await get_db()["written_exam_sessions"].find_one({"_id": sid, "user_id": user["_id"]})
    if session is None:
        raise NotFoundError("Written exam not found.")
    return session


async def _end_written(session: dict, reason: str, now: datetime) -> dict:
    """Ends the session once, and deletes the stored question text."""
    sessions = get_db()["written_exam_sessions"]
    ended_at = min(now, session["deadline_at"]) if reason == "time_up" else now
    updated = await sessions.find_one_and_update(
        {"_id": session["_id"], "status": "in_progress"},
        {
            "$set": {"status": "ended", "end_reason": reason, "ended_at": ended_at},
            "$unset": {"items": ""},
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:  # someone else ended it first
        updated = await sessions.find_one({"_id": session["_id"]})
    return updated


def _written_state(session: dict, now: datetime) -> dict:
    snapshot = session["config_snapshot"]
    # Questions are returned ONLY while the session is in progress and the deadline has not passed
    live = session["status"] == "in_progress" and now < session["deadline_at"]

    questions = []
    if live:
        questions = [
            {
                "number": number,
                "id": str(item["question_id"]),
                "text": item["text"],
                "marks": item["marks"],
                "subject_name": item["subject_name"],
                "chapter_title": item.get("chapter_title"),
                "difficulty": item["difficulty"],
            }
            for number, item in enumerate(session.get("items", []), start=1)
        ]

    return {
        "id": str(session["_id"]),
        "title": snapshot["title"],
        "status": "in_progress" if live else "ended",
        "end_reason": None if live else (session.get("end_reason") or "time_up"),
        "duration_minutes": snapshot["duration_minutes"],
        "question_count": snapshot["question_count"],
        "marks_per_question": snapshot["marks_per_question"],
        "total_marks": snapshot["total_marks"],
        "remaining_seconds": _seconds_left(session["deadline_at"], now) if live else 0,
        "questions": questions,
    }


async def get_written(user: dict, session_id: str) -> dict:
    session = await _load_written(user, session_id)
    now = _now()
    if session["status"] == "in_progress" and now >= session["deadline_at"]:
        session = await _end_written(session, "time_up", now)
    return _written_state(session, now)


async def finish_written(user: dict, session_id: str) -> dict:
    session = await _load_written(user, session_id)
    now = _now()
    if session["status"] == "in_progress":
        reason = "time_up" if now >= session["deadline_at"] else "finished_early"
        session = await _end_written(session, reason, now)
    return _written_state(session, now)