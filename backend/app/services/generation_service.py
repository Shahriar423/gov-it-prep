"""AI question generation from stored source text: jobs, the background runner, and queries.

How it works
- An admin starts a job for one source material. The job runs in the background of this server.
- For every text chunk: the AI writes questions (call 1), then an independent second AI call checks
  each question against the passage without seeing the writer's answer (call 2). Only questions that
  pass every rule and the independent check are saved, as approved, labelled "ai".
- Progress is stored per chunk, so a stopped or interrupted job resumes without redoing finished chunks.
- Only one job runs at a time (enforced by a database index), and the server must run a single worker."""
import asyncio
import logging
import random
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.ai import llm_client, mcq_logic, usage
from app.ai.errors import (
    AiConfigError,
    AiError,
    AiNotConfigured,
    AiQuotaError,
    AiResponseError,
)
from app.ai.prompt_loader import render_prompt
from app.ai.schemas import GENERATE_SCHEMA, VERIFY_SCHEMA
from app.core.config import settings
from app.core.constants import TARGET_EXAMS
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db

logger = logging.getLogger("uvicorn.error")

JOB_TYPE = "mcq_from_notes"
PROMPT_VERSION = "mcq-v1"
MIN_CHUNK_WORDS = 60            # shorter chunks are skipped without spending an AI request
MAX_CONSECUTIVE_FAILURES = 5    # then the job pauses instead of burning requests
MAX_OUTPUT_TOKENS = 8192

_RUNNERS: dict[str, asyncio.Task] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ======================================================================
# Small helpers
# ======================================================================
async def _get_material(material_id: str) -> dict:
    oid = parse_object_id(material_id, NotFoundError, "Material not found.")
    material = await get_db()["source_materials"].find_one({"_id": oid})
    if material is None:
        raise NotFoundError("Material not found.")
    return material


async def _get_job(job_id: str) -> dict:
    jid = parse_object_id(job_id, NotFoundError, "Job not found.")
    job = await get_db()["generation_jobs"].find_one({"_id": jid})
    if job is None:
        raise NotFoundError("Job not found.")
    return job


def _job_item(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "material_id": str(doc["material_id"]),
        "material_title": doc.get("material_title", ""),
        "status": doc["status"],
        "pause_reason": doc.get("pause_reason"),
        "questions_per_chunk": doc["questions_per_chunk"],
        "provider": doc.get("provider", ""),
        "model": doc.get("model", ""),
        "chunks_processed": doc.get("chunks_processed", 0),
        "chunks_failed": doc.get("chunks_failed", 0),
        "chunks_skipped": doc.get("chunks_skipped", 0),
        "candidates": doc.get("candidates", 0),
        "accepted": doc.get("accepted", 0),
        "rejected": doc.get("rejected", 0),
        "rejected_by_reason": doc.get("rejected_by_reason", {}),
        "api_calls": doc.get("api_calls", 0),
        "last_error": doc.get("last_error"),
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "finished_at": doc.get("finished_at"),
    }


async def ai_status_out() -> dict:
    status = llm_client.get_status()
    return {
        "configured": status.configured,
        "provider": status.provider,
        "model": status.model,
        "missing": status.missing,
        "message": status.message,
        "used_today": await usage.get_used_today(),
        "daily_limit": settings.ai_max_requests_per_day,
        "per_minute_limit": settings.ai_max_requests_per_minute,
    }


async def assert_not_generating(material_id: str) -> None:
    """Used before a material is deleted: a running job would keep writing for it."""
    oid = parse_object_id(material_id, NotFoundError, "Material not found.")
    if await get_db()["generation_jobs"].find_one({"material_id": oid, "status": "running"}, {"_id": 1}):
        raise ConflictError("Question generation is running for this material. Stop it before deleting the material.")


