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
    from backend.services.pdf_page_numbers import page_height_with_number_footer

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
        total_h = page_height_with_number_footer(clip.height)
        new_page = out.new_page(width=w, height=total_h)
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
    from backend.services.pdf_page_numbers import page_height_with_number_footer

    clip = clip & doc[page_number].rect
    if clip.is_empty or clip.height < 8:
        return
    total_h = page_height_with_number_footer(clip.height)
    new_page = out.new_page(width=page_w, height=total_h)
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
    """이지리드 PDF 전체 삽입 후, 원문 suffix(이유 본문)는 항상 새 페이지부터."""
    from backend.services.pdf_page_numbers import clip_excluding_footer

    src_page = src[reason_page]
    suffix_clip = clip_excluding_footer(src_page, suffix_clip & src_page.rect)
    page_w = src_page.rect.width
    page_h = src_page.rect.height

    if easy.page_count:
        out.insert_pdf(easy)

    if suffix_clip.is_empty or suffix_clip.height < 8:
        return

    new_page = out.new_page(width=page_w, height=page_h)
    dest = fitz.Rect(0, 0, page_w, suffix_clip.height)
    new_page.show_pdf_page(dest, src, reason_page, clip=suffix_clip)
