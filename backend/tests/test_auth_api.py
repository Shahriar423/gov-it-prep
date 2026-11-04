"""Tests that do not need a database: bad input and missing/invalid tokens
are rejected before any database call is made."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID = {"name": "Test Student", "email": "student1@gmail.com", "password": "Study2026ok"}


def test_register_rejects_short_password():
    r = client.post("/api/auth/register", json={**VALID, "password": "a1"})
    assert r.status_code == 422


def test_register_rejects_password_without_number():
    r = client.post("/api/auth/register", json={**VALID, "password": "onlyletters"})
    assert r.status_code == 422


def test_register_rejects_invalid_email():
    r = client.post("/api/auth/register", json={**VALID, "email": "not-an-email"})
    assert r.status_code == 422


def test_register_rejects_unknown_target_exam():
    r = client.post("/api/auth/register", json={**VALID, "target_exam": "Astronaut"})
    assert r.status_code == 422


def test_register_rejects_missing_name():
    body = {k: v for k, v in VALID.items() if k != "name"}
    assert client.post("/api/auth/register", json=body).status_code == 422


def test_login_rejects_missing_password():
    r = client.post("/api/auth/login", json={"email": "student1@gmail.com"})
    assert r.status_code == 422


def test_me_requires_token():
    assert client.get("/api/auth/me").status_code == 401


def test_me_rejects_garbage_token():
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


def test_admin_ping_requires_token():
    assert client.get("/api/admin/ping").status_code == 401


def test_admin_ping_rejects_garbage_token():
    r = client.get("/api/admin/ping", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401
