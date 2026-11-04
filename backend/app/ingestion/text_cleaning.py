"""Pure text helpers: cleaning page text and measuring how readable it is.
No PDF or database code in this file, so it can be tested on its own."""
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass

_LIGATURES = {
    ch: unicodedata.normalize("NFKC", ch)
    for ch in "\ufb00\ufb01\ufb02\ufb03\ufb04\ufb05\ufb06"
}
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0e-\x1f\x7f]")
_HYPHEN_BREAK = re.compile(r"([A-Za-z])-\n[ ]*([a-z])")
_MANY_BLANKS = re.compile(r"\n{3,}")
_PAGE_NUMBER = re.compile(r"^\s*(?:page\s*)?\d{1,4}(?:\s*(?:of|/)\s*\d{1,4})?\s*$", re.IGNORECASE)
_WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

_STOPWORDS = frozenset(
    "the of and to in is a that for it as with was on are by be this which or from at an not "
    "have has can used its their these they will each also more other than into one all when "
    "where what how".split()
)


# ---------------------------------------------------------------- cleaning
def clean_page_text(raw: str) -> str:
    """Normalises one page of extracted text. Keeps line breaks and indentation
    (needed for code, tables and numbered questions)."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    for ligature, replacement in _LIGATURES.items():
        text = text.replace(ligature, replacement)
    text = (
        text.replace("\u00a0", " ")
        .replace("\u00ad", "")
        .replace("\u200b", "")
        .replace("\ufeff", "")
        .replace("\t", "    ")
        .replace("\f", "\n")
    )
    text = _CONTROL.sub("", text)
    # "net-\nwork" -> "network" (a word split across two lines)
    text = _HYPHEN_BREAK.sub(r"\1\2", text)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = _MANY_BLANKS.sub("\n\n", text)
    return text.strip("\n")


# A running header often ends or starts with the page number: "Networking Notes | 12".
# Only a number joined by a separator (or the word "page") is ignored. A heading such as
# "Question 3" keeps its number, so numbered headings are never mistaken for running headers.
_SEP = r"[|\-\u2013\u2014\u2022\u00b7]"
_LEADING_NUMBER = re.compile(rf"^(?:page\s*)?\d{{1,4}}\s*{_SEP}\s*", re.IGNORECASE)
_TRAILING_NUMBER = re.compile(
    rf"(?:\s*{_SEP}\s*(?:page\s*)?|\s+page\s*)\d{{1,4}}(?:\s*(?:of|/)\s*\d{{1,4}})?$",
    re.IGNORECASE,
)


def _signature(line: str) -> str:
    text = line.strip().lower()
    text = _LEADING_NUMBER.sub("", text)
    text = _TRAILING_NUMBER.sub("", text)
    return text.strip()


def _is_junk(line: str, repeated: set[str]) -> bool:
    stripped = line.strip()
    if _PAGE_NUMBER.match(stripped):
        return True
    return len(stripped) <= 80 and _signature(stripped) in repeated


def strip_repeated_edges(
    pages: list[str], min_pages: int = 4, edge_lines: int = 2, share: float = 0.6
) -> list[str]:
    """Removes running headers/footers and bare page numbers from the top and bottom of pages."""
    repeated: set[str] = set()
    if len(pages) >= min_pages:
        counts: Counter = Counter()
        for page in pages:
            lines = [ln for ln in page.split("\n") if ln.strip()]
            edges = lines[:edge_lines] + lines[-edge_lines:]
            counts.update({_signature(ln) for ln in edges if len(ln.strip()) <= 80})
        repeated = {sig for sig, n in counts.items() if sig and n / len(pages) >= share}

    cleaned = []
    for page in pages:
        lines = page.split("\n")

        for _ in range(edge_lines):  # top of the page
            idx = next((i for i, ln in enumerate(lines) if ln.strip()), None)
            if idx is None or not _is_junk(lines[idx], repeated):
                break
            del lines[idx]

        for _ in range(edge_lines):  # bottom of the page
            idx = next((i for i in range(len(lines) - 1, -1, -1) if lines[i].strip()), None)
            if idx is None or not _is_junk(lines[idx], repeated):
                break
            del lines[idx]

        text = _MANY_BLANKS.sub("\n\n", "\n".join(lines)).strip("\n")
        cleaned.append(text)
    return cleaned


# ---------------------------------------------------------------- measuring
@dataclass
class TextStats:
    chars: int           # non-whitespace characters
    letters: int
    ascii_letters: int
    bad_chars: int       # replacement characters and private-use characters (broken font mapping)
    words: int
    stopwords: int

    @property
    def ascii_letter_ratio(self) -> float:
        return self.ascii_letters / self.letters if self.letters else 0.0

    @property
    def bad_char_ratio(self) -> float:
        return self.bad_chars / self.chars if self.chars else 0.0

    @property
    def stopword_ratio(self) -> float:
        return self.stopwords / self.words if self.words else 0.0


def count_non_space(text: str) -> int:
    return sum(1 for ch in text if not ch.isspace())


def analyze_text(text: str) -> TextStats:
    chars = letters = ascii_letters = bad = 0
    for ch in text:
        if ch.isspace():
            continue
        chars += 1
        if ch.isalpha():
            letters += 1
            if ch.isascii():
                ascii_letters += 1
        elif ch == "\ufffd" or "\ue000" <= ch <= "\uf8ff":
            bad += 1

    words = _WORD.findall(text)
    stopwords = sum(1 for w in words if w.lower() in _STOPWORDS)
    return TextStats(chars, letters, ascii_letters, bad, len(words), stopwords)