from pydantic import BaseModel


class NonTechnicalStatus(BaseModel):
    name: str
    exists: bool
    subject_id: str | None = None


class TechnicalSubjectInfo(BaseModel):
    id: str
    name: str
    chapters_total: int


class TechnicalChapterStatus(BaseModel):
    title: str
    exists: bool


class StructureOut(BaseModel):
    non_technical: list[NonTechnicalStatus]
    technical_subjects: list[TechnicalSubjectInfo]
    technical_chapters: list[TechnicalChapterStatus]
    extra_technical_chapters: int
    complete: bool


class SeedResult(BaseModel):
    created_subjects: list[str]
    created_chapters: int
    structure: StructureOut