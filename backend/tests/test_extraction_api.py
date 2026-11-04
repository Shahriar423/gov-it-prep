"""Tests that need no database: access control for the new endpoints."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ROUTES = [
    ("get", "/api/admin/extraction/materials"),
    ("get", "/api/admin/extraction/materials/abc"),
    ("post", "/api/admin/extraction/materials/abc/start"),
    ("post", "/api/admin/extraction/jobs/abc/resume"),
    ("post", "/api/admin/extraction/jobs/abc/stop"),
    ("get", "/api/admin/extraction/materials/abc/questions"),
    ("post", "/api/admin/extraction/materials/abc/approve-clean"),
    ("put", "/api/admin/extraction/questions/abc"),
    ("post", "/api/admin/extraction/questions/abc/approve"),
    ("post", "/api/admin/extraction/questions/abc/reject"),
    ("post", "/api/admin/extraction/questions/abc/restore"),
]


def test_extraction_routes_require_a_login():
    for method, path in ROUTES:
        response = getattr(client, method)(path)
        assert response.status_code == 401, path


def test_extraction_routes_reject_garbage_tokens():
    headers = {"Authorization": "Bearer garbage"}
    for method, path in ROUTES:
        response = getattr(client, method)(path, headers=headers)
        assert response.status_code == 401, path