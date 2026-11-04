"""Tests that need no database: access control, request validation and the fixed rules."""
import pytest
from fastapi.testclient import TestClient

from app.core.constants import (
    MAX_WRITTEN_QUESTIONS,
    NON_TECHNICAL_SUBJECTS,
    TECHNICAL_CHAPTERS,
    WRITTEN_MARKS_PER_QUESTION,
)
from app.main import app
from app.schemas.auto_exam import CreateExamRequest

client = TestClient(app)

BASE = {"type": "mcq", "category": "technical", "selection": "all", "count": 10, "duration_minutes": 15}


# ---------------------------------------------------------------- access control
def test_exam_creation_routes_require_a_login():
    assert client.get("/api/exams/builder").status_code == 401
    assert client.get("/api/exams/availability?type=mcq&category=technical").status_code == 401
    assert client.post("/api/exams/create", json=BASE).status_code == 401
    assert client.get("/api/exams/written/abc").status_code == 401
    assert client.post("/api/exams/written/abc/finish").status_code == 401


def test_admin_routes_for_the_new_screens_require_a_login():
    assert client.get("/api/admin/written-questions").status_code == 401
    assert client.get("/api/admin/exam-structure").status_code == 401
    assert client.post("/api/admin/exam-structure/seed").status_code == 401


# ---------------------------------------------------------------- request rules
def test_a_valid_mcq_request_defaults_to_mixed_difficulty():
    exam = CreateExamRequest(**BASE)
    assert exam.difficulty == "mixed"
    assert exam.negative_marking == 0.0


def test_written_exams_ignore_negative_marking_and_have_a_cap():
    exam = CreateExamRequest(**{**BASE, "type": "written", "count": 5, "negative_marking": 0.5})
    assert exam.negative_marking == 0.0
    with pytest.raises(ValueError):
        CreateExamRequest(**{**BASE, "type": "written", "count": MAX_WRITTEN_QUESTIONS + 1})


def test_negative_marking_must_be_an_allowed_value():
    assert CreateExamRequest(**{**BASE, "negative_marking": 0.25}).negative_marking == 0.25
    with pytest.raises(ValueError):
        CreateExamRequest(**{**BASE, "negative_marking": 0.3})


def test_unknown_values_are_rejected():
    for change in ({"type": "oral"}, {"category": "science"}, {"difficulty": "extreme"}, {"count": 0}, {"duration_minutes": 0}):
        with pytest.raises(ValueError):
            CreateExamRequest(**{**BASE, **change})


# ---------------------------------------------------------------- fixed rules
def test_the_exam_structure_constants():
    assert NON_TECHNICAL_SUBJECTS == ("Bangla", "English", "General Knowledge")
    assert len(TECHNICAL_CHAPTERS) == 14
    assert WRITTEN_MARKS_PER_QUESTION == 10