"""Rule-based extraction of multiple-choice questions from PDF text. No AI and no network.

The parser only COPIES text that is printed. It never writes, fixes or guesses anything:
- an answer is taken only when an explicit label such as "Ans: B" or "Answer: (C)" is printed
- an answer key is used only when it is printed as a list such as "1-B 2-C 3-A"
- anything it is unsure about is flagged for an admin to check

It works on text that was already extracted from the PDF and cut into chunks. A chunk is parsed
together with the beginning of the next one, so a question that crosses the boundary is complete."""
import re
from dataclasses import dataclass, field

LETTERS = "ABCDEF"
MIN_KEY_ENTRIES = 5
MAX_HEADING_WORDS = 8

# "1. text", "1) text", "Q1. text", "Q.1 text", "Question 12: text"  (a decimal such as "1.5 users" is not a start)
_START = re.compile(
    r"^\s*(?:(?:Q(?:uestion)?|Ques)\s*\.?\s*(?P<qnum>\d{1,3})\s*[\.\)\:\-\u2013]?"
    r"|(?P<num>\d{1,3})\s*[\.\)\:\-\u2013](?!\d))\s*(?P<rest>.*)$",
    re.IGNORECASE,
)

# "(A)", "A)", "A." and the lower-case forms
_OPTION = re.compile(r"(?<![A-Za-z0-9])(?:\((?P<p>[A-Fa-f])\)|(?P<d>[A-Fa-f])[\.\)](?=\s|$))")

# "Ans: B", "Answer: (C)", "Correct Answer: C", "Answer is B", "Answer (C)", "Ans B", "Answer B".
# Searched only in the trailing text after the last option marker, so ordinary sentences in the stem
# (e.g. "to answer a question") never match.
_ANSWER = re.compile(
    r"(?<![A-Za-z0-9])(?:correct\s+)?(?:answer|ans|key)\b"
    r"(?:\s*[:\.\-\u2013\u2014=]\s*|\s+is\s+|\s+|\s*(?=\())"
    r"\(?\s*(?P<l>[A-Fa-f])\s*[\)\.]?(?![A-Za-z0-9])",
    re.IGNORECASE,
)
# Also catch bare "Ans B" / "Answer: B" variants and optional trailing option text after the letter.
_ANSWER_WITH_TEXT = re.compile(
    r"(?<![A-Za-z0-9])(?:correct\s+)?(?:answer|ans|key)\b"
    r"(?:\s*[:\.\-\u2013\u2014=]\s*|\s+is\s+|\s+|\s*(?=\())"
    r"\(?\s*(?P<l>[A-Fa-f])\s*[\)\.]?\s*(?P<txt>[^\n]{0,200})?",
    re.IGNORECASE,
)
_EXPLANATION = re.compile(
    r"(?<![A-Za-z0-9])(?:explanation|solution|sol|reason|hint)\b\s*[:\.\-\u2013\u2014]?\s*", re.IGNORECASE
)

# Answer-key lines such as "1-B 2-C 3-A" or "1. B"
_ENTRY = re.compile(r"(?<![\w])(\d{1,3})\s*[\.\-\u2013:=\)]*\s*\(?([A-Fa-f])\)?(?![\w])")
_KEY_TITLE = re.compile(r"^\s*(?:answer\s*keys?|answers?|keys?)\s*[:\-\u2013]?\s*$", re.IGNORECASE)
_FILLER = re.compile(r"[\s,;|/\.\-\u2013:]+")

# Section headings: "Section B", "Part-II: English", "Subject: Networking"
_SECTION = re.compile(
    r"^\s*(?:section|part|group|unit)\s*[-\u2013:\.]?\s*(?:[A-Za-z]|[IVXivx]{1,4}|\d{1,2})\b.*$", re.IGNORECASE
)
_SUBJECT = re.compile(r"^\s*(?:subject|topic)\s*[:\-\u2013]\s*\S.*$", re.IGNORECASE)

