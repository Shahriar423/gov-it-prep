"""Rules for checking previous-year questions extracted from PDF text. Pure functions: no network, no database.

Principle: the extractor may only COPY what is printed in the PDF. Everything it returns is checked against
the PDF text. Whatever cannot be verified is dropped or flagged for an admin. Answers are never guessed."""
import hashlib
import re

from app.ai.mcq_logic import jaccard, question_hash, squash, token_set

LETTERS = "ABCDEF"
MIN_STEM = 8
MAX_STEM = 2000
MAX_OPTION = 300
MIN_KEY_ENTRIES = 5      # a real answer key lists many answers; fewer is probably a stray match
ANSWER_SLACK = 60        # a printed answer must follow its question's options closely
SIMILAR_THRESHOLD = 0.8

_NUMBER = re.compile(r"\d{1,4}")
_SEP = r"[\.\)\-\u2013\u2014:=\]]*"


def clean(value) -> str:
    return re.sub(r"\s+", " ", value).strip() if isinstance(value, str) else ""


def parse_number(raw) -> str | None:
    """'Q17' -> '17', '017' -> '17', 'none' -> None."""
    match = _NUMBER.search(str(raw or ""))
    if not match:
        return None
    return match.group(0).lstrip("0") or "0"


def fingerprint(stem: str, options: list[str]) -> str:
    """Identifies a question inside one PDF. Spacing and punctuation never change it."""
    raw = squash(stem) + "|" + "|".join(squash(o) for o in options)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- answers
def answer_supported(
    quote: str, index: int, options: list[str], full_s: str, stem_pos: int, stem_s: str
) -> bool:
    """True only if the quoted printed answer names the chosen option AND is printed right after
    this question's options."""
    quote_s = squash(quote)
    if len(quote_s) < 2:
        return False

    letter = LETTERS[index]
    names_letter = re.search(rf"(?<![A-Za-z]){letter}(?![A-Za-z])", quote, re.IGNORECASE) is not None
    option_s = squash(options[index])
    names_option = len(option_s) >= 3 and option_s in quote_s
    if not (names_letter or names_option):
        return False

    # Find where this question's options end in the text
    end = stem_pos + len(stem_s)
    for option in options:
        option_squashed = squash(option)
        if not option_squashed:
            continue
        found = full_s.find(option_squashed, end)
        if found >= 0:
            end = found + len(option_squashed)

    start = full_s.find(quote_s, end)
    return start >= 0 and start - end <= ANSWER_SLACK


# ---------------------------------------------------------------- checking one extracted item
def validate_extracted(item, main: str, continuation: str) -> tuple[dict | None, str | None]:
    """Returns (checked question, None) or (None, reason it was rejected).
    The question text must really be in the PDF and must START in the main text."""
    if not isinstance(item, dict):
        return None, "malformed"

    stem = clean(item.get("question"))
    if len(stem) < MIN_STEM or len(stem) > MAX_STEM:
        return None, "bad_question"

    raw_options = item.get("options")
    if not isinstance(raw_options, list):
        return None, "malformed"
    options = [clean(o) for o in raw_options if isinstance(o, str)]
    options = [o for o in options if o]
    if not options:
        return None, "no_options"
    if len(options) > 6:
        return None, "too_many_options"

    main_s = squash(main)
    full_s = squash(main + "\n" + continuation)
    stem_s = squash(stem)
    if len(stem_s) < 6:
        return None, "bad_question"

    position = full_s.find(stem_s)
    if position < 0:
        return None, "not_in_source"
    if position >= len(main_s):
        return None, "starts_in_continuation"

    flags: list[str] = []
    if item.get("complete") is not True or len(options) < 4:
        flags.append("incomplete")
    elif len(options) != 4:
        flags.append("unusual_option_count")
    if len({squash(o) for o in options}) != len(options):
        flags.append("duplicate_options")
    if any(len(o) > MAX_OPTION for o in options):
        flags.append("long_option")
    if any(squash(o) and squash(o) not in full_s for o in options):
        flags.append("option_text_differs")
    for flag in item.get("parser_flags") or []:
        if flag not in flags:
            flags.append(flag)

    # The answer is accepted only when the printed quote is verified in the text
    correct_index = None
    answer_status = "missing"
    answer_quote = ""
    letter = item.get("printed_answer")
    if letter in tuple(LETTERS):
        index = LETTERS.index(letter)
        quote = clean(item.get("answer_quote"))
        if index < len(options) and answer_supported(quote, index, options, full_s, position, stem_s):
            correct_index, answer_status, answer_quote = index, "printed", quote[:200]
        else:
            flags.append("answer_unverified")

    # An explanation is kept only if it is printed in the PDF
    explanation = clean(item.get("explanation"))
    if explanation:
        explanation_s = squash(explanation)
        found = full_s.find(explanation_s, position) if len(explanation_s) >= 8 else -1
        if found < 0:
            explanation = ""
            flags.append("explanation_unverified")
        else:
            explanation = explanation[:3000]

    return (
        {
            "number": parse_number(item.get("number")),
            "text": stem,
            "options": options,
            "correct_index": correct_index,
            "answer_status": answer_status,
            "answer_quote": answer_quote,
            "explanation": explanation,
            "topic": clean(item.get("topic")),
            "flags": flags,
        },
        None,
    )


# ---------------------------------------------------------------- answer keys
def key_entry_present(number: str, letter: str, text: str) -> bool:
    pattern = rf"(?<!\d){re.escape(number)}\s*{_SEP}\s*[\(\[]?\s*{letter}\s*[\)\]]?(?![A-Za-z0-9])"
    return re.search(pattern, text, re.IGNORECASE) is not None


