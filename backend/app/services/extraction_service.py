"""Continuous previous-year paper processing: queue, background extraction, answer keys, duplicates.

Extraction is RULE-BASED. No AI provider is called, and no API key is needed.

How it works
- A previous-year PDF is uploaded like any source material (text extracted and split into chunks). The admin
  chooses its type: an MCQ PDF or a Written PDF. The type decides the parser, the review queue and the bank.
- It is then queued. A small supervisor loop starts ONE extraction job at a time. Jobs are kept in the
  `generation_jobs` collection with status "extracting".
- For every chunk, a deterministic parser COPIES what is printed (see app/ingestion). Every field is checked
  against the PDF text, and answers are never guessed.
- Extracted questions are stored as 'pending' (MCQ: `extracted_questions`, Written: `extracted_written_questions`).
  They enter the approved banks only when an admin approves them. Never auto-approved.
- Progress is saved per chunk, so an interrupted job resumes without redoing finished chunks. The same question is
  stored only once per PDF, so a retry can never insert it twice.
- The server must run a single worker (the job runs inside the server process)."""
import asyncio
import logging
import re
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.ai import pyq_logic
from app.core.config import settings
from app.core.constants import NON_TECHNICAL_SUBJECTS
from app.core.errors import AppError, BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.ingestion import mcq_parser, written_parser
from app.services.material_service import _effective_status

logger = logging.getLogger("uvicorn.error")

JOB_TYPE = "pyq_extraction"
ACTIVE = "extracting"            # job status while a PDF is being processed
PARSER_VERSION = "rules-v1"
PAPER_TYPES = ("mcq", "written")
MIN_CHUNK_WORDS = 8              # tinier chunks are skipped
LOOKAHEAD_CHARS = 1500           # text of the next chunk shown to complete a cut-off question
MAX_CONSECUTIVE_FAILURES = 5     # then the job pauses
MAX_ATTEMPTS = 4                 # a chunk that keeps failing is given up on after this many tries
SUPERVISOR_INTERVAL = 20         # seconds between checks for queued work

_NON_TECH_KEYS = {name.casefold() for name in NON_TECHNICAL_SUBJECTS}
_RUNNERS: dict[str, asyncio.Task] = {}
_wake = asyncio.Event()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def wake_supervisor() -> None:
    _wake.set()


def _paper_type(material: dict) -> str:
    """PDFs uploaded before this change have no type: they were MCQ papers."""
    value = material.get("paper_type")
    return value if value in PAPER_TYPES else "mcq"


# ======================================================================
# Small helpers
# ======================================================================
async def _get_material(material_id: str) -> dict:
    oid = parse_object_id(material_id, NotFoundError, "Material not found.")
    material = await get_db()["source_materials"].find_one({"_id": oid})
    if material is None:
        raise NotFoundError("Material not found.")
    return material


EXTRACTABLE_KINDS = ("previous_year", "notes")


def _require_extractable(material: dict) -> None:
    """Previous-year papers and study notes can both run rule-based question extraction."""
    if material.get("kind") not in EXTRACTABLE_KINDS:
        raise BadRequestError("Question extraction is only available for previous-year papers and study notes.")


async def _get_ready_pyq(material_id: str) -> dict:
    material = await _get_material(material_id)
    _require_extractable(material)
    if material["status"] != "ready":
        raise ConflictError("The text of this PDF has not been extracted successfully, so there is nothing to process.")
    return material


async def _get_job(job_id: str) -> dict:
    jid = parse_object_id(job_id, NotFoundError, "Job not found.")
    job = await get_db()["generation_jobs"].find_one({"_id": jid, "type": JOB_TYPE})
    if job is None:
        raise NotFoundError("Job not found.")
    return job


async def _remaining(material_id) -> int:
    """Chunks that still need processing (not done, and not given up on)."""
    return await get_db()["source_chunks"].count_documents(
        {
            "material_id": material_id,
            "pyq_status": {"$ne": "done"},
            "pyq_attempts": {"$not": {"$gte": MAX_ATTEMPTS}},
        }
    )


def _lookahead(text: str) -> str:
    snippet = text[:LOOKAHEAD_CHARS]
    if len(text) > LOOKAHEAD_CHARS:
        cut = snippet.rfind("\n")
        if cut > LOOKAHEAD_CHARS // 2:
            snippet = snippet[:cut]
    return snippet


async def _lookup_names(docs: list[dict]) -> tuple[dict, dict]:
    db = get_db()
    subject_ids = list({d["subject_id"] for d in docs if d.get("subject_id")})
    chapter_ids = list({d["chapter_id"] for d in docs if d.get("chapter_id")})
    subjects = (
        await db["subjects"].find({"_id": {"$in": subject_ids}}, {"name": 1}).to_list(length=None)
        if subject_ids
        else []
    )
    chapters = (
        await db["chapters"].find({"_id": {"$in": chapter_ids}}, {"title": 1}).to_list(length=None)
        if chapter_ids
        else []
    )
    return {s["_id"]: s["name"] for s in subjects}, {c["_id"]: c["title"] for c in chapters}


