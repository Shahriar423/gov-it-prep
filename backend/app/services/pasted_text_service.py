"""Question text pasted into a box instead of a PDF.

The pasted text becomes a normal 'previous_year' source material with text chunks, exactly like an
uploaded PDF. The existing queue, rule-based extractor, review screens and approval steps are then
reused unchanged. Nothing is ever approved automatically."""
import hashlib

from bson import ObjectId
from pymongo.errors import PyMongoError

from app.core.errors import BadRequestError, ConflictError
from app.db.mongo import get_db
from app.ingestion.chunker import chunk_pages
from app.ingestion.text_cleaning import clean_page_text
from app.schemas.material import MaterialMeta
from app.services import material_service

MAX_CHARS = 100_000
MIN_WORDS = 8
SOURCE_NAME = "Pasted text"


async def create_from_text(meta: MaterialMeta, text: str, paper_type: str, admin: dict) -> dict:
    cleaned = clean_page_text(text or "")
    if not cleaned.strip():
        raise BadRequestError("Please paste the question text first.")
    if len(cleaned) > MAX_CHARS:
        raise BadRequestError(
            f"The pasted text is longer than {MAX_CHARS:,} characters. Paste it in smaller parts."
        )

    chunks = chunk_pages([(1, cleaned)])
    word_count = sum(len(c.text.split()) for c in chunks)
    if not chunks or word_count < MIN_WORDS:
        raise BadRequestError("The pasted text is too short to contain a question.")

    subject, chapter = await material_service._resolve_refs(meta.subject_id, meta.chapter_id)

    db = get_db()
    digest = hashlib.sha256(("pasted-text:" + " ".join(cleaned.split())).encode("utf-8")).hexdigest()
    existing = await db["source_materials"].find_one({"file_sha256": digest}, {"title": 1})
    if existing:
        raise ConflictError(
            f'This exact text was already added as "{existing["title"]}". Open that material instead.'
        )

    now = material_service._now()
    material_id = ObjectId()
    material_doc = {
        "_id": material_id,
        "title": meta.title,
        "kind": meta.kind,
        "paper_type": paper_type,
        "subject_id": subject["_id"],
        "chapter_id": chapter["_id"] if chapter else None,
        "exam_tags": meta.exam_tags,
        "year": meta.year,
        "original_filename": SOURCE_NAME,
        "file_size_bytes": len(cleaned.encode("utf-8")),
        "file_sha256": digest,
        "page_count": 1,
        "pages_with_text": 1,
        "chunk_count": len(chunks),
        "word_count": word_count,
        "char_count": sum(len(c.text) for c in chunks),
        "status": "ready",
        "error": None,
        "warnings": [],
        "uploaded_by": admin["_id"],
        "created_at": now,
        "updated_at": now,
        "processed_at": now,
    }
    chunk_docs = [
        {
            "material_id": material_id,
            "index": chunk.index,
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
            "text": chunk.text,
            "char_count": len(chunk.text),
            "word_count": len(chunk.text.split()),
            "subject_id": subject["_id"],
            "chapter_id": chapter["_id"] if chapter else None,
            "exam_tags": meta.exam_tags,
            "kind": meta.kind,
            "year": meta.year,
            "created_at": now,
        }
        for chunk in chunks
    ]

    # Nothing is queued yet, so the extractor cannot see this material until both inserts are done
    try:
        await db["source_materials"].insert_one(material_doc)
        await db["source_chunks"].insert_many(chunk_docs, ordered=True)
    except PyMongoError:
        try:
            await db["source_chunks"].delete_many({"material_id": material_id})
            await db["source_materials"].delete_one({"_id": material_id})
        except PyMongoError:
            pass
        raise  # becomes a clear "database unavailable" response

    return await material_service.get_material(str(material_id))