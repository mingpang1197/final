from __future__ import annotations

"""이지리드 문서 Word(.docx) 내보내기.

역할: DocumentResponse를 Easy-Read 타이포그래피 규칙에 맞는 Word 파일로 변환한다.
주요 기능: export_to_docx — 소제목 + 3×3 표(왼쪽 그림 / 오른쪽 본문, 가이드 그림 45).
관계: export_layout, image_assets, models/schemas, routers/documents(export API).
"""

import base64
import io
import re
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt

from backend.models.schemas import DocumentResponse, ImagePlacement
from backend.services.export_layout import (
    align_placements_to_items,
    is_image_placeholder,
    parse_export_sections,
    parse_section_items,
    prepare_placements_for_export,
)
from backend.services.image_assets import resolve_placement_image
from backend.services.image_matcher import MAX_IMAGES_PER_TEXT, find_images_for_line

BODY_PT = 14
HEADING_PT = 17
FOOTER_PT = 11
LINE_SPACING = 2.0  # 200% (이지리드 가이드)
IMAGE_COL_WIDTH = Inches(2.05)
GAP_COL_WIDTH = Inches(0.12)
BODY_COL_WIDTH = Inches(3.83)
IMAGE_DISPLAY_WIDTH = Inches(1.85)
IMAGE_CELL_FILL = "F5F0E8"

_SKIP_LINE = re.compile(r"^(---+\s*|\(\d+/\d+\s*쪽\)|\d+/\d+\s*쪽|>\s)")
_META_SECTION_START = re.compile(r"^###\s*수정\s*사항")
_BOLD = re.compile(r"\*\*(.+?)\*\*")


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
    return s.startswith("#")


def _clean_heading(line: str) -> str:
    return re.sub(r"^#+\s*", "", line.strip())


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


def _remove_table_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "nil")
        borders.append(element)
    tbl_pr.append(borders)


def _set_cell_shading(cell, fill_hex: str) -> None:
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill_hex)
    shading.set(qn("w:val"), "clear")
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_pr.append(shading)


def _set_column_widths(table, widths: list[Inches]) -> None:
    for row in table.rows:
        for idx, width in enumerate(widths):
            row.cells[idx].width = width


def _resolve_placement_path(placement: ImagePlacement) -> Path | None:
    raw = (placement.image_base64 or "").strip()
    if raw:
        payload = raw.split(",", 1)[1] if raw.startswith("data:") else raw
        try:
            data = base64.b64decode(payload)
        except (ValueError, TypeError):
            return None
        suffix = ".png"
        lower = raw.lower()
        for ext in (".jpg", ".jpeg", ".webp", ".gif"):
            if ext in lower[:40]:
                suffix = ext
                break
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(data)
        tmp.close()
        return Path(tmp.name)
    return resolve_placement_image(
        image_file=placement.image_file,
        image_url=placement.image_url,
    )