def clean_key_entries(entries, text: str) -> list[tuple[str, str]]:
    """Keeps only answer-key entries that really appear in the text. Contradictory entries are dropped,
    and a handful of stray matches is not treated as a key."""
    if not isinstance(entries, list):
        return []

    letters_by_number: dict[str, set[str]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        number = parse_number(entry.get("number"))
        letter = entry.get("letter")
        if number is None or letter not in tuple(LETTERS):
            continue
        letters_by_number.setdefault(number, set()).add(letter)

    verified = []
    for number, letters in letters_by_number.items():
        if len(letters) != 1:
            continue
        letter = next(iter(letters))
        if key_entry_present(number, letter, text):
            verified.append((number, letter))
    return verified if len(verified) >= MIN_KEY_ENTRIES else []


def build_key_map(lists) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for pairs in lists:
        for number, letter in pairs:
            result.setdefault(number, set()).add(letter)
    return result


def plan_key_answers(questions: list[dict], numbers_count: dict, key_map: dict) -> tuple[list, list]:
    """Decides which unanswered questions get an answer from the key.
    A question is answered only if its number is unique in the PDF and the key gives exactly one letter.
    questions: [{"id", "number", "option_count"}] -> (updates [(id, index, letter, number)], ambiguous ids)."""
    updates: list[tuple] = []
    ambiguous: list = []
    for question in questions:
        number = question.get("number")
        letters = key_map.get(number) if number else None
        if not letters:
            continue
        if len(letters) != 1 or numbers_count.get(number, 0) != 1:
            ambiguous.append(question["id"])
            continue
        letter = next(iter(letters))
        index = LETTERS.index(letter)
        if index >= question["option_count"]:
            ambiguous.append(question["id"])
            continue
        updates.append((question["id"], index, letter, number))
    return updates, ambiguous


# ---------------------------------------------------------------- paper details
def verify_paper_info(name, year, text: str) -> tuple[str | None, int | None]:
    """The exam name and year are kept only if they are really printed in the text."""
    verified_name = None
    candidate = clean(name)
    if 3 <= len(candidate) <= 120 and squash(candidate) and squash(candidate) in squash(text):
        verified_name = candidate

    verified_year = None
    if (
        isinstance(year, int)
        and not isinstance(year, bool)
        and 1980 <= year <= 2100
        and re.search(rf"(?<!\d){year}(?!\d)", text)
    ):
        verified_year = year
    return verified_name, verified_year


# ---------------------------------------------------------------- duplicates
def find_duplicate(text_hash: str, tokens, by_hash: dict, entries: list) -> dict | None:
    """Looks for the same or a very similar question. Returns a description, or None."""
    ref = by_hash.get(text_hash)
    if ref is not None:
        return {"kind": "exact", **ref}

    size = len(tokens)
    if size < 4:
        return None
    for other_tokens, other_ref in entries:
        other = len(other_tokens)
        if other == 0 or min(size, other) / max(size, other) < SIMILAR_THRESHOLD:
            continue
        if jaccard(tokens, other_tokens) >= SIMILAR_THRESHOLD:
            return {"kind": "similar", **other_ref}
    return None


# ---------------------------------------------------------------- approval rules
def approval_problems(doc: dict) -> list[str]:
    """What stops a question from entering the approved question bank. Empty list = it can be approved."""
    problems: list[str] = []

    text = (doc.get("text") or "").strip()
    if not 5 <= len(text) <= MAX_STEM:
        problems.append("The question text must be 5 to 2000 characters long.")

    options = doc.get("options") or []
    if not 2 <= len(options) <= 6:
        problems.append("A question needs 2 to 6 answer options.")
    if any((not str(o).strip()) or len(str(o)) > MAX_OPTION for o in options):
        problems.append("Every option must be filled in and at most 300 characters.")
    if len({str(o).strip().casefold() for o in options}) != len(options):
        problems.append("Answer options must be different from each other.")

    index = doc.get("correct_index")
    if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(options):
        problems.append("Choose the correct answer.")

    if not doc.get("subject_id"):
        problems.append("Choose a subject.")
    return problems


# ---------------------------------------------------------------- pipeline status
def pipeline_status(
    *,
    material_status: str,
    material_error: str | None,
    job: dict | None,
    failed_chunks: int,
    pending: int,
    extracted_total: int,
    queued: bool,
    ai_configured: bool = True,  # ignored: extraction no longer uses AI (kept so older callers still work)
    ai_message: str = "",        # ignored
) -> tuple[str, str]:
    """The status an admin sees for a previous-year PDF, with an explanation."""
    if material_status == "failed":
        return "failed", material_error or "The text of this PDF could not be extracted."
    if material_status != "ready":
        return "processing", "Extracting the text from the PDF…"

    if job is None:
        if queued:
            return "uploaded", "Waiting in the queue. Question extraction starts automatically."
        return "uploaded", "The text is ready. Press Start extraction to find the questions."

    state = job.get("status")
    if state in ("running", "extracting"):
        return "processing", "Finding the questions in the PDF…"
    if state == "paused":
        reason = job.get("pause_reason") or "Extraction is paused."
        return ("failed" if job.get("pause_kind") == "failures" else "paused"), reason

    note = (
        f" {failed_chunks} part{'s' if failed_chunks != 1 else ''} of the PDF could not be read."
        if failed_chunks
        else ""
    )
    if pending > 0:
        return "review_required", f"{pending} extracted question{'s' if pending != 1 else ''} waiting for review.{note}"
    if extracted_total == 0:
        return "completed", f"No questions were found in this PDF.{note}"
    return "completed", f"All extracted questions have been reviewed.{note}"