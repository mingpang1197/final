from __future__ import annotations

"""원본 PDF 텍스트 레이어에서 글꼴 이름·크기 추정 (PyMuPDF).

`page.get_fonts()`는 페이지에 등장하는 글꼴 목록만 준다.
이지리드에 맞출 때는 「이유」 아래 본문 span(`get_text("dict")`) 가중치가 더 정확하다.
"""

import logging
from collections import Counter

import fitz

from backend.services.pdf_native_merge import _split_y_after_reason_heading
from backend.services.word_export import BODY_PT, ExportFontProfile, _pick_dominant_font

logger = logging.getLogger(__name__)


def normalize_pdf_font_name(raw: str) -> str:
    """'ABCDEF+CourtBT' → 'CourtBT'."""
    name = (raw or "").strip()
    if not name:
        return name
    if "+" in name:
        name = name.split("+", 1)[1]
    return name.strip()


def _add_fonts_from_get_fonts(page: fitz.Page, weights: Counter[str]) -> None:
    try:
        entries = page.get_fonts(full=True)
    except TypeError:
        entries = page.get_fonts()
    for entry in entries or []:
        if len(entry) < 4:
            continue
        basefont = normalize_pdf_font_name(str(entry[3] or ""))
        if basefont:
            weights[basefont] += 1


def infer_font_profile_from_reason_vicinity_pdf(
    pdf: fitz.Document,
    reason_page: int,
    reason_rect: fitz.Rect,
    *,
    max_chars: int = 4000,
) -> ExportFontProfile | None:
    """「이유」 직후 원문 본문 span + get_fonts()로 ExportFontProfile 추정."""
    if reason_page < 0 or reason_page >= pdf.page_count:
        return None

    page = pdf.load_page(reason_page)
    split_y = _split_y_after_reason_heading(page, reason_rect)

    font_weights: Counter[str] = Counter()
    size_weights: Counter[float] = Counter()
    collected = 0

    data = page.get_text("dict") or {}
    for block in data.get("blocks") or []:
        if block.get("type") != 0:
            continue
        for line in block.get("lines") or []:
            for span in line.get("spans") or []:
                bbox = span.get("bbox")
                if not bbox or len(bbox) < 4:
                    continue
                if float(bbox[1]) < split_y - 1:
                    continue
                text = str(span.get("text") or "")
                if not text.strip():
                    continue
                weight = len(text)
                collected += weight
                font = normalize_pdf_font_name(str(span.get("font") or ""))
                if font:
                    font_weights[font] += weight
                size = span.get("size")
                if size is not None:
                    try:
                        size_weights[float(size)] += weight
                    except (TypeError, ValueError):
                        pass
                if collected >= max_chars:
                    break
            if collected >= max_chars:
                break
        if collected >= max_chars:
            break

    if not font_weights:
        _add_fonts_from_get_fonts(page, font_weights)

    if not font_weights:
        return None

    dominant = _pick_dominant_font(font_weights) or font_weights.most_common(1)[0][0]
    body_pt = size_weights.most_common(1)[0][0] if size_weights else BODY_PT
    logger.info(
        "pdf font infer: page=%d font=%s pt=%.1f samples=%s",
        reason_page,
        dominant,
        body_pt,
        dict(font_weights.most_common(3)),
    )
    return ExportFontProfile(
        ascii=dominant,
        h_ansi=dominant,
        east_asia=dominant,
        body_pt=body_pt,
    )