def _apply_body_format(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
    paragraph.paragraph_format.first_line_indent = Pt(0)
    paragraph.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    paragraph.paragraph_format.line_spacing = LINE_SPACING
    paragraph.paragraph_format.space_after = Pt(6)


def _add_runs_to_paragraph(paragraph, line: str, *, size_pt: float, bold_default: bool = False) -> None:
    parts = _BOLD.split(line.strip())
    for index, part in enumerate(parts):
        if not part:
            continue
        if index % 2 == 1:
            run = paragraph.add_run(part)
            _set_run_font(run, size_pt, bold=True)
        else:
            cleaned = part.replace("**", "")
            if cleaned:
                run = paragraph.add_run(cleaned)
                _set_run_font(run, size_pt, bold=bold_default)


def _add_heading_paragraph(doc: Document, line: str) -> None:
    stripped = line.strip()
    if not stripped:
        return
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    p.paragraph_format.line_spacing = LINE_SPACING
    text = _clean_heading(stripped) if _is_heading(stripped) else stripped
    run = p.add_run(text)
    _set_run_font(run, HEADING_PT, bold=True)


def _add_body_paragraph_to_cell(cell, line: str) -> None:
    stripped = line.strip()
    if not stripped or _SKIP_LINE.match(stripped):
        return
    if is_image_placeholder(stripped):
        return
    p = cell.add_paragraph()
    _apply_body_format(p)
    _add_runs_to_paragraph(p, stripped, size_pt=BODY_PT)


def _add_picture_to_cell(cell, placement: ImagePlacement) -> None:
    img_path = _resolve_placement_path(placement)
    if not img_path:
        return
    p = cell.paragraphs[0] if cell.paragraphs else cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    run.add_picture(str(img_path), width=IMAGE_DISPLAY_WIDTH)


def _add_section_table(
    doc: Document,
    placement: ImagePlacement | None,
    body_lines: list[str],
) -> None:
    """가이드 3×3 표: 여백 행 + (그림 | 간격 | 본문) + 여백 행."""
    table = doc.add_table(rows=3, cols=3)
    _remove_table_borders(table)
    _set_column_widths(table, [IMAGE_COL_WIDTH, GAP_COL_WIDTH, BODY_COL_WIDTH])

    for row_index in (0, 2):
        for col_index in range(3):
            _set_cell_shading(table.rows[row_index].cells[col_index], "FFFFFF")

    image_cell = table.rows[1].cells[0]
    gap_cell = table.rows[1].cells[1]
    body_cell = table.rows[1].cells[2]

    _set_cell_shading(image_cell, IMAGE_CELL_FILL)
    _set_cell_shading(gap_cell, "FFFFFF")
    _set_cell_shading(body_cell, "FFFFFF")

    if placement:
        _add_picture_to_cell(image_cell, placement)

    for line in body_lines:
        _add_body_paragraph_to_cell(body_cell, line)

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(12)


def _add_form_header(doc: Document) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run("부록 3. 이지리드 판결서 양식")
    _set_run_font(run, HEADING_PT, bold=True)


def _export_easy_read_layout(
    doc: Document,
    text: str,
    placements: list[ImagePlacement],
) -> None:
    """작성양식 PDF: 부록 헤더 + <소제목> + 항목별 (삽화 | 글)."""
    _add_form_header(doc)
    by_item = align_placements_to_items(text, placements)

    for section in parse_export_sections(text):
        if section.heading:
            _add_heading_paragraph(doc, section.heading)
        for item in parse_section_items(section):
            placement = by_item.get(item.start_line_index)
            if placement is not None and not isinstance(placement, ImagePlacement):
                placement = ImagePlacement(**placement)  # type: ignore[arg-type]
            _add_section_table(doc, placement, item.lines)


def _add_rich_paragraph(doc: Document, line: str) -> None:
    stripped = line.strip()
    if not stripped or _SKIP_LINE.match(stripped):
        return
    if stripped == "## 수정된 이지리드 번역본":
        return
    if is_image_placeholder(stripped):
        return

    if _is_heading(stripped):
        _add_heading_paragraph(doc, stripped)
        return

    p = doc.add_paragraph()
    _apply_body_format(p)
    _add_runs_to_paragraph(p, stripped, size_pt=BODY_PT)


def _add_picture(doc: Document, image_file: str, image_url: str | None = None) -> None:
    img_path = resolve_placement_image(image_file=image_file, image_url=image_url)
    if not img_path:
        return
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run()
    run.add_picture(str(img_path), width=IMAGE_DISPLAY_WIDTH)


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
        if segment.image_placements:
            return segment.image_placements
    return None


def _collect_body_text(doc: DocumentResponse) -> str:
    if doc.translation_segments:
        for segment in doc.translation_segments:
            if segment.image_placements and segment.easy_text and segment.easy_text.strip():
                return segment.easy_text.strip()
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
        raw_placements = _collect_placements(doc) or []
        placements = prepare_placements_for_export(body, raw_placements)
        sections = parse_export_sections(body)
        if any(section.heading for section in sections):
            _export_easy_read_layout(word, body, placements)
        else:
            _export_text(word, body, skip_meta=not include_meta)

    buffer = io.BytesIO()
    word.save(buffer)
    return buffer.getvalue()
