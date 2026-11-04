"""Tests that need no database: access control for the written review endpoints and the upload."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ROUTES = [
    ("get", "/api/admin/extraction/written/materials/abc/questions"),
    ("post", "/api/admin/extraction/written/materials/abc/approve-clean"),
    ("put", "/api/admin/extraction/written/questions/abc"),
    ("post", "/api/admin/extraction/written/questions/abc/approve"),
    ("post", "/api/admin/extraction/written/questions/abc/reject"),
    ("post", "/api/admin/extraction/written/questions/abc/restore"),
]


def test_written_review_routes_require_a_login():
    for method, path in ROUTES:
        assert getattr(client, method)(path).status_code == 401, path


def test_written_review_routes_reject_garbage_tokens():
    headers = {"Authorization": "Bearer garbage"}
    for method, path in ROUTES:
        assert getattr(client, method)(path, headers=headers).status_code == 401, path


def test_the_upload_with_a_paper_type_still_requires_a_login():
    response = client.post(
        "/api/admin/materials",
        data={"title": "x", "kind": "previous_year", "subject_id": "y", "paper_type": "written"},
        files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 401