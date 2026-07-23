from __future__ import annotations

"""이지리드 직후 원문 suffix — 빈 A4·제목(1./가.)과 본문(1)) 분리 방지."""

import logging
import re

import fitz

from backend.services.pdf_compact import _visible_content_rect
from backend.services.pdf_page_numbers import (
    PAGE_NUMBER_FOOTER_RESERVE_PT,
    clip_excluding_footer,
    page_height_with_number_footer,
)

logger = logging.getLogger(__name__)

_GA_HEADING = re.compile(r"^[가-하]\.\s")
_NUM_HEADING = re.compile(r"^\d+\.\s")
_SUFFIX_GAP_PT = 8.0


def _line_plain(line: dict) -> str:
    return "".join(str(s.get("text") or "") for s in line.get("spans") or []).strip()


def _is_ga_subheading(text: str) -> bool:
    t = text.strip()
    return bool(_GA_HEADING.match(t)) and len(t) < 120


def _is_judgment_tail_heading(text: str) -> bool:
    """suffix 끝에 붙은 채 다음 페이지로 넘어가면 고아가 되기 쉬운 줄."""
    t = text.strip()
    if _is_ga_subheading(t):
        return True
    if _NUM_HEADING.match(t) and len(t) < 100:
        return True
    if "상고이유" in t and len(t) < 48:
        return True
    return False


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


def _split_trailing_heading_block(
    page: fitz.Page,
    clip: fitz.Rect,
) -> tuple[fitz.Rect | None, fitz.Rect | None]:
    lines = _text_lines_in_clip(page, clip)
    if not lines:
        return clip, None

    if all(_is_judgment_tail_heading(text) for _, _, text in lines):
        return None, clip

    tail_from = len(lines)
    for index in range(len(lines) - 1, -1, -1):
        if _is_judgment_tail_heading(lines[index][2]):
            tail_from = index
        else:
            break

    if tail_from >= len(lines):
        return clip, None

    tail_y0 = lines[tail_from][0]
    if tail_y0 <= clip.y0 + 4:
        return None, clip

    body = fitz.Rect(clip.x0, clip.y0, clip.x1, max(clip.y0, tail_y0 - 2))
    tail = fitz.Rect(clip.x0, max(clip.y0, tail_y0 - 2), clip.x1, clip.y1)
    if body.height < 6:
        body = None
    if tail.height < 4:
        return clip, None
    return body, tail


def _next_page_body_clip(src: fitz.Document, next_page_num: int) -> fitz.Rect:
    next_page = src[next_page_num]
    next_body = _visible_content_rect(next_page, margin=4) or next_page.rect
    return clip_excluding_footer(next_page, next_body & next_page.rect)


def _stack_fits_on_page(top_h: float, next_h: float, page_h: float) -> bool:
    return top_h + _SUFFIX_GAP_PT + next_h + PAGE_NUMBER_FOOTER_RESERVE_PT <= page_h + 1


def _append_reason_clip_then_next_page(
    out: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    top_clip: fitz.Rect,
    next_page_num: int,
    page_w: float,
    page_h: float,
) -> bool:
    if top_clip.is_empty or top_clip.height < 4:
        return False
    next_body = _next_page_body_clip(src, next_page_num)
    if next_body.is_empty or next_body.height < 12:
        return False
    if not _stack_fits_on_page(top_clip.height, next_body.height, page_h):
        return False

    stack_h = top_clip.height + _SUFFIX_GAP_PT + next_body.height
    total_h = page_height_with_number_footer(stack_h)
    out_page = out.new_page(width=page_w, height=total_h)
    y = 0.0
    out_page.show_pdf_page(
        fitz.Rect(0, y, page_w, y + top_clip.height),
        src,
        reason_page,
        clip=top_clip,
    )
    y += top_clip.height + _SUFFIX_GAP_PT
    out_page.show_pdf_page(
        fitz.Rect(0, y, page_w, y + next_body.height),
        src,
        next_page_num,
        clip=next_body,
    )
    return True


def _append_compact_clip(
    out: fitz.Document,
    src: fitz.Document,
    page_number: int,
    clip: fitz.Rect,
    page_w: float,
) -> None:
    if clip.is_empty or clip.height < 6:
        return
    lines = _text_lines_in_clip(src[page_number], clip)
    if lines and all(_is_judgment_tail_heading(text) for _, _, text in lines):
        return
    total_h = page_height_with_number_footer(clip.height)
    page = out.new_page(width=page_w, height=total_h)
    page.show_pdf_page(fitz.Rect(0, 0, page_w, clip.height), src, page_number, clip=clip)


def _append_suffix_via_full_pages(
    out: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    split_y: float,
) -> None:
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


def _union_clip_vertical(a: fitz.Rect, b: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(a.x0, min(a.y0, b.y0), a.x1, max(a.y1, b.y1))


def append_judgment_suffix_after_easy_read(
    out: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    suffix_clip: fitz.Rect,
) -> None:
    """이지리드 다음 — suffix를 다음 원문 페이지와 한 장에 이을 수 있으면 이음."""
    src_page = src[reason_page]
    page_w = src_page.rect.width
    page_h = src_page.rect.height
    suffix_clip = clip_excluding_footer(src_page, suffix_clip & src_page.rect)

    if suffix_clip.is_empty or suffix_clip.height < 8:
        if reason_page + 1 < src.page_count:
            out.insert_pdf(src, from_page=reason_page + 1, to_page=src.page_count - 1)
        return

    has_next = reason_page + 1 < src.page_count

    if has_next and _append_reason_clip_then_next_page(
        out, src, reason_page, suffix_clip, reason_page + 1, page_w, page_h
    ):
        if reason_page + 2 < src.page_count:
            out.insert_pdf(src, from_page=reason_page + 2, to_page=src.page_count - 1)
        logger.info("suffix merge: glued full suffix clip with next source page")
        return

    body_clip, tail_clip = _split_trailing_heading_block(src_page, suffix_clip)
    glue_clip: fitz.Rect | None = None
    if tail_clip and not tail_clip.is_empty:
        glue_clip = tail_clip
        if body_clip and not body_clip.is_empty:
            glue_clip = _union_clip_vertical(body_clip, tail_clip)

    if (
        has_next
        and glue_clip is not None
        and _append_reason_clip_then_next_page(
            out, src, reason_page, glue_clip, reason_page + 1, page_w, page_h
        )
    ):
        if reason_page + 2 < src.page_count:
            out.insert_pdf(src, from_page=reason_page + 2, to_page=src.page_count - 1)
        logger.info("suffix merge: glued heading block with next source page")
        return

    if body_clip and body_clip.height >= 6:
        _append_compact_clip(out, src, reason_page, body_clip, page_w)

    if tail_clip and tail_clip.height >= 4:
        _append_compact_clip(out, src, reason_page, tail_clip, page_w)

    if has_next:
        out.insert_pdf(src, from_page=reason_page + 1, to_page=src.page_count - 1)
        return

    split_y = suffix_clip.y0
    _append_suffix_via_full_pages(out, src, reason_page, split_y)
