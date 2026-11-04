"""Rule-based extraction of written (descriptive) questions from PDF text. No AI and no network.

Questions are numbered; sub-questions such as (a), (b) or (i), (ii) are kept as parts.
Marks are read only when they are explicitly printed. Nothing is ever converted into an MCQ."""
import re

from app.ingestion import mcq_parser

MIN_TEXT = 15
MAX_TEXT = 3000

# "(a) text", "a) text", "i. text", "(ii) text"
_PART = re.compile(r"^\s*(?:\((?P<a>[a-hA-H]|[ivxIVX]{1,4})\)|(?P<b>[a-h]|[ivx]{1,4})[\.\)])\s+(?P<text>\S.*)$")

# "[10]", "(5 marks)", "7 marks", "Marks: 5"
_MARKS = [
    re.compile(r"\[\s*(\d{1,3})\s*(?:marks?|m)?\s*\]", re.IGNORECASE),
    re.compile(r"\(\s*(\d{1,3})\s*(?:marks?|m)\s*\)", re.IGNORECASE),
    re.compile(r"(?<![\d\.])(\d{1,3})\s*marks?\b", re.IGNORECASE),
    re.compile(r"\bmarks?\s*[:=\-]\s*(\d{1,3})\b", re.IGNORECASE),
]


def _squash(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(text).lower())


def _marks(text: str) -> int | None:
    for pattern in _MARKS:
        match = pattern.search(text)
        if match:
            value = int(match.group(1))
            return value if 0 < value <= 100 else None
    return None


def compose_text(stem: str, parts: list[dict]) -> str:
    """The text shown to students: the stem, then each part as its own paragraph."""
    pieces = [stem.strip()] if stem and stem.strip() else []
    pieces += [f"({p['label']}) {p['text'].strip()}" for p in parts if p.get("text", "").strip()]
    return "\n\n".join(pieces)


def _parse_block(block: mcq_parser.Block) -> dict:
    lines = [block.first] + block.rest
    stem_lines: list[str] = []
    parts: list[dict] = []
    current = None
    for text in lines:
        match = _PART.match(text)
        if match:
            current = {"label": (match.group("a") or match.group("b")).lower(), "lines": [match.group("text")]}
            parts.append(current)
        elif current is not None:
            current["lines"].append(text)
        else:
            stem_lines.append(text)

    stem = mcq_parser.join_lines(stem_lines)
    out_parts = []
    for part in parts:
        text = mcq_parser.join_lines(part["lines"])
        out_parts.append({"label": part["label"], "text": text, "marks": _marks(text)})

    flags: list[str] = []
    if mcq_parser.option_chain_length(lines, uppercase_only=True) >= 3:
        flags.append("looks_like_mcq")
    if not block.ended:
        flags.append("possibly_incomplete")
    return {"stem": stem, "parts": out_parts, "pdf_marks": _marks(stem), "parser_flags": flags}


def parse_written(main: str, continuation: str, topic_labels=(), previous_number: int | None = None) -> dict:
    """Extracts the written questions that start in `main`."""
    scan = mcq_parser.scan_blocks(main, continuation, topic_labels)
    questions: list[dict] = []
    last_number = previous_number

    for block in scan.blocks:
        item = _parse_block(block)
        number = int(block.number)
        flags = list(item["parser_flags"])
        if last_number is not None and number != last_number + 1 and number != 1:
            flags.append("check_numbering")
        last_number = number
        item.update(number=block.number, heading=block.heading, parser_flags=flags)
        questions.append(item)

    return {"questions": questions, "last_heading": scan.last_heading, "last_number": last_number}


def validate_written(item: dict, main: str, continuation: str) -> tuple[dict | None, str | None]:
    """Returns (checked question, None) or (None, the reason it was rejected). The text must really be in the PDF."""
    stem = (item.get("stem") or "").strip()
    parts = [p for p in item.get("parts", []) if (p.get("text") or "").strip()]
    text = compose_text(stem, parts)
    if not MIN_TEXT <= len(text) <= MAX_TEXT:
        return None, "bad_question"

    full_s = _squash(main + "\n" + continuation)
    for piece in ([stem] if stem else []) + [p["text"] for p in parts]:
        squashed = _squash(piece)
        if squashed and squashed not in full_s:
            return None, "not_in_source"

    return (
        {
            "number": item.get("number"),
            "stem": stem,
            "parts": parts,
            "text": text,
            "pdf_marks": item.get("pdf_marks"),
            "flags": list(item.get("parser_flags", [])),
        },
        None,
    )