from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import validate_password


def test_password_hash_is_not_plain_and_verifies():
    hashed = hash_password("Correct123")
    assert hashed != "Correct123"
    assert hashed.startswith("$2")
    assert verify_password("Correct123", hashed) is True


def test_wrong_password_fails():
    hashed = hash_password("Correct123")
    assert verify_password("Wrong1234", hashed) is False


def test_same_password_gives_different_hashes():
    assert hash_password("Correct123") != hash_password("Correct123")


def test_token_round_trip():
    token = create_access_token("abc123")
    assert decode_access_token(token) == "abc123"


def test_token_signed_with_other_key_is_rejected():
    forged = jwt.encode(
        {"sub": "abc123", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "x" * 40,
        algorithm=settings.jwt_algorithm,
    )
    assert decode_access_token(forged) is None


def test_expired_token_is_rejected():
    expired = jwt.encode(
        {"sub": "abc123", "exp": datetime.now(timezone.utc) - timedelta(seconds=30)},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    assert decode_access_token(expired) is None


def test_garbage_token_is_rejected():
    assert decode_access_token("not-a-token") is None


@pytest.mark.parametrize(
    "bad",
    ["short1", "onlyletters", "12345678", "a1" * 40],
)
def test_weak_or_invalid_passwords_rejected(bad):
    with pytest.raises(ValueError):
        validate_password(bad)


def test_good_password_accepted():
    assert validate_password("Study2026ok") == "Study2026ok"
