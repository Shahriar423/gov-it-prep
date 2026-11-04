from app.db.mongo import get_db


async def ensure_indexes() -> None:
    """Safe to run many times; MongoDB ignores indexes that already exist."""
    db = get_db()
    await db["users"].create_index("email", unique=True)
    await db["subjects"].create_index("slug", unique=True)
    await db["chapters"].create_index([("subject_id", 1), ("order", 1)])
    await db["questions"].create_index([("subject_id", 1), ("chapter_id", 1), ("status", 1)])
    await db["revision_schedules"].create_index([("user_id", 1), ("question_id", 1)], unique=True)
    await db["revision_schedules"].create_index([("user_id", 1), ("next_review_at", 1)])
    await db["exams"].create_index([("status", 1), ("created_at", -1)])
    await db["exam_attempts"].create_index([("user_id", 1), ("started_at", -1)])
    # A user can have only ONE attempt in progress at a time (enforced by the database)
    await db["exam_attempts"].create_index(
        [("user_id", 1)],
        unique=True,
        partialFilterExpression={"status": "in_progress"},
        name="one_active_attempt_per_user",
    )
    # Source materials (uploaded PDFs) and their extracted text chunks
    await db["source_materials"].create_index([("created_at", -1)])
    await db["source_materials"].create_index("file_sha256")
    await db["source_chunks"].create_index([("material_id", 1), ("index", 1)], unique=True)
    await db["source_chunks"].create_index([("material_id", 1), ("mcq_status", 1), ("index", 1)])
    await db["source_chunks"].create_index([("material_id", 1), ("pyq_status", 1), ("index", 1)])
    # AI jobs and previous-year extraction jobs share this collection
    await db["generation_jobs"].create_index([("material_id", 1), ("created_at", -1)])
    await db["generation_jobs"].create_index([("type", 1), ("status", 1), ("updated_at", 1)])
    # Only ONE AI question-generation job can be running at a time (enforced by the database)
    await db["generation_jobs"].create_index(
        [("status", 1)],
        unique=True,
        partialFilterExpression={"status": "running"},
        name="one_running_generation_job",
    )
    # Only ONE previous-year extraction can be running at a time. It does not block AI generation.
    await db["generation_jobs"].create_index(
        [("type", 1)],
        unique=True,
        partialFilterExpression={"status": "extracting"},
        name="one_extracting_job",
    )
    await db["questions"].create_index([("material_id", 1), ("source", 1)])
    await db["questions"].create_index(
        [("text_hash", 1)], partialFilterExpression={"text_hash": {"$exists": True}}
    )
    # An extracted question can be approved into the question bank only once
    await db["questions"].create_index(
        [("extracted_id", 1)],
        unique=True,
        partialFilterExpression={"extracted_id": {"$exists": True}},
        name="one_question_per_extracted_question",
    )
    # Written questions and written (display-only) exam sessions
    await db["written_questions"].create_index([("status", 1), ("subject_id", 1), ("chapter_id", 1)])
    await db["written_questions"].create_index(
        [("extracted_id", 1)],
        unique=True,
        partialFilterExpression={"extracted_id": {"$exists": True}},
        name="one_written_question_per_extracted_question",
    )
    await db["written_exam_sessions"].create_index([("user_id", 1), ("started_at", -1)])
    # A student can have only ONE written exam in progress at a time (enforced by the database)
    await db["written_exam_sessions"].create_index(
        [("user_id", 1)],
        unique=True,
        partialFilterExpression={"status": "in_progress"},
        name="one_active_written_session",
    )
    # Questions extracted from previous-year PDFs, waiting for admin review.
    # The same question can be stored only once per PDF, so a retry never inserts it again.
    await db["extracted_questions"].create_index([("material_id", 1), ("fingerprint", 1)], unique=True)
    await db["extracted_questions"].create_index([("material_id", 1), ("status", 1), ("chunk_index", 1)])
    await db["extracted_written_questions"].create_index([("material_id", 1), ("fingerprint", 1)], unique=True)
    await db["extracted_written_questions"].create_index([("material_id", 1), ("status", 1), ("chunk_index", 1)])