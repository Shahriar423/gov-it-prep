from pydantic import BaseModel, Field


class PastedTextIn(BaseModel):
    """Question text pasted by an admin instead of uploading a PDF."""

    title: str
    subject_id: str
    chapter_id: str | None = None
    exam_tags: list[str] = Field(default_factory=list)
    year: int | None = None
    paper_type: str = "mcq"  # mcq | written
    text: str = Field(max_length=300_000)