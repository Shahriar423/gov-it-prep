"""JSON schema for extracting MCQs from previous-year paper text.
Only basic keywords are used, so it works with Gemini and with OpenAI-compatible servers."""

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "string"},
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "printed_answer": {
                        "type": "string",
                        "enum": ["A", "B", "C", "D", "E", "F", "NONE"],
                    },
                    "answer_quote": {"type": "string"},
                    "explanation": {"type": "string"},
                    "topic": {"type": "string"},
                    "complete": {"type": "boolean"},
                },
                "required": [
                    "number",
                    "question",
                    "options",
                    "printed_answer",
                    "answer_quote",
                    "explanation",
                    "topic",
                    "complete",
                ],
            },
        },
        "answer_key": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "string"},
                    "letter": {"type": "string", "enum": ["A", "B", "C", "D", "E", "F"]},
                },
                "required": ["number", "letter"],
            },
        },
        "paper_exam_name": {"type": "string"},
        "paper_year": {"type": "integer"},
    },
    "required": ["questions", "answer_key", "paper_exam_name", "paper_year"],
}