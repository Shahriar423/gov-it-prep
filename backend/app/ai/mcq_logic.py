"""Rules that decide whether an AI-written MCQ is acceptable. Pure functions, no network or database."""
import hashlib
import random
import re

LETTERS = "ABCD"
DIFFICULTIES = ("easy", "medium", "hard")
DUPLICATE_THRESHOLD = 0.8

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_ELLIPSIS = re.compile(r"\.{3,}|\u2026")
_WORD = re.compile(r"[a-z0-9]{3,}")

# The student never sees the source text, so a question must not point to it.
# ("the text" alone is NOT blocked: "text field" and "text editor" are normal IT words.)
_PASSAGE_REFERENCE = re.compile(
    r"\b(?:the|this|above)\s+(?:passage|excerpt|paragraph|extract|author)\b"
    r"|\baccording to (?:the|this) (?:passage|text|notes?|document|author|chapter|excerpt|extract|material)\b"
    r"|\b(?:as )?(?:stated|mentioned|described|discussed|given) in (?:the|this) "
    r"(?:passage|text|notes?|document|chapter)\b",
    re.IGNORECASE,
)

# Options whose meaning depends on their position or on the other options
_RELATIVE_OPTION = re.compile(
    r"\b(?:all|none)\s+of\s+(?:the\s+)?(?:above|these)\b"
    r"|\bboth\s+\(?[a-d]\)?\s*(?:and|&)\s*\(?[a-d]\)?\b"
    r"|\bneither\s+\(?[a-d]\)?\s*nor\s*\(?[a-d]\)?\b",
    re.IGNORECASE,
)


def squash(text: str) -> str:
    """Lower-case letters and digits only, so quotes, spacing and punctuation never matter."""
    return _NON_ALNUM.sub("", str(text).lower())


def _clean(value) -> str:
    return re.sub(r"\s+", " ", value).strip() if isinstance(value, str) else ""


# ---------------------------------------------------------------- evidence
def evidence_in_passage(evidence: str, passage: str) -> bool:
    """True if the quoted evidence really appears in the passage.
    The model may write "..." to skip text, so each piece is checked on its own."""
    haystack = squash(passage)
    pieces = [squash(p) for p in _ELLIPSIS.split(evidence)]
    pieces = [p for p in pieces if len(p) >= 12]
    if not pieces:
        return False
    return all(p in haystack for p in pieces)


# ---------------------------------------------------------------- checking one candidate
def validate_candidate(item, passage: str) -> tuple[dict | None, str | None]:
    """Returns (clean candidate, None) or (None, reason it was rejected)."""
    if not isinstance(item, dict):
        return None, "malformed"

    question = _clean(item.get("question"))
    if not 15 <= len(question) <= 1000:
        return None, "bad_question"

    raw_options = item.get("options")
    if not isinstance(raw_options, list) or len(raw_options) != 4:
        return None, "bad_options"
    options = [_clean(o) for o in raw_options]
    if any(not 1 <= len(o) <= 300 for o in options):
        return None, "bad_options"
    if len({squash(o) for o in options}) != 4 or any(not squash(o) for o in options):
        return None, "bad_options"
    if any(_RELATIVE_OPTION.search(o) for o in options):
        return None, "bad_options"

    letter = item.get("correct_letter")
    if letter not in tuple(LETTERS):
        return None, "bad_answer"

    if _PASSAGE_REFERENCE.search(question) or any(_PASSAGE_REFERENCE.search(o) for o in options):
        return None, "refers_to_passage"

    evidence = _clean(item.get("evidence"))
    if not evidence:
        return None, "no_evidence"
    if not evidence_in_passage(evidence, passage):
        return None, "evidence_not_in_passage"

    explanation = _clean(item.get("explanation"))
    if not explanation:
        return None, "no_explanation"

    difficulty = item.get("difficulty")
    return (
        {
            "text": question,
            "options": options,
            "correct_index": LETTERS.index(letter),
            "explanation": explanation[:1500],
            "evidence": evidence[:600],
            "difficulty": difficulty if difficulty in DIFFICULTIES else "medium",
        },
        None,
    )


# ---------------------------------------------------------------- the independent check
def format_for_verification(candidates: list[dict]) -> str:
    """The checker sees the question and options only: never the answer the writer chose."""
    blocks = []
    for number, c in enumerate(candidates, start=1):
        lines = [f"{number}. {c['text']}"]
        lines += [f"   {LETTERS[i]}) {option}" for i, option in enumerate(c["options"])]
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def parse_verdicts(data) -> dict[int, dict]:
    verdicts: dict[int, dict] = {}
    results = data.get("results") if isinstance(data, dict) else None
    for entry in results if isinstance(results, list) else []:
        if not isinstance(entry, dict):
            continue
        number = entry.get("number")
        if isinstance(number, int) and number not in verdicts:
            verdicts[number] = entry
    return verdicts


def judge(candidate: dict, verdict: dict | None) -> tuple[bool, str | None]:
    """Accepts a question only if the independent check clearly agrees with the writer."""
    if verdict is None:
        return False, "no_verdict"
    if verdict.get("ambiguous") is not False:
        return False, "ambiguous"
    if verdict.get("answerable_from_passage") is not True:
        return False, "not_answerable"
    if verdict.get("answer_letter") != LETTERS[candidate["correct_index"]]:
        return False, "verification_disagreed"
    return True, None


# ---------------------------------------------------------------- duplicates and shuffling
def question_hash(text: str) -> str:
    return hashlib.sha256(squash(text).encode("utf-8")).hexdigest()


def token_set(text: str) -> frozenset[str]:
    return frozenset(_WORD.findall(text.lower()))


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def is_near_duplicate(tokens: frozenset[str], others, threshold: float = DUPLICATE_THRESHOLD) -> bool:
    return any(jaccard(tokens, other) >= threshold for other in others)


def shuffle_options(options: list[str], correct_index: int, rng: random.Random) -> tuple[list[str], int]:
    """Models like to put the answer in the same spot. Shuffle, and keep track of the answer."""
    order = list(range(len(options)))
    rng.shuffle(order)
    return [options[i] for i in order], order.index(correct_index)