"""Adapters for the supported AI providers. Each one sends a prompt, forces a JSON answer that
follows a schema, and returns it as a dict. Nothing here is specific to this project's questions."""
import httpx

from app.ai.errors import (
    AiConfigError,
    AiQuotaError,
    AiRateLimited,
    AiResponseError,
    AiTransientError,
)
from app.ai.response_parsing import (
    extract_gemini_text,
    extract_openai_text,
    gemini_error_info,
    openai_error_info,
    parse_json_text,
)
from app.ai.schemas import strictify

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
OPENAI_BASE_URL = "https://api.openai.com/v1"


def _body(response: httpx.Response):
    try:
        return response.json()
    except ValueError:
        return None


def _retry_after_header(response: httpx.Response) -> float | None:
    try:
        return float(response.headers.get("retry-after", ""))
    except ValueError:
        return None


async def _post(url: str, headers: dict, payload: dict, timeout: float, secret: str) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
            return await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise AiTransientError("The AI provider did not answer in time.")
    except httpx.HTTPError as error:
        # Never include the request details: they could contain the API key
        raise AiTransientError(f"Could not reach the AI provider ({type(error).__name__}).")


def _safe(message: str, secret: str) -> str:
    text = message.replace(secret, "***") if secret else message
    return text[:300] or "no details"


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or GEMINI_BASE_URL).rstrip("/")
        self.timeout = timeout

    async def generate_json(self, prompt: str, schema: dict, max_output_tokens: int) -> dict:
        url = f"{self.base_url}/models/{self.model}:generateContent"
        # The key travels in a header, never in the URL, so it cannot leak into logs
        headers = {"x-goog-api-key": self.api_key, "Content-Type": "application/json"}
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": schema,
                "maxOutputTokens": max_output_tokens,
            },
        }
        response = await _post(url, headers, payload, self.timeout, self.api_key)

        if response.status_code == 200:
            body = _body(response)
            if not isinstance(body, dict):
                raise AiResponseError("The provider's answer was not valid JSON.")
            return parse_json_text(extract_gemini_text(body))

        message, retry_after, daily = gemini_error_info(_body(response))
        message = _safe(message, self.api_key)
        status = response.status_code

        if status == 429:
            retry_after = retry_after if retry_after is not None else _retry_after_header(response)
            raise AiRateLimited(
                f"The provider's rate limit or quota was reached ({message}).",
                retry_after=retry_after or 20.0,
                daily=daily,
            )
        if status >= 500:
            raise AiTransientError(f"The AI provider had a problem (HTTP {status}).")
        if status in (401, 403):
            raise AiConfigError(
                f"The API key was rejected or is not allowed to use this model ({message}). "
                "Check AI_API_KEY and that the Gemini API is available for your account and country."
            )
        if status == 404:
            raise AiConfigError(f"The model '{self.model}' was not found. Check AI_MODEL. ({message})")
        raise AiConfigError(f"The provider rejected the request (HTTP {status}): {message}")


class OpenAICompatibleProvider:
    name = "openai"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float):
        self.api_key = api_key
        self.model = model
        self.base_url = (base_url or OPENAI_BASE_URL).rstrip("/")
        self.timeout = timeout

    async def generate_json(self, prompt: str, schema: dict, max_output_tokens: int) -> dict:
        url = f"{self.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        # No temperature or token limit is sent: some models reject them
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "result", "strict": True, "schema": strictify(schema)},
            },
        }
        response = await _post(url, headers, payload, self.timeout, self.api_key)

        if response.status_code == 200:
            body = _body(response)
            if not isinstance(body, dict):
                raise AiResponseError("The provider's answer was not valid JSON.")
            return parse_json_text(extract_openai_text(body))

        message, code = openai_error_info(_body(response))
        message = _safe(message, self.api_key)
        status = response.status_code

        if status == 429:
            if code == "insufficient_quota":
                raise AiQuotaError(f"The account has no remaining quota or credit ({message}).")
            raise AiRateLimited(
                f"The provider's rate limit was reached ({message}).",
                retry_after=_retry_after_header(response) or 20.0,
            )
        if status >= 500:
            raise AiTransientError(f"The AI provider had a problem (HTTP {status}).")
        if status in (401, 403):
            raise AiConfigError(f"The API key was rejected or is not allowed ({message}). Check AI_API_KEY.")
        if status == 404:
            raise AiConfigError(f"The model or address was not found ({message}). Check AI_MODEL and AI_BASE_URL.")
        raise AiConfigError(f"The provider rejected the request (HTTP {status}): {message}")