"""Tests for the rule-based MCQ parser. They use fixed sample text: no PDF, network or database."""
from app.ai import pyq_logic
from app.ingestion import mcq_parser

PAPER = (
    "Assistant Programmer Examination 2019\n"
    "Time: 60 minutes\n"
    "1. Which protocol is used to send email?\n"
    "(A) FTP (B) SMTP (C) HTTP (D) SNMP\n"
    "Ans: B\n"
    "2. Which device connects different networks?\n"
    "A. Hub\n"
    "B. Switch\n"
    "C. Router\n"
    "D. Repeater\n"
    "Answer: (C)\n"
    "Explanation: A router forwards packets between networks.\n"
    "3. What is 2 + 2?\n"
    "(A) 3 (B) 4 (C) 5 (D) 6\n"
)


def parse(text=PAPER, continuation="", labels=(), previous=None):
    return mcq_parser.parse_mcq(text, continuation, labels, previous)


def test_questions_options_and_printed_answers_are_copied():
    result = parse()
    first, second, third = result["questions"]

    assert first["number"] == "1"
    assert first["question"] == "Which protocol is used to send email?"
    assert first["options"] == ["FTP", "SMTP", "HTTP", "SNMP"]
    assert first["printed_answer"] == "B"
    assert first["answer_quote"] == "Ans: B"

    assert second["options"] == ["Hub", "Switch", "Router", "Repeater"]
    assert second["printed_answer"] == "C"
    assert second["explanation"] == "A router forwards packets between networks."

    # No printed answer: never guessed
    assert third["printed_answer"] == "NONE"
    assert third["options"] == ["3", "4", "5", "6"]


def test_extracted_items_pass_the_text_checks():
    for item in parse()["questions"]:
        result, reason = pyq_logic.validate_extracted(item, PAPER, "")
        assert reason is None
    first, _ = pyq_logic.validate_extracted(parse()["questions"][0], PAPER, "")
    assert first["correct_index"] == 1 and first["answer_status"] == "printed"
    third, _ = pyq_logic.validate_extracted(parse()["questions"][2], PAPER, "")
    assert third["correct_index"] is None and third["answer_status"] == "missing"


def test_an_ordinary_sentence_is_not_read_as_an_answer():
    text = "1. What helps users to answer a question quickly?\n(A) Search (B) Maps (C) Mail (D) Chat\n"
    assert parse(text)["questions"][0]["printed_answer"] == "NONE"


def test_a_question_cut_by_the_chunk_boundary_is_completed_from_the_continuation():
    main = "1. Which protocol is used to send email?\n(A) FTP (B) SMTP\n"
    continuation = "(C) HTTP (D) SNMP\nAns: B\n2. The next question text goes here?\n(A) a (B) b\n"
    result = parse(main, continuation)
    assert len(result["questions"]) == 1  # question 2 belongs to the next chunk
    question = result["questions"][0]
    assert question["options"] == ["FTP", "SMTP", "HTTP", "SNMP"]
    assert question["printed_answer"] == "B"


def test_the_tail_of_a_cut_question_at_the_start_of_a_chunk_is_not_a_question():
    result = parse("(C) HTTP (D) SNMP\nAns: B\n2. Next question text goes here?\n(A) a (B) b (C) c (D) d\n")
    assert [q["number"] for q in result["questions"]] == ["2"]


def test_an_answer_key_is_found_and_kept_out_of_the_questions():
    text = (
        "1. First question text here?\n(A) a1 (B) b1 (C) c1 (D) d1\n"
        "2. Second question text here?\n(A) a2 (B) b2 (C) c2 (D) d2\n"
        "Answer Key\n1-B 2-C 3-A 4-D 5-B 6-A\n"
    )
    result = parse(text)
    assert len(result["answer_key"]) == 6
    assert {"number": "1", "letter": "B"} in result["answer_key"]
    assert result["questions"][-1]["options"][-1] == "d2"  # the key lines did not leak into the last option
    assert all(q["printed_answer"] == "NONE" for q in result["questions"])


def test_a_few_stray_number_letter_pairs_are_not_an_answer_key():
    assert parse("1-B 2-C\n")["answer_key"] == []


def test_irregular_numbering_is_flagged():
    text = (
        "1. First question text here?\n(A) a (B) b (C) c (D) d\n"
        "5. Skipped ahead question text?\n(A) a (B) b (C) c (D) d\n"
    )
    questions = parse(text)["questions"]
    assert "check_numbering" not in questions[0]["parser_flags"]
    assert "check_numbering" in questions[1]["parser_flags"]


def test_numbered_lines_without_options_are_not_mcqs_and_are_counted():
    result = parse("1. Answer all questions in this section.\n2. Which one is right?\n(A) x (B) y (C) z (D) w\n")
    assert [q["number"] for q in result["questions"]] == ["2"]
    assert result["skipped_without_options"] == 1


def test_decimal_numbers_do_not_start_a_question():
    result = parse("1.5 million users joined.\n1. Which is right?\n(A) x (B) y (C) z (D) w\n")
    assert [q["number"] for q in result["questions"]] == ["1"]


def test_options_of_the_statement_style_do_not_confuse_the_chain():
    text = "1. Consider (A) and (B) in the diagram. Which is true?\n(A) one (B) two (C) three (D) four\n"
    question = parse(text)["questions"][0]
    assert question["options"] == ["one", "two", "three", "four"]


def test_section_headings_give_the_topic_of_the_questions_that_follow():
    text = (
        "Section B: English\n"
        "1. Choose the right word?\n(A) a (B) b (C) c (D) d\n"
        "General Knowledge\n"
        "2. Capital of Bangladesh is?\n(A) Dhaka (B) Sylhet (C) Khulna (D) Rajshahi\n"
    )
    labels = ["English", "General Knowledge"]
    first, second = parse(text, labels=labels)["questions"]
    assert mcq_parser.match_label(first["heading"], labels) == "English"
    assert mcq_parser.match_label(second["heading"], labels) == "General Knowledge"
    assert second["options"][-1] == "Rajshahi"  # the heading did not leak into the last option


def test_exam_name_and_year_come_only_from_the_heading():
    name, year = mcq_parser.detect_paper_info(PAPER.split("\n"))
    assert name == "Assistant Programmer Examination"
    assert year == 2019
    assert mcq_parser.detect_paper_info(["1. Which is right?", "Exam 2020"]) == ("", 0)


def test_code_lines_in_a_question_keep_their_line_breaks():
    text = "1. What does this print?\n    x = 5\n    print(x)\n(A) 5 (B) x (C) 0 (D) None\n"
    question = parse(text)["questions"][0]
    assert "x = 5\n    print(x)" in question["question"]