from __future__ import annotations

"""PDF 병합 전 이지리드 PDF 여백·빈 페이지 정리."""

import fitz


def _page_text_len(page: fitz.Page) -> int:
    return len((page.get_text("text") or "").replace("\n", "").strip())


def _visible_content_rect(page: fitz.Page, *, margin: float = 6) -> fitz.Rect | None:
    union: fitz.Rect | None = None
    data = page.get_text("dict") or {}
    for block in data.get("blocks") or []:
        if block.get("type") != 0:
            continue
        bbox = block.get("bbox")
        if bbox and len(bbox) >= 4:
            r = fitz.Rect(bbox)
            union = r if union is None else union | r
    try:
        for img in page.get_image_info(xrefs=True) or []:
            bbox = img.get("bbox")
            if bbox:
                r = fitz.Rect(bbox)
                union = r if union is None else union | r
    except (AttributeError, TypeError):
        pass
    if union is None or union.is_empty:
        return None
    expanded = fitz.Rect(
        union.x0 - margin,
        union.y0 - margin,
        union.x1 + margin,
        union.y1 + margin,
    )
    return expanded & page.rect


def _page_is_blank(page: fitz.Page) -> bool:
    if _page_text_len(page) > 4:
        return False
    rect = _visible_content_rect(page, margin=0)
    return rect is None or rect.height < 12


def compact_pdf_for_insert(doc: fitz.Document) -> fitz.Document:
    """빈 꼬리 페이지 제거 + 각 페이지를 보이는 영역 높이로 잘라 연속 흐름에 맞춤."""
    if doc.page_count == 0:
        return doc

    while doc.page_count > 1 and _page_is_blank(doc[doc.page_count - 1]):
        doc.delete_page(doc.page_count - 1)

    out = fitz.open()
    for index in range(doc.page_count):
        page = doc[index]
        if _page_is_blank(page):
            continue
        clip = _visible_content_rect(page) or page.rect
        clip = clip & page.rect
        if clip.is_empty or clip.height < 8:
            continue
        w = page.rect.width
        new_page = out.new_page(width=w, height=clip.height)
        new_page.show_pdf_page(fitz.Rect(0, 0, w, clip.height), doc, index, clip=clip)
    if out.page_count == 0:
        return doc
    return out


def _append_clipped(
    out: fitz.Document,
    doc: fitz.Document,
    page_number: int,
    clip: fitz.Rect,
    page_w: float,
) -> None:
    clip = clip & doc[page_number].rect
    if clip.is_empty or clip.height < 8:
        return
    new_page = out.new_page(width=page_w, height=clip.height)
    new_page.show_pdf_page(fitz.Rect(0, 0, page_w, clip.height), doc, page_number, clip=clip)


def append_easy_read_then_suffix(
    out: fitz.Document,
    easy: fitz.Document,
    src: fitz.Document,
    reason_page: int,
    suffix_clip: fitz.Rect,
    *,
    gap_pt: float = 10,
) -> None:
    """이지리드 직후 원문 suffix — 마지막 이지리드 페이지에 공간 있으면 같은 페이지에 이어 붙임."""
    src_page = src[reason_page]
    suffix_clip = suffix_clip & src_page.rect
    page_w = src_page.rect.width
    page_h = src_page.rect.height

    if suffix_clip.is_empty or suffix_clip.height < 8:
        if easy.page_count:
            out.insert_pdf(easy)
        return

    if easy.page_count == 0:
        _append_clipped(out, src, reason_page, suffix_clip, page_w)
        return

    if easy.page_count > 1:
        out.insert_pdf(easy, from_page=0, to_page=easy.page_count - 2)

    last_idx = easy.page_count - 1
    last_page = easy[last_idx]
    easy_clip = _visible_content_rect(last_page) or last_page.rect
    easy_clip = easy_clip & last_page.rect
    easy_h = easy_clip.height
    suffix_h = suffix_clip.height
    combined = easy_h + gap_pt + suffix_h

    if combined <= page_h + 1:
        new_page = out.new_page(width=page_w, height=combined)
        y = 0.0
        dest = fitz.Rect(0, y, page_w, y + easy_h)
        new_page.show_pdf_page(dest, easy, last_idx, clip=easy_clip)
        y += easy_h + gap_pt
        dest = fitz.Rect(0, y, page_w, y + suffix_h)
        new_page.show_pdf_page(dest, src, reason_page, clip=suffix_clip)
        return

    _append_clipped(out, easy, last_idx, easy_clip, page_w)
    _append_clipped(out, src, reason_page, suffix_clip, page_w)
