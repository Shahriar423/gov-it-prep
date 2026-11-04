"""CORS preflight tests. No database needed: login/register reject bad input
before any database call, so these run offline."""
from fastapi.testclient import TestClient

from app.core.config import PRODUCTION_FRONTEND_ORIGIN, Settings
from app.main import app

client = TestClient(app)

PROD = PRODUCTION_FRONTEND_ORIGIN
LOCAL = "http://localhost:5173"


def _preflight(path: str, origin: str):
    return client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )


def _settings(cors_origins: str) -> Settings:
    return Settings(
        mongodb_uri="mongodb://localhost:27017",
        jwt_secret_key="k" * 32,
        cors_origins=cors_origins,
    )


def test_production_origin_is_exact():
    assert PROD == "https://gov-it-prep.vercel.app"


def test_preflight_allows_production_origin_for_login_and_register():
    for path in ("/api/auth/login", "/api/auth/register"):
        r = _preflight(path, PROD)
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == PROD
        assert "POST" in r.headers["access-control-allow-methods"]
        assert "authorization" in r.headers["access-control-allow-headers"].lower()


def test_preflight_still_allows_localhost():
    r = _preflight("/api/auth/login", LOCAL)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == LOCAL


def test_preflight_rejects_unknown_origin():
    r = _preflight("/api/auth/login", "https://evil.example.com")
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers


def test_no_wildcard_origin_is_ever_returned():
    r = _preflight("/api/auth/login", PROD)
    assert r.headers["access-control-allow-origin"] != "*"
    assert "*" not in _settings("*").cors_origin_list


def test_real_login_and_register_responses_carry_cors_header():
    r = client.post(
        "/api/auth/login", json={"email": "a@b.com"}, headers={"Origin": PROD}
    )
    assert r.status_code == 422
    assert r.headers["access-control-allow-origin"] == PROD

    r = client.post("/api/auth/register", json={}, headers={"Origin": PROD})
    assert r.status_code == 422
    assert r.headers["access-control-allow-origin"] == PROD


def test_origins_are_cleaned_and_production_is_always_included():
    s = _settings(" 'http://localhost:5173/' , http://127.0.0.1:5173 ,, ")
    assert s.cors_origin_list == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        PROD,
    ]


def test_production_origin_not_duplicated():
    s = _settings(f"{PROD}/,{PROD}")
    assert s.cors_origin_list == [PROD]