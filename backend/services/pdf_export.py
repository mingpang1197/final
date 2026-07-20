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
    css = """
    @font-face {
      font-family: "Nanum Gothic";
      src: url("nanumgothic-regular.ttf");
    }
    body {
      font-family: "Nanum Gothic", sans-serif;
      font-size: 14px;
      line-height: 1.35;
      color: #21272a;
    }
    p.body {
      margin: 0 0 8px 0;
    }
    p.heading {
      margin: 16px 0 8px 0;
      font-size: 17px;
      font-weight: bold;
    }
    table.section-row {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 20px 0;
    }
    td.section-image {
      width: 32%;
      vertical-align: top;
      padding: 8px 12px 8px 0;
      background: #f5f0e8;
    }
    td.section-image img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    td.section-body {
      vertical-align: top;
      padding: 8px 0;
    }
    p.image-block {
      margin: 8px 0 12px 0;
    }
    p.image-block img {
      max-width: 230px;
      height: auto;
    }
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


def _section_with_image_html(
    section,
    section_placements: list[ImagePlacement],
) -> str:
    blocks: list[str] = []
    if section.heading:
        heading_html = _line_to_html(section.heading)
        if heading_html:
            blocks.append(heading_html)

    img_tags: list[str] = []
    seen: set[str] = set()
    for placement in section_placements:
        key = f"{placement.image_file}:{placement.image_url or ''}"
        if key in seen:
            continue
        tag = _image_to_img_tag(placement.image_file, placement.image_url)
        if tag:
            img_tags.append(tag)
            seen.add(key)

    body_html = _lines_to_html(section.body_lines)

    if img_tags:
        blocks.append(
            "<table class=\"section-row\"><tr>"
            f'<td class="section-image">{"".join(img_tags)}</td>'
            f'<td class="section-body">{body_html}</td>'
            "</tr></table>"
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
    placements = _collect_placements(doc)
    if placements:
        sections = parse_export_sections(body)
        by_section = align_placements_to_sections(body, placements)
        for section in sections:
            section_html = _section_with_image_html(
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
