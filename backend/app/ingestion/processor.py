"""Turns raw per-page text into a processed document ready to store."""
from dataclasses import dataclass, field

from app.ingestion.chunker import Chunk, chunk_pages
from app.ingestion.errors import PdfProcessingError
from app.ingestion.quality import MIN_CHARS_FOR_TEXT_PAGE, assess_quality
from app.ingestion.text_cleaning import clean_page_text, count_non_space, strip_repeated_edges


@dataclass
class ProcessedPdf:
    page_count: int
    pages_with_text: int
    chunks: list[Chunk]
    word_count: int
    char_count: int
    warnings: list[str] = field(default_factory=list)


def build_from_pages(raw_pages: list[str]) -> ProcessedPdf:
    """Cleans, checks and chunks page text. Raises PdfProcessingError if the text is unusable."""
    page_count = len(raw_pages)
    if page_count == 0:
        raise PdfProcessingError("This PDF has no pages.")

    cleaned = strip_repeated_edges([clean_page_text(t) for t in raw_pages])
    numbered = list(enumerate(cleaned, start=1))

    warnings = assess_quality(page_count, numbered)
    chunks = chunk_pages(numbered)

    return ProcessedPdf(
        page_count=page_count,
        pages_with_text=sum(1 for _, t in numbered if count_non_space(t) >= MIN_CHARS_FOR_TEXT_PAGE),
        chunks=chunks,
        word_count=sum(len(c.text.split()) for c in chunks),
        char_count=sum(len(c.text) for c in chunks),
        warnings=warnings,
    )


def process_pdf(data: bytes, max_pages: int) -> ProcessedPdf:
    """Full pipeline from PDF bytes. CPU-heavy: call it from a worker thread."""
    from app.ingestion.pdf_extractor import extract_pages  # imported here: needs PyMuPDF

    return build_from_pages(extract_pages(data, max_pages))