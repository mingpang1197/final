from __future__ import annotations

"""원본 PDF 페이지는 그대로 두고 「이유」가 있는 페이지 뒤에 이지리드 PDF만 끼워 넣는다.

Word/LibreOffice(docx→pdf)가 없을 때 export.pdf 폴백용. pdf2docx와 병행 가능.
"""

import io
import logging
import re
from pathlib import Path

import fitz

from backend.models.schemas import DocumentResponse
from backend.services import word_export
from backend.services.judgment_merge import split_judgment_at_reason

logger = logging.getLogger(__name__)

_REASON_LINE = re.compile(r"^이\s*유\s*$")


def _page_has_reason_heading(page: fitz.Page) -> bool:
    text = page.get_text("text") or ""
    for line in text.splitlines():
        if _REASON_LINE.match(line.strip()):
            return True
    blocks = page.get_text("blocks") or []
    for block in blocks:
        if len(block) < 5:
            continue
        block_text = str(block[4] or "")
        for line in block_text.splitlines():
            if _REASON_LINE.match(line.strip()):
                return True
    return False


def find_reason_page_index(pdf: fitz.Document, full_text: str | None) -> int | None:
    for index in range(pdf.page_count):
        if _page_has_reason_heading(pdf.load_page(index)):
            return index

    if full_text and split_judgment_at_reason(full_text):
        for index in range(pdf.page_count):
            page_text = pdf.load_page(index).get_text("text") or ""
            if re.search(r"이\s*유", page_text):
                return index
    return None


def _easy_read_insert_pdf_bytes(doc: DocumentResponse) -> bytes | None:
    from backend.services.docx_to_pdf import DocxToPdfError, convert_docx_bytes_to_pdf
    from backend.services.pdf_export import render_easy_read_insert_html_pdf

    insert_doc = word_export.build_easy_read_insert_document(doc)
    buffer = io.BytesIO()
    insert_doc.save(buffer)
    try:
        return convert_docx_bytes_to_pdf(buffer.getvalue())
    except DocxToPdfError:
        logger.info("easy-read insert: docx2pdf unavailable, using PyMuPDF HTML")
        return render_easy_read_insert_html_pdf(doc)


def merge_original_pdf_with_easy_read(pdf_path: Path, doc: DocumentResponse) -> bytes | None:
    if pdf_path.suffix.lower() != ".pdf" or not pdf_path.is_file():
        return None
    if not word_export.collect_body_text(doc):
        return None

    src = fitz.open(pdf_path)
    try:
        reason_page = find_reason_page_index(src, doc.full_text)
        if reason_page is None:
            logger.info("native pdf merge: 「이유」 페이지 없음")
            return None

        easy_bytes = _easy_read_insert_pdf_bytes(doc)
        if not easy_bytes:
            return None

        easy = fitz.open(stream=easy_bytes, filetype="pdf")
        out = fitz.open()
        try:
            out.insert_pdf(src, from_page=0, to_page=reason_page)
            out.insert_pdf(easy)
            if reason_page + 1 < src.page_count:
                out.insert_pdf(src, from_page=reason_page + 1, to_page=src.page_count - 1)
            return out.tobytes(garbage=4, deflate=True)
        finally:
            easy.close()
    finally:
        src.close()