_YEAR = re.compile(r"(?<!\d)((?:19[89]\d|20\d\d|21\d\d))(?!\d)")
_EXAM_WORDS = re.compile(
    r"\b(?:exam|examination|recruitment|test|bcs|question\s+paper|written|preliminary|session)\b", re.IGNORECASE
)
_TRAILING_YEAR = re.compile(r"[\s\-\u2013,:\(\)]*(?:19[89]\d|20\d\d|21\d\d)[\s\-\u2013,:\(\)\.]*$")
_LEADING_YEAR = re.compile(r"^[\s\-\u2013,:\(\)]*(?:19[89]\d|20\d\d|21\d\d)[\s\-\u2013,:\(\)\.]*")


# ---------------------------------------------------------------- small helpers
def join_lines(parts: list[str]) -> str:
    """Joins wrapped lines with a space. Lines that look like code keep their line breaks."""
    pieces = [p.rstrip() for p in parts if p.strip()]
    if not pieces:
        return ""
    text = pieces[0].strip()
    for previous, current in zip(pieces, pieces[1:]):
        keeps_break = current.startswith("  ") or previous.endswith((";", "{", "}"))
        text += ("\n" + current) if keeps_break else (" " + current.strip())
    return text


def _slice(lines: list[str], start_line: int, start_col: int, end_line: int, end_col: int) -> list[str]:
    if start_line == end_line:
        return [lines[start_line][start_col:end_col]]
    return [lines[start_line][start_col:]] + lines[start_line + 1 : end_line] + [lines[end_line][:end_col]]


def _markers(lines: list[str]) -> list[tuple]:
    found = []
    for line_no, text in enumerate(lines):
        for match in _OPTION.finditer(text):
            found.append((line_no, match.start(), match.end(), match.group("p") or match.group("d")))
    return found


def _find_chain(markers: list[tuple]) -> list[tuple]:
    """The best run of markers A, B, C... (same letter case). The longest run wins and a later run wins a tie,
    so "(A) and (B)" inside the question text does not hide the real options."""
    best: list[tuple] = []
    for start, first in enumerate(markers):
        if first[3].upper() != "A":
            continue
        chain = [first]
        wanted = 1
        for marker in markers[start + 1 :]:
            if (
                wanted < len(LETTERS)
                and marker[3].upper() == LETTERS[wanted]
                and marker[3].isupper() == first[3].isupper()
            ):
                chain.append(marker)
                wanted += 1
        if len(chain) >= 2 and len(chain) >= len(best):
            best = chain
    return best


def option_chain_length(lines: list[str], uppercase_only: bool = False) -> int:
    chain = _find_chain(_markers(lines))
    if uppercase_only and chain and not chain[0][3].isupper():
        return 0
    return len(chain)


# ---------------------------------------------------------------- answer keys
def _key_entries(line: str) -> list[tuple[str, str]]:
    entries = _ENTRY.findall(line)
    if not entries:
        return []
    if _FILLER.sub("", _ENTRY.sub(" ", line)):
        return []  # something else is on the line, so it is not a key line
    return [(number, letter.upper()) for number, letter in entries]


def _find_answer_key(lines: list[str]) -> tuple[list[tuple[str, str]], set[int]]:
    pairs: list[tuple[str, str]] = []
    masked: set[int] = set()
    group_lines: list[int] = []
    group_pairs: list[tuple[str, str]] = []

    def flush() -> None:
        nonlocal group_lines, group_pairs
        if len(group_pairs) >= MIN_KEY_ENTRIES:
            masked.update(group_lines)
            pairs.extend(group_pairs)
        group_lines, group_pairs = [], []

    for index, line in enumerate(lines):
        entries = _key_entries(line)
        if entries:
            group_lines.append(index)
            group_pairs.extend(entries)
        elif not line.strip() or _KEY_TITLE.match(line):
            if group_lines or _KEY_TITLE.match(line):
                group_lines.append(index)
        else:
            flush()
    flush()
    return pairs, masked


# ---------------------------------------------------------------- headings and paper details
def _heading(line: str, labels) -> str | None:
    text = line.strip()
    if not text or len(text) > 80 or text.endswith("?"):
        return None
    if len(text.split()) > MAX_HEADING_WORDS or _START.match(line):
        return None
    if _SECTION.match(text) or _SUBJECT.match(text):
        return text
    low = text.casefold().rstrip(":")
    return text if any(low == label.casefold() for label in labels) else None


