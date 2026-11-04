import asyncio
import logging
from app.routers import history  
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from app.core.config import settings
from app.core.errors import AppError
from app.db.indexes import ensure_indexes
from app.db.mongo import close_mongo, connect_to_mongo
from app.routers import (
    admin,
    admin_content,
    admin_exams,
    admin_extraction,
    admin_materials,
    admin_questions,
    admin_structure,
    admin_written,
    auth,
    auto_exams,
    content,
    dashboard,
    history,
    exams,
    health,
    practice,
    revision,
    chapter_performance,
    users,
)
from app.services import extraction_service

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    try:
        await ensure_indexes()
        # Extraction jobs are marked first so that they can resume by themselves
        await extraction_service.recover_on_startup()
    except PyMongoError:
        # The server still starts; /health will show the database as unavailable
        logger.warning("Could not prepare the database at startup. Is MongoDB reachable?")

    # Background loop that starts queued previous-year extractions, one at a time
    supervisor = asyncio.create_task(extraction_service.supervisor_loop())
    extraction_service.wake_supervisor()
    yield
    supervisor.cancel()
    await asyncio.gather(supervisor, return_exceptions=True)
    await extraction_service.shutdown()
    await close_mongo()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(PyMongoError)
async def database_error_handler(request: Request, exc: PyMongoError):
    logger.error("Database error: %s", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        content={"detail": "The database is temporarily unavailable. Please try again."},
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin_content.router)
app.include_router(admin_questions.router)
app.include_router(admin_written.router)
app.include_router(admin_structure.router)
app.include_router(admin_exams.router)  # dormant: removed from the screens, deleted in the cleanup phase
app.include_router(admin_materials.router)
app.include_router(admin_extraction.router)
app.include_router(dashboard.router)
app.include_router(content.router)
app.include_router(practice.router)
app.include_router(exams.router)
app.include_router(auto_exams.router)
app.include_router(revision.router)
app.include_router(users.router)
app.include_router(history.router)
app.include_router(chapter_performance.router)