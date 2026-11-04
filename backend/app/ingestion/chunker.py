"""Splits cleaned page text into chunks of a size suitable for question generation.

Chunks are size-based and keep the original line layout. Each chunk records the first
and last page it covers, so every generated question can later be traced to its pages."""
from dataclasses import dataclass

TARGET_CHARS = 3000   # a chunk is closed at the next sentence/line boundary after this size
MAX_CHARS = 4500      # a chunk is never allowed to grow beyond this
MIN_TAIL_CHARS = 400  # a final chunk smaller than this is merged into the previous one


@dataclass
class Chunk:
    index: int
    page_start: int
    page_end: int
    text: str


def _split_long_line(line: str, limit: int) -> list[str]:
    parts = []
    while len(line) > limit:
        cut = line.rfind(" ", 0, limit)
        if cut < limit // 2:  # no sensible space: cut hard
            cut = limit
        parts.append(line[:cut].rstrip())
        line = line[cut:].lstrip()
    parts.append(line)
    return parts


def _is_boundary(line: str, next_line: str | None) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if next_line is not None and not next_line.strip():
        return True
    return stripped.endswith((".", "?", "!", ":"))


def chunk_pages(pages: list[tuple[int, str]]) -> list[Chunk]:
    """pages: [(page_number, cleaned_text), ...] in page order. Empty pages are ignored."""
    units: list[tuple[int, str]] = []
    for number, text in pages:
        if not text.strip():
            continue
        for line in text.split("\n"):
            for piece in _split_long_line(line, MAX_CHARS):
                units.append((number, piece))

    chunks: list[Chunk] = []
    buffer: list[tuple[int, str]] = []
    size = 0

    def flush() -> None:
        nonlocal buffer, size
        content = [(p, ln) for p, ln in buffer if ln.strip()]
        if content:
            first = next(i for i, (_, ln) in enumerate(buffer) if ln.strip())
            last = max(i for i, (_, ln) in enumerate(buffer) if ln.strip())
            text = "\n".join(ln for _, ln in buffer[first : last + 1])
            chunks.append(
                Chunk(0, min(p for p, _ in content), max(p for p, _ in content), text)
            )
        buffer, size = [], 0

    for i, (page, line) in enumerate(units):
        cost = len(line) + 1
        if buffer and size + cost > MAX_CHARS:
            flush()
        buffer.append((page, line))
        size += cost
        next_line = units[i + 1][1] if i + 1 < len(units) else None
        if size >= TARGET_CHARS and _is_boundary(line, next_line):
            flush()
    flush()

    # Do not leave a tiny fragment at the end
    if len(chunks) > 1 and len(chunks[-1].text) < MIN_TAIL_CHARS:
        tail = chunks.pop()
        previous = chunks[-1]
        previous.text = previous.text + "\n" + tail.text
        previous.page_end = max(previous.page_end, tail.page_end)

    for index, chunk in enumerate(chunks):
        chunk.index = index
    return chunks