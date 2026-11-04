"""Tests for PDF text cleaning, quality checks and chunking. They need no database."""
import pytest

from app.ingestion.chunker import MAX_CHARS, chunk_pages
from app.ingestion.errors import PdfProcessingError
from app.ingestion.processor import build_from_pages
from app.ingestion.text_cleaning import analyze_text, clean_page_text, strip_repeated_edges

ENGLISH = (
    "A computer network is a set of devices that are connected to share data and resources. "
    "The Transmission Control Protocol is used to provide reliable delivery of data between "
    "two hosts. Before any data is sent, the client and the server complete a handshake that "
    "is made of three steps. The first step is a request from the client to the server. "
)


def english_page(n: int = 1, repeat: int = 3) -> str:
    return f"Section {n}\n" + (ENGLISH * repeat).replace(". ", ".\n")


# ---------------------------------------------------------------- cleaning
def test_clean_joins_hyphenated_words_and_ligatures():
    raw = "The net-\nwork uses the \ufb01rst route.\r\n\r\n\r\n\r\nNext   \tline"
    cleaned = clean_page_text(raw)
    assert "network" in cleaned
    assert "first" in cleaned
    assert "\n\n\n" not in cleaned
    assert "\r" not in cleaned


def test_clean_keeps_indentation():
    assert clean_page_text("def f():\n    return 1") == "def f():\n    return 1"


def test_repeated_headers_footers_and_page_numbers_are_removed():
    pages = [f"Government IT Notes\nBody text of page {i} with real content.\n{i}" for i in range(1, 7)]
    cleaned = strip_repeated_edges(pages)
    for page in cleaned:
        assert "Government IT Notes" not in page
        assert page.strip().splitlines()[-1].startswith("Body text")


def test_numbered_headings_are_not_mistaken_for_running_headers():
    pages = [f"Question {i}\nWhich device forwards packets between networks number {i}?" for i in range(1, 8)]
    cleaned = strip_repeated_edges(pages)
    for i, page in enumerate(cleaned, start=1):
        assert page.startswith(f"Question {i}")
        assert "forwards packets" in page


def test_header_with_page_number_suffix_is_removed():
    pages = [f"Networking Notes | {i}\nThe body of page {i} stays." for i in range(1, 8)]
    cleaned = strip_repeated_edges(pages)
    for i, page in enumerate(cleaned, start=1):
        assert "Networking Notes" not in page
        assert page == f"The body of page {i} stays."


def test_body_lines_are_never_removed_just_because_they_contain_a_page_number():
    pages = [f"Government IT Notes\nBody text of page {i} with real content.\n{i}" for i in range(1, 7)]
    cleaned = strip_repeated_edges(pages)
    assert all(page.startswith("Body text of page") for page in cleaned)


def test_analyze_text_flags_garbage():
    garbage = "\ue001\ue002\ufffd" * 50
    assert analyze_text(garbage).bad_char_ratio > 0.9
    assert analyze_text(ENGLISH).stopword_ratio > 0.2


# ---------------------------------------------------------------- chunking
def test_chunks_cover_pages_and_respect_max_size():
    pages = [(n, english_page(n, repeat=6)) for n in range(1, 8)]
    chunks = chunk_pages(pages)
    assert len(chunks) > 1
    assert [c.index for c in chunks] == list(range(len(chunks)))
    assert all(len(c.text) <= MAX_CHARS + 400 for c in chunks)  # a merged tail may exceed slightly
    assert chunks[0].page_start == 1
    assert chunks[-1].page_end == 7
    assert all(c.page_start <= c.page_end for c in chunks)


def test_very_long_line_is_split():
    chunks = chunk_pages([(1, "word " * 5000)])
    assert len(chunks) >= 2
    assert all(len(c.text) <= MAX_CHARS for c in chunks)


def test_empty_pages_are_ignored():
    assert chunk_pages([(1, ""), (2, "   \n  ")]) == []


# ---------------------------------------------------------------- full pipeline (no PDF library)
def test_good_text_is_processed():
    result = build_from_pages([english_page(n) for n in range(1, 4)])
    assert result.page_count == 3
    assert result.pages_with_text == 3
    assert len(result.chunks) >= 1
    assert result.word_count > 100
    assert result.warnings == []


def test_blank_pdf_is_rejected_as_scanned():
    with pytest.raises(PdfProcessingError) as error:
        build_from_pages(["", "", ""])
    assert "no selectable text" in error.value.message
    assert error.value.page_count == 3


def test_mostly_empty_pdf_is_rejected():
    pages = [english_page(1)] + [""] * 5
    with pytest.raises(PdfProcessingError) as error:
        build_from_pages(pages)
    assert "scanned" in error.value.message


def test_partly_empty_pdf_is_accepted_with_a_warning():
    pages = [english_page(n) for n in range(1, 5)] + [""]
    result = build_from_pages(pages)
    assert result.pages_with_text == 4
    assert any("little or no selectable text" in w for w in result.warnings)


def test_garbled_text_is_rejected():
    garbage = "\ue001\ue002 abc \ufffd " * 400
    with pytest.raises(PdfProcessingError) as error:
        build_from_pages([garbage])
    assert "garbled" in error.value.message


def test_non_english_text_is_rejected():
    bengali = "বাংলা ভাষা একটি সুন্দর ভাষা এবং এটি অনেক মানুষ ব্যবহার করে " * 60
    with pytest.raises(PdfProcessingError) as error:
        build_from_pages([bengali])
    assert "English" in error.value.message


def test_gibberish_latin_text_is_rejected():
    gibberish = " ".join(["xqzv", "kjwp", "zzrt", "plmk", "vbnx"] * 150)
    with pytest.raises(PdfProcessingError) as error:
        build_from_pages([gibberish])
    assert "readable English" in error.value.message


def test_tiny_document_is_rejected():
    with pytest.raises(PdfProcessingError) as error:
        build_from_pages(["The network is up and running on this day of the week."])
    assert "almost no text" in error.value.message


# ---------------------------------------------------------------- real PDF files (needs PyMuPDF)
def _make_pdf(page_texts: list[str]) -> bytes:
    pymupdf = pytest.importorskip("pymupdf")
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        if text:
            page.insert_textbox(pymupdf.Rect(40, 40, 555, 800), text, fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


def test_real_text_pdf_is_extracted():
    from app.ingestion.processor import process_pdf

    data = _make_pdf([ENGLISH * 2, ENGLISH * 2])
    result = process_pdf(data, max_pages=50)
    assert result.page_count == 2
    assert result.pages_with_text == 2
    assert result.chunks and "Transmission Control Protocol" in " ".join(c.text for c in result.chunks)


def test_real_blank_pdf_is_rejected():
    from app.ingestion.processor import process_pdf

    with pytest.raises(PdfProcessingError) as error:
        process_pdf(_make_pdf(["", ""]), max_pages=50)
    assert "no selectable text" in error.value.message


def test_page_limit_is_enforced():
    from app.ingestion.processor import process_pdf

    with pytest.raises(PdfProcessingError) as error:
        process_pdf(_make_pdf([ENGLISH] * 3), max_pages=2)
    assert "limit is 2" in error.value.message


def test_garbage_bytes_are_rejected():
    pytest.importorskip("pymupdf")
    from app.ingestion.processor import process_pdf

    with pytest.raises(PdfProcessingError):
        process_pdf(b"%PDF-1.4 this is not really a pdf", max_pages=50)