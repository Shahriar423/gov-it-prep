"""Tests that need no database, key or network: access control and the configuration check."""
import pytest
from fastapi.testclient import TestClient

from app.ai import llm_client
from app.core.config import settings
from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------- access control
def test_ai_routes_require_a_login():
    assert client.get("/api/admin/ai/status").status_code == 401
    assert client.post("/api/admin/ai/test").status_code == 401
    assert client.get("/api/admin/ai/materials/abc/overview").status_code == 401
    assert client.post("/api/admin/ai/materials/abc/generate-mcq", json={}).status_code == 401
    assert client.get("/api/admin/ai/materials/abc/questions").status_code == 401
    assert client.post("/api/admin/ai/jobs/abc/resume").status_code == 401
    assert client.post("/api/admin/ai/jobs/abc/stop").status_code == 401


def test_ai_routes_reject_garbage_tokens():
    headers = {"Authorization": "Bearer garbage"}
    assert client.get("/api/admin/ai/status", headers=headers).status_code == 401


# ---------------------------------------------------------------- configuration check
def set_ai(monkeypatch, **values):
    base = {"ai_provider": "gemini", "ai_api_key": "", "ai_model": "", "ai_base_url": ""}
    for key, value in {**base, **values}.items():
        monkeypatch.setattr(settings, key, value)


def test_ai_is_disabled_without_a_key_and_says_what_is_missing(monkeypatch):
    set_ai(monkeypatch)
    status = llm_client.get_status()
    assert status.configured is False
    assert status.missing == ["AI_API_KEY", "AI_MODEL"]
    assert "AI_API_KEY" in status.message


def test_ai_is_enabled_when_key_and_model_are_set(monkeypatch):
    set_ai(monkeypatch, ai_api_key="test-key", ai_model="some-model")
    status = llm_client.get_status()
    assert status.configured is True
    assert status.missing == []


def test_unknown_provider_is_reported(monkeypatch):
    set_ai(monkeypatch, ai_provider="skynet", ai_api_key="k", ai_model="m")
    status = llm_client.get_status()
    assert status.configured is False
    assert status.missing == ["AI_PROVIDER"]


def test_openai_compatible_also_needs_a_base_url(monkeypatch):
    set_ai(monkeypatch, ai_provider="openai_compatible", ai_api_key="k", ai_model="m")
    assert llm_client.get_status().missing == ["AI_BASE_URL"]


def test_generation_refuses_to_run_without_configuration(monkeypatch):
    import asyncio

    from app.ai.errors import AiNotConfigured

    set_ai(monkeypatch)
    with pytest.raises(AiNotConfigured):
        asyncio.run(llm_client.generate_json("hello", {"type": "object"}))