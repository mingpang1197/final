from __future__ import annotations

"""이지리드 문서 Word(.docx) 내보내기.

역할: DocumentResponse를 Easy-Read 타이포그래피 규칙에 맞는 Word 파일로 변환한다.
주요 기능: export_to_docx (제목·본문·이미지·쪽번호).
관계: image_assets, image_matcher, models/schemas, routers/documents(export API).
"""

import io
import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

from backend.services.image_assets import resolve_placement_image
from backend.models.schemas import DocumentResponse, ImagePlacement
from backend.services.image_matcher import (
    MAX_IMAGES_PER_TEXT,
    find_images_for_line,
    preview_lines,
)

BODY_PT = 14
HEADING_PT = 17
FOOTER_PT = 11
IMAGE_WIDTH = Inches(3.2)

_SKIP_LINE = re.compile(r"^(---+\s*|\(\d+/\d+\s*쪽\)|\d+/\d+\s*쪽|>\s)")
_META_SECTION_START = re.compile(r"^###\s*수정\s*사항")


def _set_run_font(run, size_pt: float, bold: bool = False) -> None:
    run.font.name = "Malgun Gothic"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
    run.font.size = Pt(size_pt)
    run.font.bold = bold


def _is_heading(line: str) -> bool:
    s = line.strip()
    if s.startswith("<") and s.endswith(">"):
        return True
    if s.startswith("■"):
        return True
    if s.startswith("#"):
        return True
    return False


def _clean_heading(line: str) -> str:
    s = line.strip()
    return re.sub(r"^#+\s*", "", s)


def _configure_section(section) -> None:
    section.top_margin = Inches(1.25)
    section.bottom_margin = Inches(1.25)
    section.left_margin = Inches(1.25)
    section.right_margin = Inches(1.25)
    _set_page_number_footer(section)


def _set_page_number_footer(section) -> None:
    footer = section.footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fp.clear()

    run_prefix = fp.add_run("- ")
    _set_run_font(run_prefix, FOOTER_PT)

    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    run_prefix._r.append(fld_begin)

    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run_prefix._r.append(instr)

    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    run_prefix._r.append(fld_sep)

    run_num = fp.add_run("1")
    _set_run_font(run_num, FOOTER_PT)

    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run_num._r.append(fld_end)

    run_suffix = fp.add_run(" -")
    _set_run_font(run_suffix, FOOTER_PT)


def _add_picture(doc: Document, image_file: str, image_url: str | None = None) -> None:
    img_path = resolve_placement_image(image_file=image_file, image_url=image_url)
    if not img_path:
        return
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(8)
    run = p.add_run()
    run.add_picture(str(img_path), width=IMAGE_WIDTH)


def _add_rich_paragraph(doc: Document, line: str) -> None:
    stripped = line.strip()
    if not stripped or _SKIP_LINE.match(stripped):
        return
    if stripped == "## 수정된 이지리드 번역본":
        return

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    p.paragraph_format.line_spacing = 1.35
    p.paragraph_format.space_after = Pt(6)

    if _is_heading(stripped):
        text = _clean_heading(stripped)
        run = p.add_run(text)
        _set_run_font(run, HEADING_PT, bold=True)
        return

    parts = re.split(r"(\*\*.+?\*\*)", stripped)
    for part in parts:
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = p.add_run(part[2:-2])
            _set_run_font(run, BODY_PT, bold=True)
        else:
            cleaned = part.replace("**", "")
            if cleaned:
                run = p.add_run(cleaned)
                _set_run_font(run, BODY_PT, bold=False)


def _placements_by_line(
    placements: list[ImagePlacement],
) -> dict[int, list[ImagePlacement]]:
    by_line: dict[int, list[ImagePlacement]] = {}
    for placement in placements:
        by_line.setdefault(placement.line_index, []).append(placement)
    return by_line


def _export_text_with_placements(
    doc: Document,
    text: str,
    placements: list[ImagePlacement],
) -> None:
    lines = preview_lines(text)
    by_line = _placements_by_line(placements)
    inserted: set[str] = set()
    for i, line in enumerate(lines):
        _add_rich_paragraph(doc, line)
        for placement in by_line.get(i, []):
            key = f"{placement.image_file}:{placement.image_url or ''}"
            if key in inserted:
                continue
            _add_picture(doc, placement.image_file, placement.image_url)
            inserted.add(key)


def _export_text(doc: Document, text: str, *, skip_meta: bool = True) -> None:
    in_meta_section = False
    inserted_images: set[str] = set()

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        if skip_meta and stripped.startswith("원본 파일:"):
            continue
        if skip_meta and stripped == "## 수정된 이지리드 번역본":
            continue
        if skip_meta and _META_SECTION_START.match(stripped):
            in_meta_section = True
            continue
        if in_meta_section:
            continue

        _add_rich_paragraph(doc, line)

        if len(inserted_images) >= MAX_IMAGES_PER_TEXT:
            continue
        for match in find_images_for_line(
            stripped,
            exclude=inserted_images,
            max_total=MAX_IMAGES_PER_TEXT,
        ):
            _add_picture(doc, match.image_file)
            inserted_images.add(match.image_file)


def _collect_placements(doc: DocumentResponse) -> list[ImagePlacement] | None:
    for segment in doc.translation_segments or []:
        if segment.easy_text and segment.image_placements:
            return segment.image_placements
    return None


def _collect_body_text(doc: DocumentResponse) -> str:
    if doc.translation_text and doc.translation_text.strip():
        return doc.translation_text.strip()
    if doc.translation_segments:
        parts = [
            s.easy_text.strip()
            for s in doc.translation_segments
            if s.easy_text and s.easy_text.strip()
        ]
        if parts:
            return max(parts, key=len)
    if doc.summary and doc.summary.strip():
        return doc.summary.strip()
    return ""


def export_to_docx(doc: DocumentResponse, *, include_meta: bool = False) -> bytes:
    word = Document()

    for section in word.sections:
        _configure_section(section)

    if include_meta:
        title = word.add_heading("이지리드 판결문", level=0)
        for run in title.runs:
            _set_run_font(run, 18, bold=True)
        meta = word.add_paragraph(f"원본 파일: {doc.filename}  |  유형: {doc.doc_type}")
        meta.alignment = WD_ALIGN_PARAGRAPH.LEFT

    body = _collect_body_text(doc)
    if body:
        placements = _collect_placements(doc)
        if placements:
            _export_text_with_placements(word, body, placements)
        else:
            _export_text(word, body, skip_meta=not include_meta)

    buffer = io.BytesIO()
    word.save(buffer)
    return buffer.getvalue()
