"""The one place the rest of the app talks to an AI provider through.
It checks the configuration, enforces the limits, retries temporary failures, and never logs the key."""
import asyncio
import time
from dataclasses import dataclass, field

from app.ai import usage
from app.ai.errors import (
    AiError,
    AiNotConfigured,
    AiQuotaError,
    AiRateLimited,
    AiTransientError,
)
from app.ai.providers import GeminiProvider, OpenAICompatibleProvider
from app.ai.rate_limit import AsyncRateLimiter
from app.ai.schemas import TEST_SCHEMA
from app.core.config import settings

SUPPORTED = ("gemini", "openai", "openai_compatible")
MAX_RETRIES = 3
MAX_RATE_LIMIT_WAIT = 90.0  # a longer wait than this is treated as "quota used up"

_limiter = AsyncRateLimiter(settings.ai_max_requests_per_minute)


@dataclass
class AiStatus:
    configured: bool
    provider: str
    model: str
    missing: list[str] = field(default_factory=list)
    message: str = ""


def get_status() -> AiStatus:
    provider = settings.ai_provider.strip().lower()
    model = settings.ai_model.strip()
    missing: list[str] = []

    if provider not in SUPPORTED:
        return AiStatus(
            False,
            provider or "(not set)",
            model,
            ["AI_PROVIDER"],
            f"AI_PROVIDER must be one of: {', '.join(SUPPORTED)}.",
        )
    if not settings.ai_api_key.strip():
        missing.append("AI_API_KEY")
    if not model:
        missing.append("AI_MODEL")
    if provider == "openai_compatible" and not settings.ai_base_url.strip():
        missing.append("AI_BASE_URL")

    if missing:
        return AiStatus(
            False,
            provider,
            model,
            missing,
            f"AI generation is disabled because {', '.join(missing)} "
            f"{'is' if len(missing) == 1 else 'are'} not set in backend/.env.",
        )
    return AiStatus(True, provider, model, [], "")


def _build_provider(status: AiStatus):
    key = settings.ai_api_key.strip()
    timeout = float(settings.ai_timeout_seconds)
    base_url = settings.ai_base_url.strip()
    if status.provider == "gemini":
        return GeminiProvider(key, status.model, base_url, timeout)
    return OpenAICompatibleProvider(key, status.model, base_url, timeout)


async def generate_json(prompt: str, schema: dict, max_output_tokens: int = 4096) -> tuple[dict, dict]:
    """Returns (answer as a dict, {"attempts", "provider", "model"}). Raises an AiError subclass."""
    status = get_status()
    if not status.configured:
        raise AiNotConfigured(status.message)

    provider = _build_provider(status)
    attempts = rate_limited = transient = 0

    while True:
        await _limiter.acquire()
        await usage.reserve_request(settings.ai_max_requests_per_day)  # may raise AiQuotaError
        attempts += 1
        try:
            data = await provider.generate_json(prompt, schema, max_output_tokens)
            return data, {"attempts": attempts, "provider": status.provider, "model": status.model}
        except AiRateLimited as error:
            rate_limited += 1
            if error.daily or rate_limited > MAX_RETRIES or error.retry_after > MAX_RATE_LIMIT_WAIT:
                raise AiQuotaError(
                    f"{error.message} The provider's quota seems to be used up for now. "
                    "Resume later (free tiers reset daily)."
                )
            await asyncio.sleep(max(error.retry_after, 2.0))
        except AiTransientError:
            transient += 1
            if transient > MAX_RETRIES:
                raise
            await asyncio.sleep(2 ** (transient + 1))  # 4, 8, 16 seconds


async def test_connection() -> dict:
    """One small real request, so the admin can check the key and model before a long job."""
    status = get_status()
    base = {"provider": status.provider, "model": status.model, "latency_ms": None}
    if not status.configured:
        return {**base, "ok": False, "message": status.message}

    started = time.monotonic()
    try:
        data, _ = await generate_json('Return the JSON object {"ok": true}.', TEST_SCHEMA, 2048)
    except AiError as error:
        return {**base, "ok": False, "message": error.message}

    latency = int((time.monotonic() - started) * 1000)
    if data.get("ok") is True:
        return {**base, "ok": True, "message": "The connection works.", "latency_ms": latency}
    return {
        **base,
        "ok": False,
        "message": "The provider answered, but not in the expected format. Try a different model.",
        "latency_ms": latency,
    }