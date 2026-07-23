from __future__ import annotations

"""원본 PDF 양식 유지 3단 병합: [이유 제목줄까지] + [이지리드 PDF] + [이유 다음 나머지]."""

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


def _reason_heading_rect(page: fitz.Page) -> fitz.Rect | None:
    data = page.get_text("dict") or {}
    for block in data.get("blocks") or []:
        if block.get("type") != 0:
            continue
        for line in block.get("lines") or []:
            spans = line.get("spans") or []
            line_text = "".join(str(s.get("text") or "") for s in spans)
            if _REASON_LINE.match(line_text.strip()):
                bbox = line.get("bbox")
                if bbox and len(bbox) >= 4:
                    return fitz.Rect(bbox)
    for label in ("이 유", "이유", "이  유"):
        for rect in page.search_for(label):
            expanded = fitz.Rect(rect.x0 - 2, rect.y0 - 2, rect.x1 + 2, rect.y1 + 2)
            sample = (page.get_text("text", clip=expanded) or "").strip()
            compact = re.sub(r"\s+", " ", sample)
            if _REASON_LINE.match(compact) or compact in ("이유", "이 유"):
                return fitz.Rect(rect)
    return None


def _page_has_reason_heading(page: fitz.Page) -> bool:
    return _reason_heading_rect(page) is not None


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


def find_reason_heading_position(doc: fitz.Document) -> tuple[int, fitz.Rect] | None:
    for index in range(doc.page_count):
        rect = _reason_heading_rect(doc.load_page(index))
        if rect is not None:
            return index, rect
    return None


def _append_clipped_page(out: fitz.Document, src: fitz.Document, page_number: int, clip: fitz.Rect) -> None:
    src_page = src[page_number]
    clip = clip & src_page.rect
    if clip.is_empty or clip.height < 8:
        return
    new_page = out.new_page(width=clip.width, height=clip.height)
    target = fitz.Rect(0, 0, clip.width, clip.height)
    new_page.show_pdf_page(target, src, page_number, clip=clip)


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


def merge_pdf_three_part_with_easy_read(pdf_path: Path, doc: DocumentResponse) -> bytes | None:
    """이유 제목줄까지 원문 → 이지리드 → 이유 다음 원문 나머지."""
    if pdf_path.suffix.lower() != ".pdf" or not pdf_path.is_file():
        return None
    if not word_export.collect_body_text(doc):
        return None

    src = fitz.open(pdf_path)
    try:
        found = find_reason_heading_position(src)
        if found is None:
            logger.info("pdf 3-part merge: 「이유」 좌표 없음")
            return None

        reason_page, reason_rect = found
        easy_bytes = _easy_read_insert_pdf_bytes(doc)
        if not easy_bytes:
            return None

        easy = fitz.open(stream=easy_bytes, filetype="pdf")
        out = fitz.open()
        try:
            page = src[reason_page]
            split_y = min(reason_rect.y1 + 6, page.rect.y1)

            if reason_page > 0:
                out.insert_pdf(src, from_page=0, to_page=reason_page - 1)

            prefix_clip = fitz.Rect(page.rect.x0, page.rect.y0, page.rect.x1, split_y)
            _append_clipped_page(out, src, reason_page, prefix_clip)

            out.insert_pdf(easy)

            suffix_clip = fitz.Rect(page.rect.x0, split_y, page.rect.x1, page.rect.y1)
            _append_clipped_page(out, src, reason_page, suffix_clip)

            if reason_page + 1 < src.page_count:
                out.insert_pdf(src, from_page=reason_page + 1, to_page=src.page_count - 1)

            logger.info(
                "pdf 3-part merge: page=%d split_y=%.1f pages_out=%d",
                reason_page,
                split_y,
                out.page_count,
            )
            return out.tobytes(garbage=4, deflate=True)
        finally:
            easy.close()
    finally:
        src.close()


def merge_original_pdf_with_easy_read(pdf_path: Path, doc: DocumentResponse) -> bytes | None:
    return merge_pdf_three_part_with_easy_read(pdf_path, doc)