# ======================================================================
# Overview and listing
# ======================================================================
async def get_overview(material_id: str) -> dict:
    db = get_db()
    material = await _get_material(material_id)
    mid = material["_id"]

    chunk_cursor = await db["source_chunks"].aggregate(
        [{"$match": {"material_id": mid}}, {"$group": {"_id": "$mcq_status", "n": {"$sum": 1}}}]
    )
    counts = {row["_id"]: row["n"] for row in await chunk_cursor.to_list(length=None)}
    total = sum(counts.values())
    done = counts.get("done", 0)
    failed = counts.get("failed", 0)
    remaining = total - done

    question_cursor = await db["questions"].aggregate(
        [{"$match": {"material_id": mid, "source": "ai"}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    )
    by_status = {row["_id"]: row["n"] for row in await question_cursor.to_list(length=None)}

    jobs = db["generation_jobs"]
    active = await jobs.find_one({"material_id": mid, "status": "running"})
    latest = await jobs.find_one({"material_id": mid}, sort=[("created_at", -1)])
    other_running = None if active else await jobs.find_one({"status": "running"}, {"material_title": 1})

    ai = await ai_status_out()

    blocked = None
    if material["kind"] != "notes":
        blocked = (
            "Questions are written from study notes only. For previous-year papers, the original "
            "questions will be extracted in the next phase so that they stay exactly as printed."
        )
    elif material["status"] != "ready":
        blocked = "This material's text was not extracted successfully, so there is nothing to generate from."
    elif not ai["configured"]:
        blocked = ai["message"]
    elif active:
        blocked = "A generation job is running for this material."
    elif other_running:
        blocked = f"Another generation job is running (\"{other_running.get('material_title', 'another material')}\"). Wait for it to finish or stop it."
    elif remaining == 0:
        blocked = "Every chunk of this material has already been processed."
    elif latest and latest["status"] == "paused":
        blocked = "A paused job exists for this material. Resume it instead of starting a new one."

    can_resume = bool(
        latest
        and latest["status"] == "paused"
        and ai["configured"]
        and remaining > 0
        and not other_running
        and material["status"] == "ready"
    )

    return {
        "material_id": str(mid),
        "material_title": material["title"],
        "material_status": material["status"],
        "material_kind": material["kind"],
        "chunks_total": total,
        "chunks_done": done,
        "chunks_failed": failed,
        "chunks_remaining": remaining,
        "questions_total": sum(by_status.values()),
        "questions_approved": by_status.get("approved", 0),
        "active_job": _job_item(active) if active else None,
        "latest_job": _job_item(latest) if latest else None,
        "can_start": blocked is None,
        "can_resume": can_resume,
        "blocked_reason": blocked,
        "ai": ai,
    }


async def list_generated_questions(material_id: str, page: int, page_size: int) -> dict:
    db = get_db()
    material = await _get_material(material_id)
    query = {"material_id": material["_id"], "source": "ai"}
    total = await db["questions"].count_documents(query)
    docs = (
        await db["questions"]
        .find(query)
        .sort([("page_start", 1), ("created_at", 1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(length=None)
    )
    return {
        "items": [
            {
                "id": str(d["_id"]),
                "text": d["text"],
                "options": d["options"],
                "correct_index": d["correct_index"],
                "explanation": d.get("explanation", ""),
                "evidence": d.get("evidence", ""),
                "difficulty": d.get("difficulty", "medium"),
                "status": d.get("status", "draft"),
                "page_start": d.get("page_start"),
                "page_end": d.get("page_end"),
                "created_at": d["created_at"],
            }
            for d in docs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ======================================================================
# Starting, resuming, stopping
# ======================================================================
def _require_configured() -> llm_client.AiStatus:
    status = llm_client.get_status()
    if not status.configured:
        raise BadRequestError(status.message)
    return status


async def start_job(material_id: str, questions_per_chunk: int, admin: dict) -> dict:
    db = get_db()
    status = _require_configured()
    material = await _get_material(material_id)

    if material["kind"] != "notes":
        raise BadRequestError("Questions are written from study notes only. Previous-year papers are handled in the next phase.")
    if material["status"] != "ready":
        raise ConflictError("This material's text was not extracted successfully, so there is nothing to generate from.")

    mid = material["_id"]
    if await db["generation_jobs"].find_one({"material_id": mid, "status": "paused"}, {"_id": 1}):
        raise ConflictError("A paused job exists for this material. Resume it instead of starting a new one.")

    remaining = await db["source_chunks"].count_documents({"material_id": mid, "mcq_status": {"$ne": "done"}})
    if remaining == 0:
        raise BadRequestError("Every chunk of this material has already been processed.")

    now = _now()
    doc = {
        "type": JOB_TYPE,
        "material_id": mid,
        "material_title": material["title"],
        "status": "running",
        "run_id": uuid.uuid4().hex,
        "stop_requested": False,
        "pause_reason": None,
        "questions_per_chunk": questions_per_chunk,
        "provider": status.provider,
        "model": status.model,
        "chunks_processed": 0,
        "chunks_failed": 0,
        "chunks_skipped": 0,
        "candidates": 0,
        "accepted": 0,
        "rejected": 0,
        "rejected_by_reason": {},
        "api_calls": 0,
        "last_error": None,
        "created_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
        "finished_at": None,
    }
    try:
        result = await db["generation_jobs"].insert_one(doc)
    except DuplicateKeyError:
        raise ConflictError("Another generation job is already running. Wait for it to finish or stop it first.")

    doc["_id"] = result.inserted_id
    _spawn(doc["_id"])
    return _job_item(doc)


async def resume_job(job_id: str) -> dict:
    db = get_db()
    status = _require_configured()
    job = await _get_job(job_id)

    if job["status"] != "paused":
        raise ConflictError("Only a paused job can be resumed.")

    material = await db["source_materials"].find_one({"_id": job["material_id"]})
    if material is None or material["status"] != "ready":
        raise ConflictError("The source material is no longer available.")

    remaining = await db["source_chunks"].count_documents(
        {"material_id": job["material_id"], "mcq_status": {"$ne": "done"}}
    )
    if remaining == 0:
        done = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"], "status": "paused"},
            {"$set": {"status": "completed", "pause_reason": None, "finished_at": _now(), "updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )
        return _job_item(done or job)

    try:
        updated = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"], "status": "paused"},
            {
                "$set": {
                    "status": "running",
                    "run_id": uuid.uuid4().hex,
                    "stop_requested": False,
                    "pause_reason": None,
                    "provider": status.provider,
                    "model": status.model,
                    "updated_at": _now(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise ConflictError("Another generation job is already running. Wait for it to finish or stop it first.")
    if updated is None:
        raise ConflictError("The job changed in the meantime. Refresh the page and try again.")

    _spawn(updated["_id"])
    return _job_item(updated)


async def stop_job(job_id: str) -> dict:
    db = get_db()
    job = await _get_job(job_id)
    if job["status"] != "running":
        raise ConflictError("This job is not running.")

    if str(job["_id"]) in _RUNNERS:
        # The runner notices this between chunks and pauses the job
        updated = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"]},
            {"$set": {"stop_requested": True, "updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )
    else:
        updated = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"], "status": "running"},
            {"$set": {"status": "paused", "pause_reason": "Stopped by an admin.", "updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )
    return _job_item(updated or job)


async def recover_interrupted_jobs() -> None:
    """At startup no job can really be running, so any 'running' job was cut off by a restart."""
    result = await get_db()["generation_jobs"].update_many(
        {"status": "running"},
        {
            "$set": {
                "status": "paused",
                "pause_reason": "Interrupted because the server restarted. Press Resume to continue.",
                "updated_at": _now(),
            }
        },
    )
    if result.modified_count:
        logger.warning("Marked %s interrupted generation job(s) as paused.", result.modified_count)


async def shutdown() -> None:
    tasks = list(_RUNNERS.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


# ======================================================================
# The runner
# ======================================================================
def _spawn(job_id) -> None:
    key = str(job_id)
    task = asyncio.create_task(_run_job(job_id))
    _RUNNERS[key] = task  # keeps a reference so the task is not garbage-collected
    task.add_done_callback(lambda _t, k=key: _RUNNERS.pop(k, None))


async def _bump(job_id, inc: dict | None = None, set_fields: dict | None = None) -> None:
    update: dict = {"$set": {"updated_at": _now(), **(set_fields or {})}}
    if inc:
        update["$inc"] = inc
    await get_db()["generation_jobs"].update_one({"_id": job_id}, update)


async def _pause(job_id, reason: str) -> None:
    await get_db()["generation_jobs"].update_one(
        {"_id": job_id, "status": "running"},
        {"$set": {"status": "paused", "pause_reason": reason, "last_error": reason, "updated_at": _now()}},
    )


async def _complete(job_id) -> None:
    now = _now()
    await get_db()["generation_jobs"].update_one(
        {"_id": job_id, "status": "running"},
        {"$set": {"status": "completed", "pause_reason": None, "finished_at": now, "updated_at": now}},
    )


@dataclass
class _RunState:
    hashes: set = field(default_factory=set)
    token_sets: list = field(default_factory=list)
    rng: random.Random = field(default_factory=random.Random)


async def _load_state(material_id) -> _RunState:
    state = _RunState()
    docs = await get_db()["questions"].find({"material_id": material_id}, {"text": 1}).to_list(length=None)
    for d in docs:
        state.hashes.add(mcq_logic.question_hash(d["text"]))
        state.token_sets.append(mcq_logic.token_set(d["text"]))
    return state


async def _run_job(job_id) -> None:
    db = get_db()
    jobs = db["generation_jobs"]
    failures_in_a_row = 0
    try:
        job = await jobs.find_one({"_id": job_id})
        if job is None:
            return
        material = await db["source_materials"].find_one({"_id": job["material_id"]})
        if material is None:
            await _pause(job_id, "The source material no longer exists.")
            return

        subject = await db["subjects"].find_one({"_id": material["subject_id"]}, {"name": 1})
        chapter = (
            await db["chapters"].find_one({"_id": material["chapter_id"]}, {"title": 1})
            if material.get("chapter_id")
            else None
        )
        context = {
            "subject": subject["name"] if subject else "Not specified",
            "chapter": chapter["title"] if chapter else "Not specified",
            "exams": ", ".join(material.get("exam_tags") or TARGET_EXAMS),
        }
        state = await _load_state(material["_id"])
        run_id = job["run_id"]

        while True:
            current = await jobs.find_one({"_id": job_id}, {"status": 1, "stop_requested": 1})
            if current is None or current["status"] != "running":
                return
            if current.get("stop_requested"):
                await _pause(job_id, "Stopped by an admin.")
                return

            chunk = await db["source_chunks"].find_one(
                {"material_id": material["_id"], "mcq_status": {"$ne": "done"}, "mcq_last_run": {"$ne": run_id}},
                sort=[("index", 1)],
            )
            if chunk is None:
                await _complete(job_id)
                return

            try:
                await _process_chunk(job, chunk, context, state)
                failures_in_a_row = 0
            except (AiNotConfigured, AiConfigError, AiQuotaError) as error:
                # Nothing is wrong with this chunk: stop here, and it is retried on resume
                await _pause(job_id, error.message)
                return
            except AiError as error:
                await _fail_chunk(job, chunk, error.message)
                failures_in_a_row += 1
                if failures_in_a_row >= MAX_CONSECUTIVE_FAILURES:
                    await _pause(
                        job_id,
                        f"Paused after {MAX_CONSECUTIVE_FAILURES} chunks failed in a row. Last error: {error.message}",
                    )
                    return
    except asyncio.CancelledError:
        raise
    except PyMongoError:
        logger.exception("Database error in generation job %s", job_id)
    except Exception:
        logger.exception("Generation job %s crashed", job_id)
        try:
            await _pause(job_id, "An unexpected error stopped this job. Details are in the server log.")
        except PyMongoError:
            pass


async def _fail_chunk(job: dict, chunk: dict, message: str) -> None:
    db = get_db()
    await db["source_chunks"].update_one(
        {"_id": chunk["_id"]},
        {
            "$set": {"mcq_status": "failed", "mcq_last_run": job["run_id"], "mcq_error": message[:300]},
            "$inc": {"mcq_attempts": 1},
        },
    )
    await _bump(job["_id"], {"chunks_failed": 1}, {"last_error": message[:300]})


async def _finish_chunk(job: dict, chunk: dict, counts: dict) -> None:
    await get_db()["source_chunks"].update_one(
        {"_id": chunk["_id"]},
        {
            "$set": {
                "mcq_status": "done",
                "mcq_last_run": job["run_id"],
                "mcq_job_id": job["_id"],
                "mcq_done_at": _now(),
                "mcq_error": None,
                "mcq_counts": counts,
            }
        },
    )


async def _process_chunk(job: dict, chunk: dict, context: dict, state: _RunState) -> None:
    db = get_db()
    job_id = job["_id"]

    if chunk.get("word_count", 0) < MIN_CHUNK_WORDS:
        await _finish_chunk(job, chunk, {"skipped": "too_short"})
        await _bump(job_id, {"chunks_processed": 1, "chunks_skipped": 1})
        return

    pages = (
        str(chunk["page_start"])
        if chunk["page_start"] == chunk["page_end"]
        else f"{chunk['page_start']}-{chunk['page_end']}"
    )
    passage = chunk["text"]

    # ---- call 1: write the questions
    prompt = render_prompt(
        "mcq_generate",
        exams=context["exams"],
        count=job["questions_per_chunk"],
        subject=context["subject"],
        chapter=context["chapter"],
        pages=pages,
        passage=passage,
    )
    data, meta = await llm_client.generate_json(prompt, GENERATE_SCHEMA, MAX_OUTPUT_TOKENS)
    api_calls = meta["attempts"]

    items = data.get("questions")
    if not isinstance(items, list):
        raise AiResponseError("The model's answer had no list of questions.")
    items = items[: job["questions_per_chunk"]]

    rejected: Counter = Counter()
    candidates: list[dict] = []
    for item in items:
        candidate, reason = mcq_logic.validate_candidate(item, passage)
        if candidate is None:
            rejected[reason] += 1
        else:
            candidates.append(candidate)

    # ---- call 2: an independent check that never sees the writer's answer
    accepted: list[dict] = []
    if candidates:
        verify_prompt = render_prompt(
            "mcq_verify",
            passage=passage,
            questions=mcq_logic.format_for_verification(candidates),
        )
        try:
            verify_data, verify_meta = await llm_client.generate_json(verify_prompt, VERIFY_SCHEMA, MAX_OUTPUT_TOKENS)
        except AiError:
            await _bump(job_id, {"api_calls": api_calls})
            raise
        api_calls += verify_meta["attempts"]
        verdicts = mcq_logic.parse_verdicts(verify_data)

        now = _now()
        for number, candidate in enumerate(candidates, start=1):
            ok, reason = mcq_logic.judge(candidate, verdicts.get(number))
            if not ok:
                rejected[reason] += 1
                continue

            text_hash = mcq_logic.question_hash(candidate["text"])
            tokens = mcq_logic.token_set(candidate["text"])
            if text_hash in state.hashes or mcq_logic.is_near_duplicate(tokens, state.token_sets):
                rejected["duplicate"] += 1
                continue

            options, correct_index = mcq_logic.shuffle_options(
                candidate["options"], candidate["correct_index"], state.rng
            )
            state.hashes.add(text_hash)
            state.token_sets.append(tokens)
            accepted.append(
                {
                    "subject_id": chunk["subject_id"],
                    "chapter_id": chunk.get("chapter_id"),
                    "type": "mcq",
                    "text": candidate["text"],
                    "options": options,
                    "correct_index": correct_index,
                    "explanation": candidate["explanation"],
                    "difficulty": candidate["difficulty"],
                    "source": "ai",
                    "exam_name": None,
                    "year": None,
                    "exam_tags": chunk.get("exam_tags", []),
                    "status": "approved",  # only reached after every rule and the independent check passed
                    "text_hash": text_hash,
                    "material_id": chunk["material_id"],
                    "chunk_ids": [chunk["_id"]],
                    "page_start": chunk["page_start"],
                    "page_end": chunk["page_end"],
                    "evidence": candidate["evidence"],
                    "ai": {
                        "provider": meta["provider"],
                        "model": meta["model"],
                        "job_id": job_id,
                        "prompt_version": PROMPT_VERSION,
                        "generated_at": now,
                    },
                    "verification": {
                        "verified": True,
                        "method": "independent_second_pass",
                        "model": verify_meta["model"],
                        "at": now,
                    },
                    "created_by": None,
                    "created_at": now,
                    "updated_at": now,
                }
            )

        # The same question may already exist from another material
        if accepted:
            known = await db["questions"].find(
                {"text_hash": {"$in": [q["text_hash"] for q in accepted]}}, {"text_hash": 1}
            ).to_list(length=None)
            known_hashes = {k["text_hash"] for k in known}
            if known_hashes:
                kept = [q for q in accepted if q["text_hash"] not in known_hashes]
                rejected["duplicate"] += len(accepted) - len(kept)
                accepted = kept

    if accepted:
        await db["questions"].insert_many(accepted)

    await _finish_chunk(
        job,
        chunk,
        {"generated": len(items), "accepted": len(accepted), "rejected": sum(rejected.values())},
    )

    inc = {
        "chunks_processed": 1,
        "candidates": len(items),
        "accepted": len(accepted),
        "rejected": sum(rejected.values()),
        "api_calls": api_calls,
    }
    for reason, count in rejected.items():
        inc[f"rejected_by_reason.{reason}"] = count
    await _bump(job_id, inc)