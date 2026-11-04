"""Loads prompt templates from app/ai/prompts/*.txt and fills in {{placeholders}}."""
import re
from functools import lru_cache
from pathlib import Path

_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")
_DIR = Path(__file__).parent / "prompts"


@lru_cache(maxsize=None)
def _load(name: str) -> str:
    return (_DIR / f"{name}.txt").read_text(encoding="utf-8")


def render_prompt(name: str, **values: object) -> str:
    template = _load(name)
    needed = set(_PLACEHOLDER.findall(template))
    missing = needed - set(values)
    if missing:
        raise ValueError(f"Prompt '{name}' needs values for: {', '.join(sorted(missing))}")
    # One pass, so text inserted into a placeholder is never scanned for placeholders again
    return _PLACEHOLDER.sub(lambda m: str(values[m.group(1)]), template)