async def set_paper_type(material_id: str, paper_type: str) -> None:
    """Remembers whether a PDF is MCQ or Written (chosen by the admin at upload or before extraction)."""
    if paper_type not in PAPER_TYPES:
        raise BadRequestError("The question paper type must be MCQ or Written.")
    material = await _get_material(material_id)
    _require_extractable(material)
    await get_db()["source_materials"].update_one(
        {"_id": material["_id"]}, {"$set": {"paper_type": paper_type}}
    )


# ======================================================================
# Context for one job: topics, duplicate corpus, detected paper details
# ======================================================================
@dataclass
class _Corpus:
    by_hash: dict = field(default_factory=dict)
    entries: list = field(default_factory=list)
    fingerprints: set = field(default_factory=set)

    def add(self, text: str, ref: dict) -> None:
        self.by_hash.setdefault(pyq_logic.question_hash(text), ref)
        self.entries.append((pyq_logic.token_set(text), ref))


@dataclass
class _Context:
    paper_type: str
    labels: list
    mapping: dict
    subject_id: object
    chapter_id: object
    corpus: _Corpus
    detected: dict
    current_heading: str | None = None
    previous_number: int | None = None


async def _load_topics() -> tuple[list[str], dict]:
    """The topics a section heading can be matched to: the Non-Technical subjects and the Technical chapters."""
    db = get_db()
    subjects = await db["subjects"].find({}, {"name": 1}).sort([("order", 1), ("name", 1)]).to_list(length=None)
    chapters = (
        await db["chapters"]
        .find({}, {"title": 1, "subject_id": 1})
        .sort([("order", 1), ("_id", 1)])
        .to_list(length=None)
    )
    technical_ids = {s["_id"] for s in subjects if s["name"].strip().casefold() not in _NON_TECH_KEYS}

    labels: list[str] = []
    mapping: dict = {}
    for name in NON_TECHNICAL_SUBJECTS:
        subject = next((s for s in subjects if s["name"].strip().casefold() == name.casefold()), None)
        if subject:
            labels.append(subject["name"])
            mapping[subject["name"].strip().casefold()] = (subject["_id"], None)
    for chapter in chapters:
        if chapter["subject_id"] in technical_ids:
            key = chapter["title"].strip().casefold()
            if key not in mapping:
                labels.append(chapter["title"])
                mapping[key] = (chapter["subject_id"], chapter["_id"])
    return labels, mapping


async def _load_corpus(material_id, paper_type: str) -> _Corpus:
    """Every existing question text of the same kind, so likely duplicates across PDFs can be flagged."""
    db = get_db()
    corpus = _Corpus()
    if paper_type == "written":
        bank, queue, bank_type = "written_questions", "extracted_written_questions", "written"
    else:
        bank, queue, bank_type = "questions", "extracted_questions", "question"

    for doc in await db[bank].find({}, {"text": 1}).to_list(length=None):
        corpus.add(doc["text"], {"of_type": bank_type, "of_id": str(doc["_id"]), "of_label": doc["text"][:120]})

    # Approved ones already exist in the bank, so only the others are added here
    others = await db[queue].find({"status": {"$ne": "approved"}}, {"text": 1}).to_list(length=None)
    for doc in others:
        corpus.add(doc["text"], {"of_type": "extracted", "of_id": str(doc["_id"]), "of_label": doc["text"][:120]})

    corpus.fingerprints = set(await db[queue].distinct("fingerprint", {"material_id": material_id}))
    return corpus


async def _build_context(material: dict) -> _Context:
    paper_type = _paper_type(material)
    labels, mapping = await _load_topics()
    pyq = material.get("pyq") or {}
    return _Context(
        paper_type=paper_type,
        labels=labels,
        mapping=mapping,
        subject_id=material.get("subject_id"),
        chapter_id=material.get("chapter_id"),
        corpus=await _load_corpus(material["_id"], paper_type),
        detected={"exam_name": pyq.get("detected_exam_name"), "year": pyq.get("detected_year")},
        current_heading=pyq.get("current_heading"),
    )


# ======================================================================
# Queue, start, resume, stop
# ======================================================================
async def queue_material(material_id: str) -> None:
    """Called after a previous-year PDF was uploaded: it is extracted automatically, in turn."""
    if not settings.pyq_auto_extract:
        return
    try:
        oid = parse_object_id(material_id, NotFoundError, "Material not found.")
        await get_db()["source_materials"].update_one(
            {"_id": oid, "kind": {"$in": ["previous_year", "notes"]}, "status": "ready"},
            {"$set": {"pyq.queued_at": _now()}},
        )
    except (PyMongoError, AppError):
        logger.warning("Could not queue material %s for extraction.", material_id)
        return
    wake_supervisor()


