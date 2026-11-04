"""Tests for the rule-based written-question parser. Fixed sample text: no PDF, network or database."""
from app.ingestion import written_parser

PAPER = (
    "Section B: Written\n"
    "1. Explain the OSI model with a neat diagram. [10]\n"
    "2. (a) Define a database. (3 marks)\n"
    "(b) Explain normalization with examples. 7 marks\n"
    "3. Write short notes on TCP.\n"
)


def parse(text=PAPER, continuation="", previous=None):
    return written_parser.parse_written(text, continuation, ["Written"], previous)


def test_questions_parts_and_marks_are_copied():
    first, second, third = parse()["questions"]

    assert first["number"] == "1"
    assert first["stem"] == "Explain the OSI model with a neat diagram. [10]"
    assert first["pdf_marks"] == 10
    assert first["parts"] == []

    assert second["stem"] == ""
    assert [p["label"] for p in second["parts"]] == ["a", "b"]
    assert [p["marks"] for p in second["parts"]] == [3, 7]
    assert second["pdf_marks"] is None  # marks are never invented

    assert third["pdf_marks"] is None
    assert third["stem"] == "Write short notes on TCP."


def test_sub_questions_stay_separate_paragraphs():
    second = parse()["questions"][1]
    text = written_parser.compose_text(second["stem"], second["parts"])
    assert text == "(a) Define a database. (3 marks)\n\n(b) Explain normalization with examples. 7 marks"


def test_checked_questions_carry_their_text_and_flags():
    item = parse()["questions"][0]
    result, reason = written_parser.validate_written(item, PAPER, "")
    assert reason is None
    assert result["text"] == "Explain the OSI model with a neat diagram. [10]"


def test_too_short_text_is_rejected():
    item = {"number": "1", "stem": "Define it.", "parts": [], "pdf_marks": None, "parser_flags": []}
    assert written_parser.validate_written(item, "1. Define it.", "") == (None, "bad_question")


def test_text_that_is_not_in_the_pdf_is_rejected():
    item = {"number": "1", "stem": "Explain the entire history of networking.", "parts": [], "pdf_marks": None, "parser_flags": []}
    assert written_parser.validate_written(item, PAPER, "") == (None, "not_in_source")


def test_a_block_with_mcq_options_is_flagged_not_converted():
    text = "1. Which protocol sends email?\n(A) FTP (B) SMTP (C) HTTP (D) SNMP\n"
    item = parse(text)["questions"][0]
    assert "looks_like_mcq" in item["parser_flags"]
    assert item["parts"] == []  # options are never turned into parts


def test_lower_case_sub_parts_are_not_mistaken_for_mcq_options():
    item = parse("1. Answer the following.\n(a) First part here.\n(b) Second part here.\n(c) Third part here.\n")["questions"][0]
    assert "looks_like_mcq" not in item["parser_flags"]
    assert len(item["parts"]) == 3


def test_numbering_gaps_are_flagged():
    text = "1. First written question text here.\n4. Another written question text here.\n"
    questions = parse(text)["questions"]
    assert "check_numbering" in questions[1]["parser_flags"]


def test_a_question_that_may_continue_is_flagged():
    main = "1. Explain the process of normalization in a relational database\n"
    result = parse(main, "and describe each normal form in detail with examples\n")
    assert "possibly_incomplete" in result["questions"][0]["parser_flags"]