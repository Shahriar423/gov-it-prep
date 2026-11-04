"""Tests for the AI layer's logic. They use fixed sample data and need no network, key or database."""
import asyncio
import random
import time

import pytest

from app.ai import mcq_logic
from app.ai.errors import AiResponseError
from app.ai.prompt_loader import render_prompt
from app.ai.rate_limit import AsyncRateLimiter
from app.ai.response_parsing import (
    extract_gemini_text,
    extract_openai_text,
    gemini_error_info,
    openai_error_info,
    parse_json_text,
)
from app.ai.schemas import GENERATE_SCHEMA, strictify

PASSAGE = (
    "TCP is a connection-oriented protocol. Before data is sent, the client and the server complete "
    "a three-way handshake. The client first sends a SYN segment, the server replies with SYN-ACK, "
    "and the client finishes with an ACK segment. UDP, in contrast, is connectionless."
)

GOOD = {
    "question": "Which segment does a TCP client send first in the three-way handshake?",
    "options": ["ACK", "SYN", "FIN", "RST"],
    "correct_letter": "B",
    "evidence": "The client first sends a SYN segment",
    "explanation": "The handshake starts when the client sends SYN.",
    "difficulty": "easy",
}


def make(**changes):
    return {**GOOD, **changes}


# ---------------------------------------------------------------- candidate validation
def test_good_candidate_is_accepted():
    candidate, reason = mcq_logic.validate_candidate(GOOD, PASSAGE)
    assert reason is None
    assert candidate["correct_index"] == 1
    assert candidate["options"][1] == "SYN"
    assert candidate["difficulty"] == "easy"


@pytest.mark.parametrize(
    "changes, reason",
    [
        ({"question": "Too short?"}, "bad_question"),
        ({"options": ["ACK", "SYN", "FIN"]}, "bad_options"),
        ({"options": ["ACK", "ack", "FIN", "RST"]}, "bad_options"),
        ({"options": ["ACK", "SYN", "FIN", "All of the above"]}, "bad_options"),
        ({"options": ["ACK", "SYN", "FIN", "Both A and B"]}, "bad_options"),
        ({"correct_letter": "E"}, "bad_answer"),
        ({"question": "According to the passage, which segment is sent first by the client?"}, "refers_to_passage"),
        ({"evidence": ""}, "no_evidence"),
        ({"evidence": "The server always sends the first segment of every handshake"}, "evidence_not_in_passage"),
        ({"explanation": "  "}, "no_explanation"),
    ],
)
def test_bad_candidates_are_rejected_with_a_reason(changes, reason):
    candidate, got = mcq_logic.validate_candidate(make(**changes), PASSAGE)
    assert candidate is None
    assert got == reason


def test_non_dict_item_is_malformed():
    assert mcq_logic.validate_candidate("nonsense", PASSAGE) == (None, "malformed")


def test_unknown_difficulty_falls_back_to_medium():
    candidate, _ = mcq_logic.validate_candidate(make(difficulty="extreme"), PASSAGE)
    assert candidate["difficulty"] == "medium"


def test_text_field_questions_are_not_mistaken_for_passage_references():
    item = make(question="Which HTML element creates a single-line text field for user input?")
    candidate, reason = mcq_logic.validate_candidate(item, PASSAGE)
    assert reason is None


# ---------------------------------------------------------------- evidence matching
def test_evidence_ignores_punctuation_quotes_and_spacing():
    assert mcq_logic.evidence_in_passage("the client  first sends a SYN segment!", PASSAGE)
    assert mcq_logic.evidence_in_passage("\u201cThe client first sends a SYN segment\u201d", PASSAGE)


def test_evidence_with_an_ellipsis_checks_each_piece():
    assert mcq_logic.evidence_in_passage(
        "the client and the server complete a three-way handshake ... SYN-ACK", PASSAGE
    )
    assert not mcq_logic.evidence_in_passage(
        "the client and the server complete a three-way handshake ... the packet is dropped silently", PASSAGE
    )


def test_tiny_or_missing_evidence_is_never_accepted():
    assert not mcq_logic.evidence_in_passage("TCP", PASSAGE)
    assert not mcq_logic.evidence_in_passage("", PASSAGE)


# ---------------------------------------------------------------- the independent check
def test_verification_text_never_contains_the_writers_answer():
    candidate, _ = mcq_logic.validate_candidate(GOOD, PASSAGE)
    text = mcq_logic.format_for_verification([candidate])
    assert "1. Which segment" in text
    assert "B) SYN" in text
    assert "correct" not in text.lower()
    assert "evidence" not in text.lower()


def test_judge_accepts_only_a_clear_agreement():
    candidate, _ = mcq_logic.validate_candidate(GOOD, PASSAGE)
    ok = {"answer_letter": "B", "answerable_from_passage": True, "ambiguous": False}
    assert mcq_logic.judge(candidate, ok) == (True, None)
    assert mcq_logic.judge(candidate, {**ok, "answer_letter": "C"}) == (False, "verification_disagreed")
    assert mcq_logic.judge(candidate, {**ok, "answer_letter": "NONE"}) == (False, "verification_disagreed")
    assert mcq_logic.judge(candidate, {**ok, "answerable_from_passage": False}) == (False, "not_answerable")
    assert mcq_logic.judge(candidate, {**ok, "ambiguous": True}) == (False, "ambiguous")
    assert mcq_logic.judge(candidate, {"answer_letter": "B"}) == (False, "ambiguous")  # missing flags are not trusted
    assert mcq_logic.judge(candidate, None) == (False, "no_verdict")


