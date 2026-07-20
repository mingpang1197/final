from __future__ import annotations

"""이지리드 문서 PDF 내보내기.

역할: DocumentResponse를 Easy-Read 타이포그래피 규칙에 맞는 PDF로 변환한다.
주요 기능: export_to_pdf (본문·이미지·2단 섹션 레이아웃).
관계: word_export(본문 수집), image_assets, export_layout, routers/documents.
"""

import base64
import html
import io
import mimetypes
import os
import re
from pathlib import Path

import fitz  # PyMuPDF

from backend.models.schemas import DocumentResponse, ImagePlacement
from backend.services.export_layout import (
    align_placements_to_sections,
    is_image_placeholder,
    parse_export_sections,
    prepare_placements_for_export,
)
from backend.services.image_assets import resolve_placement_image
from backend.services.image_matcher import MAX_IMAGES_PER_TEXT, find_images_for_line
from backend.services.word_export import (
    _META_SECTION_START,
    _SKIP_LINE,
    _clean_heading,
    _collect_body_text,
    _collect_placements,
    _is_heading,
)

FONT_URL = (
    "https://github.com/google/fonts/raw/main/ofl/nanumgothic/NanumGothic-Regular.ttf"
)
PAGE_WIDTH = 595.28
PAGE_HEIGHT = 841.89
MARGIN = 72
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
IMAGE_COL_PT = round(CONTENT_WIDTH * 0.32)
IMAGE_INSET_PT = IMAGE_COL_PT - 12
IMAGE_MAX_HEIGHT_PT = 130

_BOLD = re.compile(r"\*\*(.+?)\*\*")


def _font_dir() -> Path:
    bundled_dir = Path(__file__).resolve().parent.parent / "assets" / "fonts"
    bundled = bundled_dir / "NanumGothic-Regular.ttf"
    if bundled.exists():
        return bundled_dir
    cache_dir = Path(os.environ.get("TMPDIR", os.environ.get("TEMP", "/tmp")))
    cached = cache_dir / "nanumgothic-regular.ttf"
    if not cached.exists():
        import httpx

        response = httpx.get(FONT_URL, timeout=30.0, follow_redirects=True)
        response.raise_for_status()
        cached.write_bytes(response.content)
    return cache_dir


def _font_css() -> tuple[str, fitz.Archive]:
    font_dir = _font_dir()
    archive = fitz.Archive(str(font_dir))
    css = f"""
    @font-face {{
      font-family: "Nanum Gothic";
      src: url("nanumgothic-regular.ttf");
    }}
    body {{
      font-family: "Nanum Gothic", sans-serif;
      font-size: 14px;
      line-height: 1.35;
      color: #21272a;
    }}
    p.body {{
      margin: 0 0 8px 0;
    }}
    p.heading {{
      margin: 16px 0 8px 0;
      font-size: 17px;
      font-weight: bold;
    }}
    div.section-row {{
      width: 100%;
      overflow: hidden;
      margin: 0 0 20px 0;
    }}
    div.image-col {{
      float: left;
      width: {IMAGE_COL_PT}pt;
      background: #f5f0e8;
      padding: 8px 8px 8px 0;
      box-sizing: border-box;
    }}
    img.section-img {{
      width: {IMAGE_INSET_PT}pt;
      max-height: {IMAGE_MAX_HEIGHT_PT}pt;
      height: auto;
      display: block;
    }}
    div.image-empty {{
      min-height: {IMAGE_MAX_HEIGHT_PT}pt;
    }}
    div.body-col {{
      margin-left: {IMAGE_COL_PT}pt;
      padding: 8px 0 8px 4px;
    }}
    p.image-block {{
      margin: 8px 0 12px 0;
    }}
    p.image-block img {{
      max-width: 230px;
      height: auto;
    }}
    """
    return css, archive


