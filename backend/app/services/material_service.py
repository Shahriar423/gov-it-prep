"""Source materials: PDF upload, text extraction, chunk storage and metadata.

The PDF file itself is NOT stored (free hosting has no permanent disk). Only the metadata and
the extracted text chunks are kept, so a failed material is retried by choosing the file again."""
import asyncio
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.constants import MATERIAL_KINDS, TARGET_EXAMS
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.ids import parse_object_id
from app.db.mongo import get_db
from app.ingestion.errors import PdfProcessingError
from app.ingestion.processor import ProcessedPdf, process_pdf
from app.schemas.material import MaterialMeta

logger = logging.getLogger("uvicorn.error")

STALE_AFTER = timedelta(minutes=5)  # "processing" for longer than this means the server stopped midway
PREVIEW_CHARS = 1500
SORT = [("created_at", -1), ("_id", -1)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ======================================================================
# Helpers
# ======================================================================
def _effective_status(doc: dict) -> tuple[str, str | None]:
    if doc["status"] == "processing" and doc["updated_at"] < _now() - STALE_AFTER:
        return "failed", (
            "Processing was interrupted before it finished. Retry by choosing the PDF file again."
        )
    return doc["status"], doc.get("error")


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


def _item(doc: dict, subject_names: dict, chapter_titles: dict) -> dict:
    status, error = _effective_status(doc)
    subject_id = doc.get("subject_id")
    chapter_id = doc.get("chapter_id")
    return {
        "id": str(doc["_id"]),
        "title": doc["title"],
        "kind": doc["kind"],
        "subject": (
            {"id": str(subject_id), "name": subject_names[subject_id]}
            if subject_id in subject_names
            else None
        ),
        "chapter": (
            {"id": str(chapter_id), "title": chapter_titles[chapter_id]}
            if chapter_id in chapter_titles
            else None
        ),
        "exam_tags": doc.get("exam_tags", []),
        "year": doc.get("year"),
        "original_filename": doc["original_filename"],
        "file_size_bytes": doc["file_size_bytes"],
        "page_count": doc.get("page_count", 0),
        "pages_with_text": doc.get("pages_with_text", 0),
        "chunk_count": doc.get("chunk_count", 0),
        "word_count": doc.get("word_count", 0),
        "char_count": doc.get("char_count", 0),
        "status": status,
        "error": error,
        "warnings": doc.get("warnings", []),
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "processed_at": doc.get("processed_at"),
    }


async def _get_doc(material_id: str) -> dict:
    oid = parse_object_id(material_id, NotFoundError, "Material not found.")
    doc = await get_db()["source_materials"].find_one({"_id": oid})
    if doc is None:
        raise NotFoundError("Material not found.")
    return doc


async def _resolve_refs(subject_id: str, chapter_id: str | None):
    db = get_db()
    sid = parse_object_id(subject_id, BadRequestError, "Please choose a valid subject.")
    subject = await db["subjects"].find_one({"_id": sid})
    if subject is None:
        raise BadRequestError("The selected subject does not exist.")

    chapter = None
    if chapter_id:
        cid = parse_object_id(chapter_id, BadRequestError, "Please choose a valid chapter.")
        chapter = await db["chapters"].find_one({"_id": cid, "subject_id": sid})
        if chapter is None:
            raise BadRequestError("The selected chapter does not belong to this subject.")
    return subject, chapter


def get_options() -> dict:
    return {
        "target_exams": list(TARGET_EXAMS),
        "kinds": [{"value": value, "label": label} for value, label in MATERIAL_KINDS],
        "limits": {"max_upload_mb": settings.max_upload_mb, "max_pdf_pages": settings.max_pdf_pages},
    }


# ======================================================================
# Reading the uploaded file
# ======================================================================
async def read_pdf_upload(file) -> tuple[bytes, str]:
    """Checks the basics (type, size) and returns (file bytes, clean file name)."""
    filename = re.sub(r"[\x00-\x1f]", "", (file.filename or "")).strip()
    if not filename.lower().endswith(".pdf"):
        raise BadRequestError("Please choose a PDF file (a file ending in .pdf).")

    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise BadRequestError(f"This file is larger than the {settings.max_upload_mb} MB limit.")
    if len(data) == 0:
        raise BadRequestError("The file is empty.")
    if b"%PDF-" not in data[:1024]:
        raise BadRequestError("This file is not a valid PDF.")
    return data, filename[:200]


async def _check_duplicate(sha256: str, exclude_id=None) -> None:
    query: dict = {"file_sha256": sha256}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    existing = await get_db()["source_materials"].find_one(query, {"title": 1})
    if existing:
        raise ConflictError(
            f'This exact file was already uploaded as "{existing["title"]}". '
            "Open that material instead of uploading it again."
        )


# ======================================================================
# Processing
# ======================================================================
async def _mark_failed(doc: dict, message: str, page_count: int | None = None) -> dict:
    db = get_db()
    changes = {
        "status": "failed",
        "error": message,
        "warnings": [],
        "chunk_count": 0,
        "pages_with_text": 0,
        "word_count": 0,
        "char_count": 0,
        "updated_at": _now(),
    }
    if page_count is not None:
        changes["page_count"] = page_count
    await db["source_chunks"].delete_many({"material_id": doc["_id"]})
    await db["source_materials"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return {**doc, **changes}


async def _process_into(doc: dict, data: bytes) -> dict:
    """Extracts the text and stores the chunks. Returns the updated material document.
    Problems with the PDF itself become a 'failed' material with a readable message."""
    db = get_db()

    try:
        processed: ProcessedPdf = await asyncio.to_thread(process_pdf, data, settings.max_pdf_pages)
    except PdfProcessingError as error:
        return await _mark_failed(doc, error.message, error.page_count)
    except Exception:
        logger.exception("PDF processing crashed for material %s", doc["_id"])
        return await _mark_failed(
            doc,
            "The PDF could not be processed. It may be damaged. "
            "Try saving it again from the original program and upload it again.",
        )

    now = _now()
    chunk_docs = [
        {
            "material_id": doc["_id"],
            "index": chunk.index,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "text": chunk.text,
            "char_count": len(chunk.text),
            "word_count": len(chunk.text.split()),
            # Copied from the material so later phases can select chunks without a join
            "subject_id": doc["subject_id"],
            "chapter_id": doc.get("chapter_id"),
            "exam_tags": doc.get("exam_tags", []),
            "kind": doc["kind"],
            "year": doc.get("year"),
            "created_at": now,
        }
        for chunk in processed.chunks
    ]

    if not chunk_docs:
        return await _mark_failed(
            doc, "No usable text could be extracted from this PDF.", processed.page_count
        )

    try:
        await db["source_chunks"].delete_many({"material_id": doc["_id"]})
        await db["source_chunks"].insert_many(chunk_docs, ordered=True)
    except PyMongoError:
        try:
            await db["source_chunks"].delete_many({"material_id": doc["_id"]})
        except PyMongoError:
            pass
        raise  # becomes a clear "database unavailable" response

    changes = {
        "status": "ready",
        "error": None,
        "warnings": processed.warnings,
        "page_count": processed.page_count,
        "pages_with_text": processed.pages_with_text,
        "chunk_count": len(chunk_docs),
        "word_count": processed.word_count,
        "char_count": processed.char_count,
        "updated_at": now,
        "processed_at": now,
    }
    await db["source_materials"].update_one({"_id": doc["_id"]}, {"$set": changes})
    return {**doc, **changes}


# ======================================================================
# Upload, retry, edit, delete
# ======================================================================
async def upload_material(meta: MaterialMeta, data: bytes, filename: str, admin: dict) -> dict:
    subject, chapter = await _resolve_refs(meta.subject_id, meta.chapter_id)
    sha256 = hashlib.sha256(data).hexdigest()
    await _check_duplicate(sha256)

    now = _now()
    doc = {
        "title": meta.title,
        "kind": meta.kind,
        "subject_id": subject["_id"],
        "chapter_id": chapter["_id"] if chapter else None,
        "exam_tags": meta.exam_tags,
        "year": meta.year,
        "original_filename": filename,
        "file_size_bytes": len(data),
        "file_sha256": sha256,
        "page_count": 0,
        "pages_with_text": 0,
        "chunk_count": 0,
        "word_count": 0,
        "char_count": 0,
        "status": "processing",
        "error": None,
        "warnings": [],
        "uploaded_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
        "processed_at": None,
    }
    result = await get_db()["source_materials"].insert_one(doc)
    doc["_id"] = result.inserted_id

    doc = await _process_into(doc, data)
    return await get_material(str(doc["_id"]))


async def reprocess_material(material_id: str, data: bytes, filename: str) -> dict:
    """Retry for a failed material: the admin chooses the PDF file again."""
    doc = await _get_doc(material_id)
    status, _ = _effective_status(doc)
    if status != "failed":
        raise ConflictError("Only materials whose processing failed can be retried.")

    sha256 = hashlib.sha256(data).hexdigest()
    await _check_duplicate(sha256, exclude_id=doc["_id"])

    now = _now()
    claimed = await get_db()["source_materials"].find_one_and_update(
        {
            "_id": doc["_id"],
            "$or": [
                {"status": "failed"},
                {"status": "processing", "updated_at": {"$lt": now - STALE_AFTER}},
            ],
        },
        {
            "$set": {
                "status": "processing",
                "error": None,
                "warnings": [],
                "original_filename": filename,
                "file_size_bytes": len(data),
                "file_sha256": sha256,
                "updated_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if claimed is None:
        raise ConflictError("This material is already being processed. Please wait a moment.")

    claimed = await _process_into(claimed, data)
    return await get_material(str(claimed["_id"]))


async def update_material(material_id: str, meta: MaterialMeta) -> dict:
    db = get_db()
    doc = await _get_doc(material_id)
    subject, chapter = await _resolve_refs(meta.subject_id, meta.chapter_id)

    shared = {
        "subject_id": subject["_id"],
        "chapter_id": chapter["_id"] if chapter else None,
        "exam_tags": meta.exam_tags,
        "kind": meta.kind,
        "year": meta.year,
    }
    await db["source_materials"].update_one(
        {"_id": doc["_id"]}, {"$set": {**shared, "title": meta.title, "updated_at": _now()}}
    )
    # Keep the copies stored on the chunks in step with the material
    await db["source_chunks"].update_many({"material_id": doc["_id"]}, {"$set": shared})
    return await get_material(material_id)


async def delete_material(material_id: str) -> None:
    db = get_db()
    doc = await _get_doc(material_id)
    await db["source_chunks"].delete_many({"material_id": doc["_id"]})
    await db["source_materials"].delete_one({"_id": doc["_id"]})


# ======================================================================
# Reading
# ======================================================================
async def get_material(material_id: str) -> dict:
    db = get_db()
    doc = await _get_doc(material_id)
    subject_names, chapter_titles = await _lookup_names([doc])
    item = _item(doc, subject_names, chapter_titles)

    first = await db["source_chunks"].find_one({"material_id": doc["_id"], "index": 0}, {"text": 1})
    item["preview"] = (first["text"][:PREVIEW_CHARS] if first else "")
    return item


async def list_materials(
    *,
    kind: str | None,
    status: str | None,
    subject_id: str | None,
    exam: str | None,
    search: str | None,
    page: int,
    page_size: int,
) -> dict:
    db = get_db()
    cutoff = _now() - STALE_AFTER
    clauses: list[dict] = []

    if kind:
        clauses.append({"kind": kind})
    if subject_id:
        clauses.append({"subject_id": parse_object_id(subject_id, BadRequestError, "Invalid subject filter.")})
    if exam:
        # A material with no exam tags applies to every exam
        clauses.append({"$or": [{"exam_tags": exam}, {"exam_tags": []}]})
    term = (search or "").strip()[:100]
    if term:
        clauses.append({"title": {"$regex": re.escape(term), "$options": "i"}})
    if status == "ready":
        clauses.append({"status": "ready"})
    elif status == "processing":
        clauses.append({"status": "processing", "updated_at": {"$gte": cutoff}})
    elif status == "failed":
        clauses.append(
            {"$or": [{"status": "failed"}, {"status": "processing", "updated_at": {"$lt": cutoff}}]}
        )

    query = {"$and": clauses} if clauses else {}
    collection = db["source_materials"]
    total = await collection.count_documents(query)
    docs = (
        await collection.find(query)
        .sort(SORT)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(length=None)
    )
    subject_names, chapter_titles = await _lookup_names(docs)
    return {
        "items": [_item(d, subject_names, chapter_titles) for d in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def list_chunks(material_id: str, page: int, page_size: int) -> dict:
    db = get_db()
    doc = await _get_doc(material_id)
    query = {"material_id": doc["_id"]}
    total = await db["source_chunks"].count_documents(query)
    chunks = (
        await db["source_chunks"]
        .find(
            query,
            {"index": 1, "page_start": 1, "page_end": 1, "text": 1, "char_count": 1, "word_count": 1},
        )
        .sort("index", 1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(length=None)
    )
    return {
        "items": [
            {
                "index": c["index"],
                "page_start": c["page_start"],
                "page_end": c["page_end"],
                "text": c["text"],
                "char_count": c["char_count"],
                "word_count": c["word_count"],
            }
            for c in chunks
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }