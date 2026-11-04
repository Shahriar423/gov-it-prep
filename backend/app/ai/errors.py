"""Errors raised by the AI layer. The message of each one is safe to show to an admin."""


class AiError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class AiNotConfigured(AiError):
    """The provider, key or model is not set in backend/.env."""


class AiConfigError(AiError):
    """The provider rejected the key, the model name or the request. Fix the configuration."""


class AiQuotaError(AiError):
    """The daily limit or the provider's quota is used up. Try again later."""


class AiRateLimited(AiError):
    """Internal: a temporary rate limit. The client waits and retries; it never escapes it."""

    def __init__(self, message: str, retry_after: float = 0.0, daily: bool = False):
        super().__init__(message)
        self.retry_after = retry_after
        self.daily = daily


class AiTransientError(AiError):
    """A timeout, network problem or provider outage."""


class AiResponseError(AiError):
    """The provider answered, but the answer is unusable (blocked, cut off, not valid JSON)."""