def match_label(heading: str | None, labels) -> str | None:
    """The longest known topic label that appears as whole words in the heading."""
    if not heading:
        return None
    low = heading.casefold()
    best = None
    for label in labels:
        key = label.casefold()
        if re.search(rf"(?<![a-z0-9]){re.escape(key)}(?![a-z0-9])", low) and (best is None or len(key) > len(best)):
            best = label
    return best


def detect_paper_info(lines: list[str]) -> tuple[str, int]:
    """Exam name and year from the heading lines before the first question. ("", 0) when not printed."""
    name, year = "", 0
    for raw in lines[:25]:
        if _START.match(raw):
            break
        text = re.sub(r"\s+", " ", raw).strip()
        if not text or len(text) > 120 or not _EXAM_WORDS.search(text):
            continue
        if not year:
            found = _YEAR.search(text)
            if found and 1980 <= int(found.group(1)) <= 2100:
                year = int(found.group(1))
        if not name:
            candidate = _LEADING_YEAR.sub("", _TRAILING_YEAR.sub("", text)).strip(" -\u2013:,()")
            if len(candidate) >= 3:
                name = candidate
    return name, year


# ---------------------------------------------------------------- finding the question blocks
@dataclass
class Block:
    number: str
    first: str
    rest: list
    ended: bool          # the block ended at a real boundary (next question, heading, key), not at the end of the window
    heading: str | None


@dataclass
class Scan:
    blocks: list = field(default_factory=list)
    key_pairs: list = field(default_factory=list)
    last_heading: str | None = None


def scan_blocks(main: str, continuation: str, labels=()) -> Scan:
    """Splits the text into numbered blocks. Only questions that START in `main` are returned;
    `continuation` (the beginning of the next chunk) only completes the last one."""
    main_lines = main.split("\n")
    lines = main_lines + (continuation.split("\n") if continuation else [])
    boundary = len(main_lines)
    more_text = bool(continuation.strip())

    key_pairs, masked = _find_answer_key(lines)

    starts: list[tuple[int, str, str]] = []
    headings: dict[int, str] = {}
    for index, line in enumerate(lines):
        if index in masked:
            continue
        heading = _heading(line, labels)
        if heading:
            headings[index] = heading
            continue
        match = _START.match(line)
        if match:
            starts.append((index, match.group("qnum") or match.group("num"), match.group("rest") or ""))

    stops = sorted(set(headings) | masked)
    heading_rows = sorted(headings)
    scan = Scan(key_pairs=key_pairs)

    for position, (index, number, rest) in enumerate(starts):
        if index >= boundary:
            break
        next_start = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
        next_stop = next((s for s in stops if s > index), len(lines))
        end = min(next_start, next_stop)
        previous = max((h for h in heading_rows if h < index), default=None)
        scan.blocks.append(
            Block(
                number=number.lstrip("0") or "0",
                first=rest,
                rest=lines[index + 1 : end],
                ended=end < len(lines) or not more_text,
                heading=headings.get(previous),
            )
        )

    last = max((h for h in heading_rows if h < boundary), default=None)
    scan.last_heading = headings.get(last)
    return scan


