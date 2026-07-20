"""Local PDF text extraction (fallback when OCR API unavailable)."""

from __future__ import annotations

from pathlib import Path


def extract_pdf_pages(file_path: Path) -> tuple[list[str], str] | None:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None

    try:
        doc = fitz.open(file_path)
    except Exception:
        return None

    pages: list[str] = []
    for i in range(doc.page_count):
        text = doc[i].get_text("text").strip()
        pages.append(text if text else f"(페이지 {i + 1} — 추출된 텍스트 없음)")
    doc.close()

    full = "\n\n".join(pages).strip()
    if len(full.replace("— 추출된 텍스트 없음", "")) < 30:
        return None
    return pages, full
