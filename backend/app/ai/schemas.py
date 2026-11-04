"""JSON schemas that force the AI provider to answer in a fixed structure.
Only basic keywords are used, so they work with Gemini and with OpenAI-compatible servers."""

GENERATE_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correct_letter": {"type": "string", "enum": ["A", "B", "C", "D"]},
                    "evidence": {"type": "string"},
                    "explanation": {"type": "string"},
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                },
                "required": [
                    "question",
                    "options",
                    "correct_letter",
                    "evidence",
                    "explanation",
                    "difficulty",
                ],
            },
        }
    },
    "required": ["questions"],
}

VERIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer"},
                    "answer_letter": {"type": "string", "enum": ["A", "B", "C", "D", "NONE"]},
                    "answerable_from_passage": {"type": "boolean"},
                    "ambiguous": {"type": "boolean"},
                },
                "required": ["number", "answer_letter", "answerable_from_passage", "ambiguous"],
            },
        }
    },
    "required": ["results"],
}

TEST_SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}},
    "required": ["ok"],
}


def strictify(schema: dict) -> dict:
    """OpenAI's strict mode needs additionalProperties=false on every object."""
    copy = dict(schema)
    if copy.get("type") == "object":
        copy["additionalProperties"] = False
        copy["properties"] = {k: strictify(v) for k, v in copy.get("properties", {}).items()}
    if copy.get("type") == "array" and "items" in copy:
        copy["items"] = strictify(copy["items"])
    return copy