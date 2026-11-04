"""Tests for the previous-year extraction rules. They use fixed sample text: no network, key or database."""
from app.ai import pyq_logic

MAIN = (
    "Assistant Programmer Examination 2019\n"
    "1. Which protocol is used to send email?\n"
    "(A) FTP (B) SMTP (C) HTTP (D) SNMP\n"
    "Ans: B\n"
    "2. Which device connects different networks?\n"
    "(A) Hub (B) Switch (C) Router (D) Repeater\n"
)
CONTINUATION = "Ans: C\n3. Which layer"


def item(**changes):
    base = {
        "number": "1",
        "question": "Which protocol is used to send email?",
        "options": ["FTP", "SMTP", "HTTP", "SNMP"],
        "printed_answer": "B",
        "answer_quote": "Ans: B",
        "explanation": "",
        "topic": "Computer Networks",
        "complete": True,
    }
    return {**base, **changes}


# ---------------------------------------------------------------- one extracted item
def test_a_printed_and_verified_answer_is_accepted():
    result, reason = pyq_logic.validate_extracted(item(), MAIN, CONTINUATION)
    assert reason is None
    assert result["correct_index"] == 1
    assert result["answer_status"] == "printed"
    assert result["number"] == "1"
    assert result["flags"] == []


def test_a_question_not_in_the_pdf_is_rejected():
    result, reason = pyq_logic.validate_extracted(item(question="What is the capital of France?"), MAIN, CONTINUATION)
    assert result is None
    assert reason == "not_in_source"


def test_a_question_that_starts_in_the_continuation_is_left_for_the_next_chunk():
    result, reason = pyq_logic.validate_extracted(
        item(question="Which layer", options=["a", "b", "c", "d"], printed_answer="NONE", answer_quote=""),
        MAIN,
        CONTINUATION,
    )
    assert result is None
    assert reason == "starts_in_continuation"


def test_an_answer_that_is_not_printed_is_never_accepted():
    result, reason = pyq_logic.validate_extracted(item(printed_answer="D", answer_quote="Ans: D"), MAIN, CONTINUATION)
    assert reason is None
    assert result["correct_index"] is None
    assert result["answer_status"] == "missing"
    assert "answer_unverified" in result["flags"]


def test_no_printed_answer_means_no_answer():
    result, _ = pyq_logic.validate_extracted(item(printed_answer="NONE", answer_quote=""), MAIN, CONTINUATION)
    assert result["correct_index"] is None
    assert result["answer_status"] == "missing"


def test_an_explanation_that_is_not_in_the_pdf_is_dropped():
    result, _ = pyq_logic.validate_extracted(item(explanation="SMTP uses port 25 for relaying mail."), MAIN, CONTINUATION)
    assert result["explanation"] == ""
    assert "explanation_unverified" in result["flags"]


def test_incomplete_and_unusual_questions_are_flagged_not_dropped():
    cut_off = item(options=["FTP", "SMTP"], complete=False, printed_answer="NONE", answer_quote="")
    result, _ = pyq_logic.validate_extracted(cut_off, MAIN, CONTINUATION)
    assert "incomplete" in result["flags"]

    five = item(options=["FTP", "SMTP", "HTTP", "SNMP", "POP3"], printed_answer="NONE", answer_quote="")
    result, _ = pyq_logic.validate_extracted(five, MAIN, CONTINUATION)
    assert "unusual_option_count" in result["flags"]


def test_options_that_differ_from_the_pdf_are_flagged():
    result, _ = pyq_logic.validate_extracted(
        item(options=["FTP", "SMTP", "HTTPS", "SNMP"], printed_answer="NONE", answer_quote=""), MAIN, CONTINUATION
    )
    assert "option_text_differs" in result["flags"]


def test_items_without_options_are_not_mcqs():
    result, reason = pyq_logic.validate_extracted(item(options=[]), MAIN, CONTINUATION)
    assert result is None
    assert reason == "no_options"
    assert pyq_logic.validate_extracted("nonsense", MAIN, CONTINUATION) == (None, "malformed")


# ---------------------------------------------------------------- numbers and fingerprints
def test_numbers_are_read_safely():
    assert pyq_logic.parse_number("Q17") == "17"
    assert pyq_logic.parse_number("017") == "17"
    assert pyq_logic.parse_number("none") is None
    assert pyq_logic.parse_number("") is None


def test_the_fingerprint_ignores_spacing_and_punctuation_but_not_content():
    a = pyq_logic.fingerprint("Which protocol is used to send email?", ["FTP", "SMTP"])
    b = pyq_logic.fingerprint("which  protocol is used to send e-mail", ["ftp", "S.M.T.P"])
    c = pyq_logic.fingerprint("Which protocol is used to send email?", ["FTP", "POP3"])
    assert a == b
    assert a != c


# ---------------------------------------------------------------- answer keys
KEY_TEXT = "ANSWER KEY\n1-B 2-C 3-A 4-D 5-B 6-A\n"
KEY_ENTRIES = [
    {"number": "1", "letter": "B"},
    {"number": "2", "letter": "C"},
    {"number": "3", "letter": "A"},
    {"number": "4", "letter": "D"},
    {"number": "5", "letter": "B"},
    {"number": "6", "letter": "A"},
]


