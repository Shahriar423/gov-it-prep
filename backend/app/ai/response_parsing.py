"""Turns raw provider responses into text/JSON. No network code here, so it is easy to test."""
import json
import re

from app.ai.errors import AiResponseError

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)
_SECONDS = re.compile(r"([0-9]+(?:\.[0-9]+)?)\s*s?")
_BLOCKED = {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"}


def parse_json_text(text: str) -> dict:
    cleaned = _FENCE.sub("", text.strip()).strip()
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        raise AiResponseError("The model's answer was not valid JSON.")
    if not isinstance(value, dict):
        raise AiResponseError("The model's answer was not a JSON object.")
    return value


# ---------------------------------------------------------------- Gemini
def extract_gemini_text(data: dict) -> str:
    feedback = data.get("promptFeedback") or {}
    if feedback.get("blockReason"):
        raise AiResponseError(f"The request was blocked by the provider ({feedback['blockReason']}).")

    candidates = data.get("candidates") or []
    if not candidates:
        raise AiResponseError("The model returned no answer.")

    candidate = candidates[0]
    finish = candidate.get("finishReason")
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(
        p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought")
    )

    if finish == "MAX_TOKENS":
        raise AiResponseError(
            "The answer was cut off because the model ran out of output tokens. "
            "This chunk will be retried on the next run."
        )
    if finish in _BLOCKED and not text.strip():
        raise AiResponseError(f"The answer was blocked by the provider ({finish}).")
    if not text.strip():
        raise AiResponseError("The model returned an empty answer.")
    return text


def _parse_seconds(value) -> float | None:
    match = _SECONDS.fullmatch(str(value).strip())
    return float(match.group(1)) if match else None


def gemini_error_info(body) -> tuple[str, float | None, bool]:
    """Returns (message, retry_after_seconds, looks_like_a_daily_limit)."""
    error = body.get("error") if isinstance(body, dict) else None
    error = error if isinstance(error, dict) else {}
    message = str(error.get("message") or "").strip()

    retry_after = None
    for detail in error.get("details") or []:
        if isinstance(detail, dict) and "retryDelay" in detail:
            retry_after = _parse_seconds(detail["retryDelay"])

    blob = json.dumps(body).lower() if body else ""
    daily = "perday" in blob or "per day" in blob or "daily" in blob
    return message, retry_after, daily


# ---------------------------------------------------------------- OpenAI-compatible
def extract_openai_text(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise AiResponseError("The model returned no answer.")

    choice = choices[0]
    message = choice.get("message") or {}
    if message.get("refusal"):
        raise AiResponseError("The model refused to answer this request.")
    if choice.get("finish_reason") == "length":
        raise AiResponseError("The answer was cut off because the model ran out of output tokens.")

    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise AiResponseError("The model returned an empty answer.")
    return content


def openai_error_info(body) -> tuple[str, str]:
    """Returns (message, error code)."""
    error = body.get("error") if isinstance(body, dict) else None
    error = error if isinstance(error, dict) else {}
    return str(error.get("message") or "").strip(), str(error.get("code") or error.get("type") or "")