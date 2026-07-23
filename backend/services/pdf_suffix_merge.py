from __future__ import annotations

"""이지리드 직후 원문 suffix — 빈 A4·소제목 고아(가. / 1)) 방지."""

import logging
import re

import fitz

from backend.services.pdf_compact import _visible_content_rect
from backend.services.pdf_page_numbers import (
    clip_excluding_footer,
    page_height_with_number_footer,
)

logger = logging.getLogger(__name__)

_GA_HEADING = re.compile(r"^[가-하]\.\s")
_SUFFIX_GAP_PT = 8.0


def _line_plain(line: dict) -> str:
    return "".join(str(s.get("text") or "") for s in line.get("spans") or []).strip()


def _is_ga_subheading(text: str) -> bool:
    t = text.strip()
    return bool(_GA_HEADING.match(t)) and len(t) < 120


def _text_lines_in_clip(page: fitz.Page, clip: fitz.Rect) -> list[tuple[float, float, str]]:
    rows: list[tuple[float, float, str]] = []
    for block in (page.get_text("dict") or {}).get("blocks") or []:
        if block.get("type") != 0:
            continue
        for line in block.get("lines") or []:
            bbox = line.get("bbox")
            if not bbox or len(bbox) < 4:
                continue
            rect = fitz.Rect(bbox)
            if not rect.intersects(clip):
                continue
            text = _line_plain(line)
            if not text or re.match(r"^\s*-\s*\d+\s*-\s*$", text):
                continue
            rows.append((float(bbox[1]), float(bbox[3]), text))
    rows.sort(key=lambda item: item[0])
    return rows


def _split_trailing_ga_heading_clip(
    page: fitz.Page,
    clip: fitz.Rect,
) -> tuple[fitz.Rect | None, fitz.Rect | None]:
    """클립 끝의 「가. …」 소제목만 분리(본문 1)은 다음 페이지)."""
    lines = _text_lines_in_clip(page, clip)
    if not lines:
        return clip, None

    tail_from = len(lines)
    for index in range(len(lines) - 1, -1, -1):
        if _is_ga_subheading(lines[index][2]):
            tail_from = index
        else:
            break

    if tail_from >= len(lines):
        return clip, None

    tail_y0 = lines[tail_from][0]
    if tail_y0 <= clip.y0 + 4:
        return None, clip

    body = fitz.Rect(clip.x0, clip.y0, clip.x1, max(clip.y0, tail_y0 - 2))
    heading = fitz.Rect(clip.x0, max(clip.y0, tail_y0 - 2), clip.x1, clip.y1)
    if body.height < 6:
        body = None
    if heading.height < 4:
        return clip, None
    return body, heading


def _append_compact_clip(
    out: fitz.Document,
    src: fitz.Document,
    page_number: int,
    clip: fitz.Rect,
    page_w: float,
) -> None:
    if clip.is_empty or clip.height < 6:
        return
    total_h = page_height_with_number_footer(clip.height)
    page = out.new_page(width=page_w, height=total_h)
    page.show_pdf_page(fitz.Rect(0, 0, page_w, clip.height), src, page_number, clip=clip)


def _append_ga_heading_with_next_page(
    out: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    heading_clip: fitz.Rect,
    next_page_num: int,
    page_w: float,
    page_h: float,
) -> bool:
    """「가. …」 직후 원문 다음 페이지 본문을 같은 출력 페이지에 이어 붙임."""
    next_page = src[next_page_num]
    next_body = _visible_content_rect(next_page, margin=4) or next_page.rect
    next_body = clip_excluding_footer(next_page, next_body & next_page.rect)
    if next_body.is_empty or next_body.height < 12:
        return False

    stack_h = heading_clip.height + _SUFFIX_GAP_PT + next_body.height
    if stack_h + 42 > page_h + 1:
        return False

    total_h = page_height_with_number_footer(stack_h)
    out_page = out.new_page(width=page_w, height=total_h)
    y = 0.0
    out_page.show_pdf_page(
        fitz.Rect(0, y, page_w, y + heading_clip.height),
        src,
        reason_page,
        clip=heading_clip,
    )
    y += heading_clip.height + _SUFFIX_GAP_PT
    out_page.show_pdf_page(
        fitz.Rect(0, y, page_w, y + next_body.height),
        src,
        next_page_num,
        clip=next_body,
    )
    return True


def _append_suffix_via_full_pages(
    out: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    split_y: float,
) -> None:
    """원문 페이지 단위 삽입 — 첫 페이지는 split_y 위 가림."""
    start = out.page_count
    out.insert_pdf(src, from_page=reason_page, to_page=src.page_count - 1)
    if out.page_count <= start:
        return
    first = out[start]
    src_page = src[reason_page]
    if split_y > src_page.rect.y0 + 2:
        mask = fitz.Rect(src_page.rect.x0, src_page.rect.y0, src_page.rect.x1, split_y)
        mask = mask & first.rect
        if not mask.is_empty:
            first.add_redact_annot(mask, fill=(1, 1, 1))
            first.apply_redactions()


def append_judgment_suffix_after_easy_read(
    out: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    suffix_clip: fitz.Rect,
) -> None:
    """이지리드 다음 — suffix 빈 페이지·가./1) 분리 완화."""
    src_page = src[reason_page]
    page_w = src_page.rect.width
    page_h = src_page.rect.height
    suffix_clip = clip_excluding_footer(src_page, suffix_clip & src_page.rect)

    if suffix_clip.is_empty or suffix_clip.height < 8:
        if reason_page + 1 < src.page_count:
            out.insert_pdf(src, from_page=reason_page + 1, to_page=src.page_count - 1)
        return

    body_clip, heading_clip = _split_trailing_ga_heading_clip(src_page, suffix_clip)

    if body_clip and body_clip.height >= 6:
        _append_compact_clip(out, src, reason_page, body_clip, page_w)

    if (
        heading_clip
        and heading_clip.height >= 4
        and reason_page + 1 < src.page_count
        and _append_ga_heading_with_next_page(
            out,
            src,
            reason_page,
            heading_clip,
            reason_page + 1,
            page_w,
            page_h,
        )
    ):
        if reason_page + 2 < src.page_count:
            out.insert_pdf(src, from_page=reason_page + 2, to_page=src.page_count - 1)
        logger.info("suffix merge: glued ga-heading with following source page")
        return

    if heading_clip and heading_clip.height >= 4:
        _append_compact_clip(out, src, reason_page, heading_clip, page_w)
        if reason_page + 1 < src.page_count:
            out.insert_pdf(src, from_page=reason_page + 1, to_page=src.page_count - 1)
        return

    split_y = suffix_clip.y0
    _append_suffix_via_full_pages(out, src, reason_page, split_y)
