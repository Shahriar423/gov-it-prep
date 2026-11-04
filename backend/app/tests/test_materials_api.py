"""Tests that need no database: access control, form validation and the metadata rules."""
import pytest
from fastapi.testclient import TestClient

from app.core.constants import TARGET_EXAMS
from app.main import app
from app.schemas.material import MaterialMeta

client = TestClient(app)

VALID_META = {"title": "Networking notes", "kind": "notes", "subject_id": "abc123"}


# ---------------------------------------------------------------- access control
def test_material_routes_require_a_login():
    assert client.get("/api/admin/materials").status_code == 401
    assert client.get("/api/admin/materials/options").status_code == 401
    assert client.get("/api/admin/materials/abc123").status_code == 401
    assert client.delete("/api/admin/materials/abc123").status_code == 401
    upload = client.post(
        "/api/admin/materials",
        data={"title": "x", "kind": "notes", "subject_id": "y"},
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert upload.status_code == 401


def test_material_routes_reject_garbage_tokens():
    headers = {"Authorization": "Bearer garbage"}
    assert client.get("/api/admin/materials", headers=headers).status_code == 401


# ---------------------------------------------------------------- metadata rules
def test_notes_ignore_the_year():
    meta = MaterialMeta(**VALID_META, year=2019)
    assert meta.year is None


def test_previous_year_papers_keep_the_year():
    meta = MaterialMeta(**{**VALID_META, "kind": "previous_year"}, year=2019)
    assert meta.year == 2019


def test_exam_tags_must_be_known_and_are_deduplicated():
    first = TARGET_EXAMS[0]
    meta = MaterialMeta(**VALID_META, exam_tags=[first, first])
    assert meta.exam_tags == [first]
    with pytest.raises(ValueError):
        MaterialMeta(**VALID_META, exam_tags=["Astronaut"])


def test_title_is_trimmed_and_must_be_long_enough():
    assert MaterialMeta(**{**VALID_META, "title": "  Networking notes  "}).title == "Networking notes"
    with pytest.raises(ValueError):
        MaterialMeta(**{**VALID_META, "title": "ab"})


def test_blank_chapter_becomes_none():
    assert MaterialMeta(**VALID_META, chapter_id="  ").chapter_id is None


def test_unknown_material_type_is_rejected():
    with pytest.raises(ValueError):
        MaterialMeta(**{**VALID_META, "kind": "video"})