def test_parse_verdicts_keeps_the_first_entry_per_number_and_ignores_junk():
    data = {"results": [{"number": 1, "answer_letter": "A"}, {"number": 1, "answer_letter": "B"}, "junk", {"number": "2"}]}
    verdicts = mcq_logic.parse_verdicts(data)
    assert list(verdicts) == [1]
    assert verdicts[1]["answer_letter"] == "A"
    assert mcq_logic.parse_verdicts(None) == {}


# ---------------------------------------------------------------- duplicates and shuffling
def test_duplicate_detection():
    a = mcq_logic.question_hash("Which segment does a TCP client send first?")
    b = mcq_logic.question_hash("which  segment does a TCP client send first")
    assert a == b

    t1 = mcq_logic.token_set("Which segment does a TCP client send first in the handshake")
    t2 = mcq_logic.token_set("Which segment does a TCP client send first in the three-way handshake")
    t3 = mcq_logic.token_set("What is the purpose of the DNS protocol on the internet")
    assert mcq_logic.is_near_duplicate(t1, [t2])
    assert not mcq_logic.is_near_duplicate(t1, [t3])
    assert not mcq_logic.is_near_duplicate(t1, [])


def test_shuffle_keeps_the_correct_answer():
    options = ["ACK", "SYN", "FIN", "RST"]
    seen_positions = set()
    for seed in range(30):
        shuffled, index = mcq_logic.shuffle_options(options, 1, random.Random(seed))
        assert sorted(shuffled) == sorted(options)
        assert shuffled[index] == "SYN"
        seen_positions.add(index)
    assert len(seen_positions) > 1


# ---------------------------------------------------------------- prompts and schemas
def test_prompts_fill_every_placeholder_and_do_not_rescan_inserted_text():
    prompt = render_prompt(
        "mcq_generate",
        exams="Bank IT Officer",
        count=3,
        subject="Networking",
        chapter="TCP",
        pages="3-4",
        passage="Text with {{count}} inside it",
    )
    assert "Bank IT Officer" in prompt
    assert "up to 3 multiple-choice" in prompt
    assert "Text with {{count}} inside it" in prompt


def test_missing_prompt_values_are_reported():
    with pytest.raises(ValueError):
        render_prompt("mcq_verify", passage="only one value")


def test_strictify_adds_additional_properties_everywhere():
    strict = strictify(GENERATE_SCHEMA)
    assert strict["additionalProperties"] is False
    assert strict["properties"]["questions"]["items"]["additionalProperties"] is False
    assert "additionalProperties" not in GENERATE_SCHEMA  # the original is untouched


# ---------------------------------------------------------------- reading provider responses
def test_gemini_text_is_extracted_and_thoughts_are_skipped():
    data = {
        "candidates": [
            {
                "finishReason": "STOP",
                "content": {"parts": [{"text": "hidden", "thought": True}, {"text": '{"ok": true}'}]},
            }
        ]
    }
    assert extract_gemini_text(data) == '{"ok": true}'


@pytest.mark.parametrize(
    "data",
    [
        {"promptFeedback": {"blockReason": "SAFETY"}},
        {"candidates": []},
        {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": '{"a":'}]}}]},
        {"candidates": [{"finishReason": "SAFETY", "content": {"parts": []}}]},
        {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "  "}]}}]},
    ],
)
def test_unusable_gemini_answers_raise_a_clear_error(data):
    with pytest.raises(AiResponseError):
        extract_gemini_text(data)


def test_json_text_parsing():
    assert parse_json_text('```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(AiResponseError):
        parse_json_text("not json")
    with pytest.raises(AiResponseError):
        parse_json_text("[1, 2]")


def test_gemini_error_details_are_understood():
    body = {
        "error": {
            "code": 429,
            "message": "Quota exceeded",
            "status": "RESOURCE_EXHAUSTED",
            "details": [{"@type": "RetryInfo", "retryDelay": "34s"}],
        }
    }
    message, retry, daily = gemini_error_info(body)
    assert message == "Quota exceeded"
    assert retry == 34.0
    assert daily is False

    body["error"]["details"].append({"violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]})
    assert gemini_error_info(body)[2] is True
    assert gemini_error_info(None) == ("", None, False)


def test_openai_answers_and_errors():
    good = {"choices": [{"finish_reason": "stop", "message": {"content": '{"ok": true}'}}]}
    assert extract_openai_text(good) == '{"ok": true}'
    with pytest.raises(AiResponseError):
        extract_openai_text({"choices": [{"finish_reason": "length", "message": {"content": "{"}}]})
    with pytest.raises(AiResponseError):
        extract_openai_text({"choices": [{"message": {"refusal": "no"}}]})
    assert openai_error_info({"error": {"message": "x", "code": "insufficient_quota"}}) == ("x", "insufficient_quota")


# ---------------------------------------------------------------- rate limiter
def test_rate_limiter_lets_requests_through_up_to_the_limit_without_waiting():
    limiter = AsyncRateLimiter(3)

    async def run():
        for _ in range(3):
            await limiter.acquire()

    started = time.monotonic()
    asyncio.run(run())
    assert time.monotonic() - started < 0.5


def test_rate_limiter_makes_the_next_request_wait():
    limiter = AsyncRateLimiter(1)

    async def run():
        await limiter.acquire()
        # pretend the first request happened 59.7 seconds ago
        limiter._stamps[0] -= 59.7
        await limiter.acquire()

    started = time.monotonic()
    asyncio.run(run())
    assert 0.15 < time.monotonic() - started < 2