def _line_to_html(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or _SKIP_LINE.match(stripped):
        return None
    if stripped == "## 수정된 이지리드 번역본":
        return None
    if is_image_placeholder(stripped):
        return None

    if _is_heading(stripped):
        text = html.escape(_clean_heading(stripped))
        return f'<p class="heading">{text}</p>'

    parts = _BOLD.split(stripped)
    chunks: list[str] = []
    for i, part in enumerate(parts):
        if not part:
            continue
        escaped = html.escape(part.replace("**", ""))
        if i % 2 == 1:
            chunks.append(f"<strong>{escaped}</strong>")
        else:
            chunks.append(escaped)
    return f'<p class="body">{"".join(chunks)}</p>'


def _lines_to_html(lines: list[str]) -> str:
    return "".join(block for line in lines if (block := _line_to_html(line)))


def _image_to_img_tag(image_file: str, image_url: str | None = None) -> str | None:
    img_path = resolve_placement_image(image_file=image_file, image_url=image_url)
    if not img_path:
        return None
    mime = mimetypes.guess_type(str(img_path))[0] or "image/png"
    encoded = base64.b64encode(img_path.read_bytes()).decode("ascii")
    return f'<img src="data:{mime};base64,{encoded}" alt="" />'


def _placement_to_img_tag(placement: ImagePlacement) -> str | None:
    raw = (placement.image_base64 or "").strip()
    if raw:
        src = raw if raw.startswith("data:") else f"data:image/png;base64,{raw}"
        return (
            f'<img class="section-img" src="{src}" '
            f'width="{IMAGE_INSET_PT}" alt="" />'
        )
    file_tag = _image_to_img_tag(placement.image_file, placement.image_url)
    if not file_tag:
        return None
    return file_tag.replace("<img ", f'<img class="section-img" width="{IMAGE_INSET_PT}" ', 1)


def _section_block_html(
    section,
    section_placements: list[ImagePlacement],
) -> str:
    """소제목(전체 너비) + 2단(왼쪽 그림 / 오른쪽 본문) — 그림 탭과 동일."""
    blocks: list[str] = []
    if section.heading:
        heading_html = _line_to_html(section.heading)
        if heading_html:
            blocks.append(heading_html)

    img_tags: list[str] = []
    placement = section_placements[0] if section_placements else None
    if placement:
        tag = _placement_to_img_tag(placement)
        if tag:
            img_tags.append(tag)

    body_html = _lines_to_html(section.body_lines)
    row_open = '<div class="section-row">'
    row_close = "</div>"

    if section.heading:
        image_cell = "".join(img_tags) if img_tags else '<div class="image-empty">&nbsp;</div>'
        blocks.append(
            f"{row_open}"
            f'<div class="image-col">{image_cell}</div>'
            f'<div class="body-col">{body_html}</div>'
            f"{row_close}"
        )
    elif img_tags:
        blocks.append(
            f"{row_open}"
            f'<div class="image-col">{"".join(img_tags)}</div>'
            f'<div class="body-col">{body_html}</div>'
            f"{row_close}"
        )
    elif body_html:
        blocks.append(body_html)

    return "".join(blocks)


def _build_html(doc: DocumentResponse) -> tuple[str, str]:
    body = _collect_body_text(doc)
    if not body:
        css, _ = _font_css()
        return "<body></body>", css

    blocks: list[str] = []
    sections = parse_export_sections(body)
    raw_placements = _collect_placements(doc) or []
    placements = prepare_placements_for_export(body, raw_placements)
    has_section_layout = any(section.heading for section in sections)

    if has_section_layout:
        by_section = align_placements_to_sections(body, placements)
        for section in sections:
            section_html = _section_block_html(
                section,
                by_section.get(section.start_line_index, []),
            )
            if section_html:
                blocks.append(section_html)
    elif placements:
        by_section = align_placements_to_sections(body, placements)
        for section in sections:
            section_html = _section_block_html(
                section,
                by_section.get(section.start_line_index, []),
            )
            if section_html:
                blocks.append(section_html)
    else:
        in_meta_section = False
        inserted_images: set[str] = set()
        for line in body.split("\n"):
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("원본 파일:"):
                continue
            if stripped == "## 수정된 이지리드 번역본":
                continue
            if _META_SECTION_START.match(stripped):
                in_meta_section = True
                continue
            if in_meta_section:
                continue

            line_html = _line_to_html(line)
            if line_html:
                blocks.append(line_html)

            if len(inserted_images) >= MAX_IMAGES_PER_TEXT:
                continue
            for match in find_images_for_line(
                stripped,
                exclude=inserted_images,
                max_total=MAX_IMAGES_PER_TEXT,
            ):
                tag = _image_to_img_tag(match.image_file)
                if tag:
                    blocks.append(f'<p class="image-block">{tag}</p>')
                    inserted_images.add(match.image_file)

    css, _ = _font_css()
    content = "\n".join(blocks)
    return f"<html><head></head><body>{content}</body></html>", css


def export_to_pdf(doc: DocumentResponse) -> bytes:
    story_html, story_css = _build_html(doc)
    _, archive = _font_css()
    story = fitz.Story(html=story_html, user_css=story_css, archive=archive)

    mediabox = fitz.Rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    where = fitz.Rect(MARGIN, MARGIN, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN)

    def rectfn(_rect_num: int, _filled: fitz.Rect) -> tuple[fitz.Rect, fitz.Rect, fitz.Matrix]:
        return mediabox, where, fitz.Identity

    stream = io.BytesIO()
    writer = fitz.DocumentWriter(stream)
    story.write(writer, rectfn)
    writer.close()
    return stream.getvalue()