def test_a_real_answer_key_is_verified_against_the_text():
    pairs = pyq_logic.clean_key_entries(KEY_ENTRIES, KEY_TEXT)
    assert ("1", "B") in pairs and ("6", "A") in pairs
    assert len(pairs) == 6


def test_invented_or_too_few_key_entries_are_dropped():
    invented = KEY_ENTRIES[:5] + [{"number": "7", "letter": "C"}]
    assert ("7", "C") not in pyq_logic.clean_key_entries(invented, KEY_TEXT)
    assert pyq_logic.clean_key_entries(KEY_ENTRIES[:3], KEY_TEXT) == []  # a few matches are not a key
    assert pyq_logic.clean_key_entries("not a list", KEY_TEXT) == []


def test_contradicting_key_entries_are_dropped():
    entries = KEY_ENTRIES + [{"number": "1", "letter": "C"}]
    pairs = pyq_logic.clean_key_entries(entries, KEY_TEXT)
    assert all(number != "1" for number, _ in pairs)


def test_keys_answer_only_unambiguous_questions():
    key_map = pyq_logic.build_key_map([[("1", "B"), ("2", "C")], [("2", "C"), ("3", "A")], [("3", "D")]])
    questions = [
        {"id": "q1", "number": "1", "option_count": 4},
        {"id": "q2", "number": "2", "option_count": 4},
        {"id": "q3", "number": "3", "option_count": 4},  # the key says A in one place and D in another
        {"id": "q4", "number": "4", "option_count": 4},  # not in the key
    ]
    updates, ambiguous = pyq_logic.plan_key_answers(questions, {"1": 1, "2": 2, "3": 1, "4": 1}, key_map)
    assert updates == [("q1", 1, "B", "1")]  # q2's number appears twice in the PDF, so it is not answered
    assert set(ambiguous) == {"q2", "q3"}


# ---------------------------------------------------------------- paper details and duplicates
def test_exam_name_and_year_are_kept_only_when_printed():
    name, year = pyq_logic.verify_paper_info("Assistant Programmer Examination", 2019, MAIN)
    assert name == "Assistant Programmer Examination"
    assert year == 2019

    name, year = pyq_logic.verify_paper_info("Bank IT Officer", 2021, MAIN)
    assert name is None
    assert year is None


def test_exact_and_similar_duplicates_are_found():
    ref = {"of_type": "question", "of_id": "1", "of_label": "x"}
    text = "Which protocol is used to send email between servers on the internet"
    by_hash = {pyq_logic.question_hash(text): ref}
    entries = [(pyq_logic.token_set(text), ref)]

    exact = pyq_logic.find_duplicate(pyq_logic.question_hash(text), pyq_logic.token_set(text), by_hash, entries)
    assert exact["kind"] == "exact"

    similar_text = text + " today"
    similar = pyq_logic.find_duplicate(
        pyq_logic.question_hash(similar_text), pyq_logic.token_set(similar_text), by_hash, entries
    )
    assert similar["kind"] == "similar"

    other = "What is the purpose of the DNS protocol"
    assert pyq_logic.find_duplicate(pyq_logic.question_hash(other), pyq_logic.token_set(other), by_hash, entries) is None


# ---------------------------------------------------------------- approval rules
def test_a_question_cannot_be_approved_without_an_answer():
    doc = {"text": "Which protocol is used to send email?", "options": ["FTP", "SMTP"], "correct_index": None, "subject_id": "s"}
    assert "Choose the correct answer." in pyq_logic.approval_problems(doc)
    doc["correct_index"] = 1
    assert pyq_logic.approval_problems(doc) == []


def test_other_approval_problems_are_reported():
    doc = {"text": "Hi", "options": ["same", "SAME"], "correct_index": 5, "subject_id": None}
    problems = pyq_logic.approval_problems(doc)
    assert len(problems) >= 4


# ---------------------------------------------------------------- status shown to the admin
def status(**changes):
    base = dict(
        material_status="ready",
        material_error=None,
        job=None,
        failed_chunks=0,
        pending=0,
        extracted_total=0,
        queued=False,
        ai_configured=True,
        ai_message="",
    )
    return pyq_logic.pipeline_status(**{**base, **changes})[0]


def test_the_pipeline_status_follows_the_work():
    assert status(material_status="failed", material_error="scanned") == "failed"
    assert status(material_status="processing") == "processing"
    assert status(queued=True) == "uploaded"
    assert status(ai_configured=False, ai_message="AI is off") == "uploaded"
    assert status(job={"status": "running"}) == "processing"
    assert status(job={"status": "paused", "pause_kind": "restart"}) == "paused"
    assert status(job={"status": "paused", "pause_kind": "failures"}) == "failed"
    assert status(job={"status": "completed"}, pending=3, extracted_total=3) == "review_required"
    assert status(job={"status": "completed"}, pending=0, extracted_total=3) == "completed"
    assert status(job={"status": "completed"}, pending=0, extracted_total=0) == "completed"