# ---------------------------------------------------------------- one MCQ block
def _parse_block(first_text: str, rest: list[str], ended: bool) -> dict | None:
    lines = [first_text] + rest
    chain = _find_chain(_markers(lines))
    if len(chain) < 2:
        return None  # no answer options: not an MCQ

    first = chain[0]
    stem = join_lines(lines[: first[0]] + [lines[first[0]][: first[1]]])

    options: list[str] = []
    raw_last = ""
    for index, marker in enumerate(chain):
        is_last = index == len(chain) - 1
        if is_last:
            end_line, end_col = len(lines) - 1, len(lines[-1])
        else:
            end_line, end_col = chain[index + 1][0], chain[index + 1][1]
        pieces = _slice(lines, marker[0], marker[2], end_line, end_col)
        if is_last:
            raw_last = "\n".join(pieces)
        else:
            options.append(join_lines(pieces))

    # The printed answer and explanation come after the last option. Cut them out of the last option text.
    answer = _ANSWER.search(raw_last) or _ANSWER_WITH_TEXT.search(raw_last)
    explanation = _EXPLANATION.search(raw_last)
    cut_positions = []
    if answer:
        cut_positions.append(answer.start())
    if explanation:
        cut_positions.append(explanation.start())
    # Also cut on common trailing patterns that the main regex may miss (e.g. "Ans - B" mid-line)
    for pat in (
        r"(?<![A-Za-z0-9])(?:Ans|Answer|Correct\s+Answer)\s*[:\.\-\u2013=]?\s*[A-Fa-f]\b",
        r"(?<![A-Za-z0-9])(?:Explanation|Solution|Sol|Reason|Hint)\s*[:\.\-\u2013]?\s*",
    ):
        m = re.search(pat, raw_last, re.IGNORECASE)
        if m:
            cut_positions.append(m.start())

    if cut_positions:
        cut_at = min(cut_positions)
        last_option_raw = raw_last[:cut_at]
    else:
        last_option_raw = raw_last

    options.append(join_lines(last_option_raw.split("\n")))

    # Build explanation text (everything after the explanation label, excluding a later answer label)
    explanation_text = ""
    if explanation:
        raw = raw_last[explanation.end() :]
        if answer and answer.start() > explanation.start():
            # Answer appears after explanation; keep only the part between them for the explanation body
            raw = raw_last[explanation.end() : answer.start()]
        explanation_text = join_lines(raw.split("\n")).strip()
        # Drop a leading answer letter that sometimes rides along with the explanation
        explanation_text = re.sub(
            r"^(?:[A-Fa-f][\.\)]\s*|[A-Fa-f]\s*[:\-\u2013]\s*)", "", explanation_text
        ).strip()

    # If the answer match captured optional trailing text, and that text closely matches one option,
    # prefer that letter (already captured). Otherwise keep the letter from the label.
    printed = "NONE"
    answer_quote = ""
    if answer:
        printed = answer.group("l").upper()
        answer_quote = answer.group(0).strip()[:200]
        # Prefer a cleaner quote when possible
        clean_m = _ANSWER.search(raw_last)
        if clean_m:
            answer_quote = clean_m.group(0).strip()[:200]

    flags: list[str] = []
    complete = ended or len(options) >= 4
    empty_at = next((k for k, text in enumerate(options) if not text.strip()), None)
    if empty_at is not None:
        # An empty option means the layout was not understood. Keep only what was read before it.
        options = options[:empty_at]
        complete = False
        flags.append("parse_uncertain")
    if not options:
        return None

    # Final cleanup of last option: remove any residual answer/explanation fragments that survived the cut
    if options:
        last = options[-1]
        last = re.sub(
            r"\s*(?:Ans|Answer|Correct\s+Answer|Explanation|Solution|Sol|Reason|Hint)\s*[:\.\-\u2013=].*$",
            "",
            last,
            flags=re.IGNORECASE | re.DOTALL,
        ).strip()
        # Also strip a trailing isolated answer letter that sometimes remains
        last = re.sub(r"\s+[A-Fa-f]\s*[\.\)]?\s*$", "", last).strip()
        options[-1] = last

    return {
        "question": stem,
        "options": options,
        "printed_answer": printed,
        "answer_quote": answer_quote,
        "explanation": explanation_text,
        "complete": complete,
        "parser_flags": flags,
    }


def parse_mcq(main: str, continuation: str, topic_labels=(), previous_number: int | None = None) -> dict:
    """Extracts the MCQs that start in `main`. Returns the questions (as printed), any answer key,
    the last section heading seen, and the last question number (to check the numbering of the next chunk)."""
    scan = scan_blocks(main, continuation, topic_labels)
    questions: list[dict] = []
    skipped = 0
    last_number = previous_number

    for block in scan.blocks:
        parsed = _parse_block(block.first, block.rest, block.ended)
        if parsed is None:
            skipped += 1
            continue
        number = int(block.number)
        flags = list(parsed["parser_flags"])
        if last_number is not None and number != last_number + 1 and number != 1:
            flags.append("check_numbering")
        last_number = number
        parsed.update(number=block.number, heading=block.heading, parser_flags=flags)
        questions.append(parsed)

    return {
        "questions": questions,
        "skipped_without_options": skipped,
        "answer_key": [{"number": n, "letter": letter} for n, letter in scan.key_pairs],
        "last_heading": scan.last_heading,
        "last_number": last_number,
    }