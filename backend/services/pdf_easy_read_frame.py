from __future__ import annotations

"""이지리드 PDF — Word 표 테두리가 PDF 변환에서 빠질 때 보이는 프레임."""

import fitz

from backend.services.pdf_compact import _visible_content_rect

_FRAME_COLOR = (0.72, 0.69, 0.64)
_FRAME_PAD = 10.0
_FRAME_WIDTH = 1.4


def decorate_easy_read_pdf(doc: fitz.Document) -> fitz.Document:
    """각 이지리드 페이지 본문 주변에 글상자 테두리(베이지 톤)를 그린다."""
    if doc.page_count == 0:
        return doc

    for index in range(doc.page_count):
        page = doc[index]
        content = _visible_content_rect(page, margin=4)
        if content is None or content.is_empty or content.height < 12:
            continue
        frame = fitz.Rect(content)
        frame.x0 = max(page.rect.x0, frame.x0 - _FRAME_PAD)
        frame.y0 = max(page.rect.y0, frame.y0 - _FRAME_PAD)
        frame.x1 = min(page.rect.x1, frame.x1 + _FRAME_PAD)
        frame.y1 = min(page.rect.y1, frame.y1 + _FRAME_PAD)
        fill = (0.96, 0.94, 0.91)
        page.draw_rect(
            frame,
            color=fill,
            fill=fill,
            width=0,
            overlay=False,
        )
        page.draw_rect(
            frame,
            color=_FRAME_COLOR,
            width=_FRAME_WIDTH,
            overlay=True,
        )
    return doc