async def _create_job(material: dict, created_by) -> dict:
    now = _now()
    doc = {
        "type": JOB_TYPE,
        "material_id": material["_id"],
        "material_title": material["title"],
        "paper_type": _paper_type(material),
        "parser": PARSER_VERSION,
        "status": ACTIVE,
        "run_id": uuid.uuid4().hex,
        "stop_requested": False,
        "pause_reason": None,
        "pause_kind": None,
        "chunks_processed": 0,
        "chunks_failed": 0,
        "chunks_skipped": 0,
        "questions_found": 0,
        "saved": 0,
        "skipped_existing": 0,
        "rejected": 0,
        "flagged": 0,
        "answers_from_key": 0,
        "rejected_by_reason": {},
        "last_error": None,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "finished_at": None,
    }
    try:
        result = await get_db()["generation_jobs"].insert_one(doc)
    except DuplicateKeyError:
        raise ConflictError("Another PDF is being processed. This one starts automatically right after it.")
    doc["_id"] = result.inserted_id
    return doc


async def _clear_queue(material_id) -> None:
    await get_db()["source_materials"].update_one({"_id": material_id}, {"$set": {"pyq.queued_at": None}})


async def start_extraction(material_id: str, admin: dict) -> dict:
    db = get_db()
    material = await _get_ready_pyq(material_id)
    if material.get("paper_type") not in PAPER_TYPES:
        raise BadRequestError("Choose MCQ or Written before starting question extraction.")

    if await db["generation_jobs"].find_one(
        {"material_id": material["_id"], "type": JOB_TYPE, "status": "paused"}, {"_id": 1}
    ):
        raise ConflictError("A paused extraction exists for this PDF. Resume it instead of starting a new one.")
    if await _remaining(material["_id"]) == 0:
        raise BadRequestError("Every part of this PDF has already been processed.")

    job = await _create_job(material, admin["_id"])
    await _clear_queue(material["_id"])
    _spawn(job["_id"])
    return job


