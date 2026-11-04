"""Decides whether extracted text is usable, and explains clearly when it is not."""
from app.ingestion.errors import PdfProcessingError
from app.ingestion.text_cleaning import analyze_text, count_non_space

MIN_CHARS_FOR_TEXT_PAGE = 40   # a page needs this many visible characters to count as "has text"
MIN_TEXT_PAGE_SHARE = 0.5      # at least half of the pages must have text
MIN_WORDS = 50
MAX_BAD_CHAR_RATIO = 0.03
MIN_ASCII_LETTER_RATIO = 0.85
MIN_STOPWORD_RATIO = 0.03      # below this, the text is not readable English
WARN_STOPWORD_RATIO = 0.08     # below this, show a warning
STOPWORD_CHECK_MIN_WORDS = 200


def assess_quality(page_count: int, pages: list[tuple[int, str]]) -> list[str]:
    """pages: [(page_number, cleaned_text)] for ALL pages. Returns warnings, or raises
    PdfProcessingError when the PDF cannot be used."""
    text_pages = [n for n, t in pages if count_non_space(t) >= MIN_CHARS_FOR_TEXT_PAGE]
    stats = analyze_text("\n".join(t for _, t in pages))

    if not text_pages or stats.letters == 0:
        raise PdfProcessingError(
            "This PDF contains no selectable text. It is probably a scanned document or a set of "
            "images, and OCR is not supported in this version. Upload a text-based PDF in which "
            "you can select and copy the text.",
            page_count,
        )

    if len(text_pages) / page_count < MIN_TEXT_PAGE_SHARE:
        raise PdfProcessingError(
            f"Only {len(text_pages)} of {page_count} pages contain selectable text, so this PDF is "
            "probably scanned. OCR is not supported in this version. Upload a text-based PDF.",
            page_count,
        )

    if stats.bad_char_ratio > MAX_BAD_CHAR_RATIO:
        raise PdfProcessingError(
            "The text in this PDF is garbled. It probably uses a custom font encoding that cannot "
            "be read reliably. Try saving or printing the document to a new PDF, or use a "
            "different source file.",
            page_count,
        )

    if stats.ascii_letter_ratio < MIN_ASCII_LETTER_RATIO:
        raise PdfProcessingError(
            "Most of the text in this PDF is not in English letters. This version supports "
            "English-only PDFs.",
            page_count,
        )

    if stats.words < MIN_WORDS:
        raise PdfProcessingError(
            f"This PDF contains almost no text ({stats.words} words). There is not enough "
            "material to work with.",
            page_count,
        )

    warnings: list[str] = []

    if stats.words >= STOPWORD_CHECK_MIN_WORDS:
        if stats.stopword_ratio < MIN_STOPWORD_RATIO:
            raise PdfProcessingError(
                "The text does not look like readable English. The PDF may use a custom font "
                "encoding that produces unreadable characters. Check that you can copy normal "
                "words from it, or use a different source file.",
                page_count,
            )
        if stats.stopword_ratio < WARN_STOPWORD_RATIO:
            warnings.append(
                "The text contains few common English words. Check the preview below to make sure "
                "it reads correctly."
            )

    empty_pages = [n for n, t in pages if count_non_space(t) < MIN_CHARS_FOR_TEXT_PAGE]
    if empty_pages:
        shown = ", ".join(str(n) for n in empty_pages[:10])
        more = f" and {len(empty_pages) - 10} more" if len(empty_pages) > 10 else ""
        warnings.append(
            f"{len(empty_pages)} of {page_count} pages have little or no selectable text "
            f"(page {shown}{more}). Text on those pages, such as images or scans, was not extracted."
        )

    return warnings