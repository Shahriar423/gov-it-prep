"""Reads text from a PDF with PyMuPDF. Only text-based PDFs are supported (no OCR)."""
import pymupdf

from app.ingestion.errors import PdfProcessingError


def extract_pages(data: bytes, max_pages: int) -> list[str]:
    """Returns the raw text of every page (index 0 = page 1)."""
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception:
        raise PdfProcessingError(
            "This file could not be opened as a PDF. It may be damaged. "
            "Try saving it again from the original program."
        )

    try:
        if doc.needs_pass:
            raise PdfProcessingError(
                "This PDF is password-protected. Remove the password and upload it again."
            )
        page_count = doc.page_count
        if page_count == 0:
            raise PdfProcessingError("This PDF has no pages.")
        if page_count > max_pages:
            raise PdfProcessingError(
                f"This PDF has {page_count} pages. The limit is {max_pages}. "
                "Split it into smaller files and upload them separately.",
                page_count,
            )

        pages: list[str] = []
        for page in doc:
            try:
                pages.append(page.get_text("text") or "")
            except Exception:
                pages.append("")  # one unreadable page should not fail the whole file
        return pages
    finally:
        doc.close()