async def _resume(job: dict) -> dict:
    db = get_db()
    material = await db["source_materials"].find_one({"_id": job["material_id"]})
    if material is None or material["status"] != "ready":
        # Stop automatic retries of a job whose PDF is gone
        await db["generation_jobs"].update_one(
            {"_id": job["_id"], "status": "paused"},
            {"$set": {"pause_kind": "stopped", "pause_reason": "The source PDF is no longer available.", "updated_at": _now()}},
        )
        raise ConflictError("The source PDF is no longer available.")

    now = _now()
    if await _remaining(job["material_id"]) == 0:
        if _paper_type(material) == "mcq":
            await _apply_answer_keys(job["material_id"])
        done = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"], "status": "paused"},
            {"$set": {"status": "completed", "pause_reason": None, "pause_kind": None, "finished_at": now, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return done or job

    try:
        updated = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"], "status": "paused"},
            {
                "$set": {
                    "status": ACTIVE,
                    "run_id": uuid.uuid4().hex,
                    "stop_requested": False,
                    "pause_reason": None,
                    "pause_kind": None,
                    "parser": PARSER_VERSION,
                    "updated_at": now,
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        raise ConflictError("Another PDF is being processed. Try again in a moment.")
    if updated is None:
        raise ConflictError("The job changed in the meantime. Refresh the page and try again.")

    await _clear_queue(job["material_id"])
    _spawn(updated["_id"])
    return updated


async def resume_extraction(job_id: str) -> dict:
    job = await _get_job(job_id)
    if job["status"] != "paused":
        raise ConflictError("Only a paused extraction can be resumed.")
    return await _resume(job)


async def stop_extraction(job_id: str) -> dict:
    db = get_db()
    job = await _get_job(job_id)
    if job["status"] not in (ACTIVE, "running"):
        raise ConflictError("This extraction is not running.")

    if str(job["_id"]) in _RUNNERS:
        # The runner notices this between chunks and pauses the job
        updated = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"]},
            {"$set": {"stop_requested": True, "updated_at": _now()}},
            return_document=ReturnDocument.AFTER,
        )
    else:
        updated = await db["generation_jobs"].find_one_and_update(
            {"_id": job["_id"], "status": {"$in": [ACTIVE, "running"]}},
            {
                "$set": {
                    "status": "paused",
                    "pause_kind": "stopped",
                    "pause_reason": "Stopped by an admin.",
                    "updated_at": _now(),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    return updated or job


async def assert_deletable(material_id: str) -> None:
    """A PDF with extracted questions that nobody reviewed yet cannot be deleted."""
    oid = parse_object_id(material_id, NotFoundError, "Material not found.")
    db = get_db()
    if await db["generation_jobs"].find_one(
        {"material_id": oid, "status": {"$in": [ACTIVE, "running"]}}, {"_id": 1}
    ):
        raise ConflictError("A job is running for this material. Stop it before deleting the material.")

    pending = await db["extracted_questions"].count_documents({"material_id": oid, "status": "pending"})
    pending += await db["extracted_written_questions"].count_documents({"material_id": oid, "status": "pending"})
    if pending:
        raise ConflictError(
            f"{pending} extracted question{'s are' if pending != 1 else ' is'} still waiting for review. "
            "Review or reject them first, so no extracted work is lost."
        )


# ======================================================================
# Startup recovery, supervisor and shutdown
# ======================================================================
async def recover_on_startup() -> None:
    """Runs at every start. No job can really be running after a start, so an 'extracting' (or an old
    'running') job was cut off by a restart. It is marked as paused, and the supervisor resumes it.
    Jobs that paused for reasons of the former AI-based extractor are resumed with the rule-based one."""
    jobs = get_db()["generation_jobs"]
    now = _now()
    interrupted = await jobs.update_many(
        {"type": JOB_TYPE, "status": {"$in": [ACTIVE, "running"]}},
        {
            "$set": {
                "status": "paused",
                "pause_kind": "restart",
                "pause_reason": "Interrupted because the server restarted.",
                "updated_at": now,
            }
        },
    )
    legacy = await jobs.update_many(
        {"type": JOB_TYPE, "status": "paused", "pause_kind": {"$in": ["quota", "config", "failures", "other", None]}},
        {
            "$set": {
                "pause_kind": "restart",
                "pause_reason": "Continuing with the rule-based extractor.",
                "updated_at": now,
            }
        },
    )
    if interrupted.modified_count or legacy.modified_count:
        logger.warning(
            "Extraction jobs prepared to resume: %s interrupted, %s paused earlier.",
            interrupted.modified_count,
            legacy.modified_count,
        )


async def supervisor_tick() -> None:
    """Starts queued or interrupted extractions, one at a time."""
    if not settings.pyq_auto_extract:
        return

    db = get_db()
    if await db["generation_jobs"].find_one({"type": JOB_TYPE, "status": ACTIVE}, {"_id": 1}):
        return

    paused = (
        await db["generation_jobs"]
        .find({"type": JOB_TYPE, "status": "paused", "pause_kind": "restart"})
        .sort("updated_at", 1)
        .to_list(length=10)
    )
    for job in paused:
        try:
            await _resume(job)
            return
        except AppError as error:
            logger.info("Could not auto-resume extraction %s: %s", job["_id"], error.message)

    material = await db["source_materials"].find_one(
        {"kind": {"$in": ["previous_year", "notes"]}, "status": "ready", "pyq.queued_at": {"$ne": None}},
        sort=[("pyq.queued_at", 1)],
    )
    if material is None:
        return
    if await _remaining(material["_id"]) == 0:
        await _clear_queue(material["_id"])
        return
    if await db["generation_jobs"].find_one(
        {"material_id": material["_id"], "type": JOB_TYPE, "status": "paused"}, {"_id": 1}
    ):
        await _clear_queue(material["_id"])  # an existing paused job handles it
        return
    try:
        job = await _create_job(material, None)
    except AppError as error:
        logger.info("Could not start extraction for %s: %s", material["_id"], error.message)
        return
    await _clear_queue(material["_id"])
    _spawn(job["_id"])


async def supervisor_loop() -> None:
    while True:
        try:
            await supervisor_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("The extraction supervisor hit an error")
        try:
            await asyncio.wait_for(_wake.wait(), timeout=SUPERVISOR_INTERVAL)
        except asyncio.TimeoutError:
            pass
        _wake.clear()


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


async def _pause(job_id, reason: str, kind: str) -> None:
    await get_db()["generation_jobs"].update_one(
        {"_id": job_id, "status": ACTIVE},
        {
            "$set": {
                "status": "paused",
                "pause_reason": reason,
                "pause_kind": kind,
                "last_error": reason,
                "updated_at": _now(),
            }
        },
    )


async def _complete(job_id) -> None:
    now = _now()
    await get_db()["generation_jobs"].update_one(
        {"_id": job_id, "status": ACTIVE},
        {"$set": {"status": "completed", "pause_reason": None, "pause_kind": None, "finished_at": now, "updated_at": now}},
    )


async def _finish_run(job_id, material_id, paper_type: str) -> None:
    """No chunk is left to try in this run."""
    retryable = await get_db()["source_chunks"].count_documents(
        {"material_id": material_id, "pyq_status": "failed", "pyq_attempts": {"$lt": MAX_ATTEMPTS}}
    )
    if retryable:
        await _pause(
            job_id,
            f"{retryable} part{'s' if retryable != 1 else ''} of the PDF could not be processed. "
            "Press Retry to try again. The questions already extracted are kept.",
            "failures",
        )
        return

    if paper_type == "mcq":
        applied = await _apply_answer_keys(material_id)
        if applied:
            await _bump(job_id, {"answers_from_key": applied})
    await _complete(job_id)


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
            await _pause(job_id, "The source PDF no longer exists.", "stopped")
            return

        ctx = await _build_context(material)
        run_id = job["run_id"]

        while True:
            current = await jobs.find_one({"_id": job_id}, {"status": 1, "stop_requested": 1})
            if current is None or current["status"] != ACTIVE:
                return
            if current.get("stop_requested"):
                await _pause(job_id, "Stopped by an admin.", "stopped")
                return

            chunk = await db["source_chunks"].find_one(
                {
                    "material_id": material["_id"],
                    "pyq_status": {"$ne": "done"},
                    "pyq_last_run": {"$ne": run_id},
                    "pyq_attempts": {"$not": {"$gte": MAX_ATTEMPTS}},
                },
                sort=[("index", 1)],
            )
            if chunk is None:
                await _finish_run(job_id, material["_id"], ctx.paper_type)
                return

            try:
                await _process_chunk(job, chunk, material, ctx)
                failures_in_a_row = 0
            except PyMongoError:
                raise
            except Exception as error:  # a problem with this part of the PDF only
                logger.exception("Extraction failed on chunk %s of %s", chunk.get("index"), material["_id"])
                await _fail_chunk(job, chunk, f"{type(error).__name__}: {error}")
                failures_in_a_row += 1
                if failures_in_a_row >= MAX_CONSECUTIVE_FAILURES:
                    await _pause(
                        job_id,
                        f"Paused after {MAX_CONSECUTIVE_FAILURES} parts failed in a row. Last error: {error}",
                        "failures",
                    )
                    return
            await asyncio.sleep(0)  # let other requests run between chunks
    except asyncio.CancelledError:
        raise
    except PyMongoError:
        logger.exception("Database error in extraction job %s", job_id)
        try:
            await _pause(job_id, "A database error stopped this job. Press Resume to continue.", "other")
        except PyMongoError:
            pass
    except Exception:
        logger.exception("Extraction job %s crashed", job_id)
        try:
            await _pause(job_id, "An unexpected error stopped this job. Details are in the server log.", "other")
        except PyMongoError:
            pass
    finally:
        wake_supervisor()  # the next queued PDF can start right away


async def _fail_chunk(job: dict, chunk: dict, message: str) -> None:
    await get_db()["source_chunks"].update_one(
        {"_id": chunk["_id"]},
        {
            "$set": {"pyq_status": "failed", "pyq_last_run": job["run_id"], "pyq_error": message[:300]},
            "$inc": {"pyq_attempts": 1},
        },
    )
    await _bump(job["_id"], {"chunks_failed": 1}, {"last_error": message[:300]})


async def _finish_chunk(job: dict, chunk: dict, counts: dict, key_pairs: list) -> None:
    await get_db()["source_chunks"].update_one(
        {"_id": chunk["_id"]},
        {
            "$set": {
                "pyq_status": "done",
                "pyq_last_run": job["run_id"],
                "pyq_job_id": job["_id"],
                "pyq_done_at": _now(),
                "pyq_error": None,
                "pyq_counts": counts,
                "pyq_answer_key": [list(pair) for pair in key_pairs],
            }
        },
    )


async def _record(job_id, found: int, saved: int, existing: int, rejected: Counter, flagged: int) -> None:
    inc = {
        "chunks_processed": 1,
        "questions_found": found,
        "saved": saved,
        "skipped_existing": existing,
        "rejected": sum(rejected.values()),
        "flagged": flagged,
    }
    for reason, count in rejected.items():
        inc[f"rejected_by_reason.{reason}"] = count
    await _bump(job_id, inc)


async def _store(collection: str, material_id, fingerprint: str, body: dict):
    """Inserts a question once per PDF. The unique (PDF, fingerprint) index makes a retry unable to insert
    the same question twice. Returns the new id, or None if it was already stored."""
    try:
        outcome = await get_db()[collection].update_one(
            {"material_id": material_id, "fingerprint": fingerprint},
            {"$setOnInsert": body},
            upsert=True,
        )
        return outcome.upserted_id
    except DuplicateKeyError:
        return None


def _resolve_topic(ctx: _Context, heading: str | None) -> tuple[object, object, str]:
    """A chapter chosen at upload is trusted. Otherwise a section heading printed in the PDF is matched to a
    Non-Technical subject or a Technical chapter. With no match, the PDF's own subject is used."""
    if ctx.chapter_id is None:
        label = mcq_parser.match_label(heading or ctx.current_heading, ctx.labels)
        hit = ctx.mapping.get(label.casefold()) if label else None
        if hit:
            return hit[0], hit[1], "heading"
    return ctx.subject_id, ctx.chapter_id, "material"


async def _learn_paper_details(material: dict, ctx: _Context, chunk: dict, main: str, full_text: str) -> None:
    """Exam name and year printed in the heading of the PDF (first chunk only). Kept only if really printed."""
    if chunk["index"] != 0:
        return
    name, year = mcq_parser.detect_paper_info(main.split("\n"))
    name, year = pyq_logic.verify_paper_info(name, year, full_text)
    changes: dict = {}
    if name and not ctx.detected["exam_name"]:
        ctx.detected["exam_name"] = name
        changes["pyq.detected_exam_name"] = name
    if year and not ctx.detected["year"]:
        ctx.detected["year"] = year
        changes["pyq.detected_year"] = year
    if changes:
        await get_db()["source_materials"].update_one({"_id": material["_id"]}, {"$set": changes})


async def _remember_heading(material: dict, ctx: _Context, heading: str | None) -> None:
    if heading and heading != ctx.current_heading:
        ctx.current_heading = heading
        await get_db()["source_materials"].update_one({"_id": material["_id"]}, {"$set": {"pyq.current_heading": heading}})


async def _process_chunk(job: dict, chunk: dict, material: dict, ctx: _Context) -> None:
    main = chunk["text"]
    if chunk.get("word_count", 0) < MIN_CHUNK_WORDS:
        await _finish_chunk(job, chunk, {"skipped": "too_short"}, [])
        await _bump(job["_id"], {"chunks_processed": 1, "chunks_skipped": 1})
        return

    following = await get_db()["source_chunks"].find_one(
        {"material_id": chunk["material_id"], "index": chunk["index"] + 1}, {"text": 1}
    )
    continuation = _lookahead(following["text"]) if following else ""

    if ctx.paper_type == "written":
        await _process_written(job, chunk, material, ctx, main, continuation)
    else:
        await _process_mcq(job, chunk, material, ctx, main, continuation)


async def _process_mcq(job: dict, chunk: dict, material: dict, ctx: _Context, main: str, continuation: str) -> None:
    full_text = main + "\n" + continuation
    parsed = mcq_parser.parse_mcq(main, continuation, ctx.labels, ctx.previous_number)
    await _learn_paper_details(material, ctx, chunk, main, full_text)

    rejected: Counter = Counter()
    if parsed["skipped_without_options"]:
        rejected["no_options"] += parsed["skipped_without_options"]
    saved = existing = flagged = 0
    now = _now()

    for item in parsed["questions"]:
        result, reason = pyq_logic.validate_extracted(item, main, continuation)
        if result is None:
            rejected[reason] += 1
            continue

        fingerprint = pyq_logic.fingerprint(result["text"], result["options"])
        if fingerprint in ctx.corpus.fingerprints:
            existing += 1  # already stored for this PDF (a retry, or a repeated question)
            continue

        subject_id, chapter_id, topic_source = _resolve_topic(ctx, item.get("heading"))
        text_hash = pyq_logic.question_hash(result["text"])
        flags = list(result["flags"])

        body = {
            "chunk_index": chunk["index"],
            "chunk_id": chunk["_id"],
            "page_start": chunk["page_start"],
            "page_end": chunk["page_end"],
            "material_title": material["title"],
            "number": result["number"],
            "text": result["text"],
            "options": result["options"],
            "correct_index": result["correct_index"],
            "answer_status": result["answer_status"],
            "answer_quote": result["answer_quote"],
            "explanation": result["explanation"],
            "difficulty": "medium",
            "subject_id": subject_id,
            "chapter_id": chapter_id,
            "topic_source": topic_source,
            "exam_name": ctx.detected["exam_name"],
            "year": material.get("year") or ctx.detected["year"],
            "exam_tags": material.get("exam_tags", []),
            "flags": flags,
            "text_hash": text_hash,
            "status": "pending",
            "question_id": None,
            "edited": False,
            "reject_reason": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "job_id": job["_id"],
            "parser": PARSER_VERSION,
            "created_at": now,
            "updated_at": now,
        }
        new_id = await _store("extracted_questions", chunk["material_id"], fingerprint, body)
        ctx.corpus.fingerprints.add(fingerprint)
        if new_id is None:
            existing += 1
            continue

        saved += 1
        if flags or result["correct_index"] is None:
            flagged += 1
        ctx.corpus.add(result["text"], {"of_type": "extracted", "of_id": str(new_id), "of_label": result["text"][:120]})

    key_pairs = pyq_logic.clean_key_entries(parsed["answer_key"], full_text)
    await _finish_chunk(
        job,
        chunk,
        {
            "found": len(parsed["questions"]),
            "saved": saved,
            "existing": existing,
            "rejected": sum(rejected.values()),
            "key_entries": len(key_pairs),
        },
        key_pairs,
    )
    await _remember_heading(material, ctx, parsed["last_heading"])
    ctx.previous_number = parsed["last_number"]
    await _record(job["_id"], len(parsed["questions"]), saved, existing, rejected, flagged)


async def _process_written(job: dict, chunk: dict, material: dict, ctx: _Context, main: str, continuation: str) -> None:
    full_text = main + "\n" + continuation
    parsed = written_parser.parse_written(main, continuation, ctx.labels, ctx.previous_number)
    await _learn_paper_details(material, ctx, chunk, main, full_text)

    rejected: Counter = Counter()
    saved = existing = flagged = 0
    now = _now()

    for item in parsed["questions"]:
        result, reason = written_parser.validate_written(item, main, continuation)
        if result is None:
            rejected[reason] += 1
            continue

        fingerprint = pyq_logic.question_hash(result["text"])
        if fingerprint in ctx.corpus.fingerprints:
            existing += 1
            continue

        subject_id, chapter_id, topic_source = _resolve_topic(ctx, item.get("heading"))
        flags = list(result["flags"])

        body = {
            "chunk_index": chunk["index"],
            "chunk_id": chunk["_id"],
            "page_start": chunk["page_start"],
            "page_end": chunk["page_end"],
            "material_title": material["title"],
            "number": result["number"],
            "stem": result["stem"],
            "parts": result["parts"],
            "text": result["text"],
            "pdf_marks": result["pdf_marks"],
            "difficulty": "medium",
            "subject_id": subject_id,
            "chapter_id": chapter_id,
            "topic_source": topic_source,
            "exam_name": ctx.detected["exam_name"],
            "year": material.get("year") or ctx.detected["year"],
            "exam_tags": material.get("exam_tags", []),
            "flags": flags,
            "text_hash": fingerprint,
            "status": "pending",
            "question_id": None,
            "edited": False,
            "reject_reason": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "job_id": job["_id"],
            "parser": PARSER_VERSION,
            "created_at": now,
            "updated_at": now,
        }
        new_id = await _store("extracted_written_questions", chunk["material_id"], fingerprint, body)
        ctx.corpus.fingerprints.add(fingerprint)
        if new_id is None:
            existing += 1
            continue

        saved += 1
        if flags:
            flagged += 1
        ctx.corpus.add(result["text"], {"of_type": "extracted", "of_id": str(new_id), "of_label": result["text"][:120]})

    await _finish_chunk(
        job,
        chunk,
        {
            "found": len(parsed["questions"]),
            "saved": saved,
            "existing": existing,
            "rejected": sum(rejected.values()),
        },
        [],
    )
    await _remember_heading(material, ctx, parsed["last_heading"])
    ctx.previous_number = parsed["last_number"]
    await _record(job["_id"], len(parsed["questions"]), saved, existing, rejected, flagged)


async def _apply_answer_keys(material_id) -> int:
    """Gives unanswered MCQs the answer printed in an answer key, only when it is unambiguous.
    Safe to run many times: it only touches pending questions that still have no answer."""
    db = get_db()
    chunks = await db["source_chunks"].find(
        {"material_id": material_id, "pyq_answer_key.0": {"$exists": True}}, {"pyq_answer_key": 1}
    ).to_list(length=None)
    if not chunks:
        return 0

    key_map = pyq_logic.build_key_map([c["pyq_answer_key"] for c in chunks])
    docs = await db["extracted_questions"].find(
        {"material_id": material_id}, {"number": 1, "options": 1, "status": 1, "answer_status": 1}
    ).to_list(length=None)

    numbers_count = Counter(d["number"] for d in docs if d.get("number"))
    missing = [
        {"id": d["_id"], "number": d.get("number"), "option_count": len(d.get("options", []))}
        for d in docs
        if d["status"] == "pending" and d.get("answer_status") == "missing"
    ]
    updates, ambiguous = pyq_logic.plan_key_answers(missing, numbers_count, key_map)

    collection = db["extracted_questions"]
    now = _now()
    applied = 0
    for question_id, index, letter, number in updates:
        result = await collection.update_one(
            {"_id": question_id, "status": "pending", "answer_status": "missing"},
            {
                "$set": {
                    "correct_index": index,
                    "answer_status": "key",
                    "answer_quote": f"Answer key: {number} - {letter}",
                    "updated_at": now,
                },
                "$addToSet": {"flags": "answer_from_key"},
            },
        )
        applied += result.modified_count
    if ambiguous:
        await collection.update_many(
            {"_id": {"$in": ambiguous}, "status": "pending", "answer_status": "missing"},
            {"$addToSet": {"flags": "key_ambiguous"}},
        )
    return applied


# ======================================================================
# Reading: the list of previous-year PDFs and one PDF's detail
# ======================================================================
def _job_out(job: dict | None) -> dict | None:
    if job is None:
        return None
    return {
        "id": str(job["_id"]),
        "status": job["status"],
        "pause_reason": job.get("pause_reason"),
        "pause_kind": job.get("pause_kind"),
        "chunks_processed": job.get("chunks_processed", 0),
        "chunks_failed": job.get("chunks_failed", 0),
        "chunks_skipped": job.get("chunks_skipped", 0),
        "questions_found": job.get("questions_found", 0),
        "saved": job.get("saved", 0),
        "skipped_existing": job.get("skipped_existing", 0),
        "rejected": job.get("rejected", 0),
        "flagged": job.get("flagged", 0),
        "answers_from_key": job.get("answers_from_key", 0),
        "rejected_by_reason": job.get("rejected_by_reason", {}),
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "finished_at": job.get("finished_at"),
    }


async def _grouped(collection: str, match: dict, key_field: str) -> dict:
    cursor = await get_db()[collection].aggregate(
        [
            {"$match": match},
            {"$group": {"_id": {"m": "$material_id", "k": f"${key_field}"}, "n": {"$sum": 1}}},
        ]
    )
    result: dict = {}
    for row in await cursor.to_list(length=None):
        result.setdefault(row["_id"]["m"], {})[row["_id"]["k"]] = row["n"]
    return result


async def _attention(collection: str, ids: list, condition: list) -> dict:
    cursor = await get_db()[collection].aggregate(
        [
            {"$match": {"material_id": {"$in": ids}, "status": "pending", "$or": condition}},
            {"$group": {"_id": "$material_id", "n": {"$sum": 1}}},
        ]
    )
    return {row["_id"]: row["n"] for row in await cursor.to_list(length=None)}


async def build_items(materials: list[dict]) -> list[dict]:
    if not materials:
        return []
    db = get_db()
    ids = [m["_id"] for m in materials]
    mcq_ids = [m["_id"] for m in materials if _paper_type(m) == "mcq"]
    written_ids = [m["_id"] for m in materials if _paper_type(m) == "written"]

    by_status = {
        **await _grouped("extracted_questions", {"material_id": {"$in": mcq_ids}}, "status"),
        **await _grouped("extracted_written_questions", {"material_id": {"$in": written_ids}}, "status"),
    }
    chunk_states = await _grouped("source_chunks", {"material_id": {"$in": ids}}, "pyq_status")
    attention = {
        **await _attention("extracted_questions", mcq_ids, [{"flags.0": {"$exists": True}}, {"correct_index": None}]),
        **await _attention("extracted_written_questions", written_ids, [{"flags.0": {"$exists": True}}]),
    }

    job_docs = (
        await db["generation_jobs"]
        .find({"type": JOB_TYPE, "material_id": {"$in": ids}})
        .sort("created_at", 1)
        .to_list(length=None)
    )
    latest_job = {j["material_id"]: j for j in job_docs}  # the newest job wins
    subject_names, chapter_titles = await _lookup_names(materials)

    items = []
    for material in materials:
        mid = material["_id"]
        counts = by_status.get(mid, {})
        pending = counts.get("pending", 0)
        total = sum(counts.values())
        states = chunk_states.get(mid, {})
        chunks_total = material.get("chunk_count", 0)
        job = latest_job.get(mid)
        pyq = material.get("pyq") or {}

        material_status, material_error = _effective_status(material)
        key, message = pyq_logic.pipeline_status(
            material_status=material_status,
            material_error=material_error,
            job=job,
            failed_chunks=states.get("failed", 0),
            pending=pending,
            extracted_total=total,
            queued=bool(pyq.get("queued_at")),
        )

        subject_id, chapter_id = material.get("subject_id"), material.get("chapter_id")
        items.append(
            {
                "id": str(mid),
                "title": material["title"],
                "paper_type": _paper_type(material),
                "subject": (
                    {"id": str(subject_id), "name": subject_names[subject_id]} if subject_id in subject_names else None
                ),
                "chapter": (
                    {"id": str(chapter_id), "title": chapter_titles[chapter_id]} if chapter_id in chapter_titles else None
                ),
                "year": material.get("year"),
                "exam_tags": material.get("exam_tags", []),
                "original_filename": material["original_filename"],
                "file_size_bytes": material["file_size_bytes"],
                "page_count": material.get("page_count", 0),
                "chunk_count": chunks_total,
                "created_at": material["created_at"],
                "pipeline": {"key": key, "message": message},
                "counts": {
                    "total": total,
                    "pending": pending,
                    "approved": counts.get("approved", 0),
                    "rejected": counts.get("rejected", 0),
                    "needs_attention": attention.get(mid, 0),
                },
                "progress": {
                    "chunks_total": chunks_total,
                    "chunks_done": states.get("done", 0),
                    "chunks_failed": states.get("failed", 0),
                },
                "job": _job_out(job),
                "detected_exam_name": pyq.get("detected_exam_name"),
                "detected_year": pyq.get("detected_year"),
                "warnings": material.get("warnings", []),
            }
        )
    return items


async def list_materials(*, status: str | None, paper_type: str | None, search: str | None, page: int, page_size: int) -> dict:
    db = get_db()
    query: dict = {"kind": "previous_year"}
    term = (search or "").strip()[:100]
    if term:
        query["title"] = {"$regex": re.escape(term), "$options": "i"}

    materials = await db["source_materials"].find(query).sort([("created_at", -1), ("_id", -1)]).to_list(length=None)
    if paper_type:
        materials = [m for m in materials if _paper_type(m) == paper_type]
    items = await build_items(materials)

    summary: dict[str, int] = dict(Counter(item["pipeline"]["key"] for item in items))
    if status:
        items = [item for item in items if item["pipeline"]["key"] == status]

    total = len(items)
    start = (page - 1) * page_size
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": summary,
    }


async def get_detail(material_id: str) -> dict:
    db = get_db()
    material = await _get_material(material_id)
    _require_extractable(material)

    item = (await build_items([material]))[0]
    other = await db["generation_jobs"].find_one(
        {"type": JOB_TYPE, "status": ACTIVE, "material_id": {"$ne": material["_id"]}}, {"material_title": 1}
    )
    job = item["job"]
    remaining = await _remaining(material["_id"])
    ready = material["status"] == "ready"

    blocked = None
    if not ready:
        blocked = "The text of this PDF has not been extracted successfully, so there is nothing to process."
    elif job and job["status"] in (ACTIVE, "running"):
        blocked = "Extraction is running for this PDF."
    elif other:
        title = other.get("material_title", "another PDF")
        blocked = f"Another PDF is being processed (\"{title}\"). This one continues right after it."
    elif job and job["status"] == "paused":
        blocked = "A paused extraction exists for this PDF. Resume it instead of starting a new one."
    elif remaining == 0:
        blocked = "Every part of this PDF has already been processed."

    can_resume = bool(job and job["status"] == "paused" and ready and remaining > 0 and not other)
    return {**item, "can_start": blocked is None, "can_resume": can_resume, "blocked_reason": blocked}