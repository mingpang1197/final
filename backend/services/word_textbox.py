from __future__ import annotations

"""이지리드 삽입 블록 — 본문 흐름에 맞는 테두리 글상자(1×1 표)."""

from copy import deepcopy

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt

EASY_READ_BOX_FILL = "F5F0E8"
EASY_READ_BOX_BORDER = "B8B0A4"
EASY_READ_BOX_PAD_TWIPS = 180  # ~0.125"
# word_export PAGE_MARGIN 0.6in → 본문 폭(8.5in 기준)
EASY_READ_BOX_WIDTH_TWIPS = int((8.5 - 0.6 * 2) * 1440)


def _set_table_width_dxa(table, width_twips: int) -> None:
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    for child in list(tbl_pr):
        if child.tag == qn("w:tblW"):
            tbl_pr.remove(child)
    tbl_w = OxmlElement("w:tblW")
    tbl_w.set(qn("w:w"), str(width_twips))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_pr.insert(0, tbl_w)
EASY_READ_BOX_BORDER = "B8B0A4"
EASY_READ_BOX_PAD_TWIPS = 180  # ~0.125"


def _set_cell_borders_visible(cell, *, color: str = EASY_READ_BOX_BORDER, size: str = "12") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)
        borders.append(element)
    tc_pr.append(borders)


def _set_cell_shading(cell, fill_hex: str) -> None:
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), fill_hex)
    shading.set(qn("w:val"), "clear")
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_pr.append(shading)


def _set_cell_margins(cell, *, top: int = 0, bottom: int = 0, left: int = 0, right: int = 0) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = OxmlElement("w:tcMar")
    for edge, value in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        node = OxmlElement(f"w:{edge}")
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")
        tc_mar.append(node)
    tc_pr.append(tc_mar)


def _clear_cell_content(cell) -> None:
    tc = cell._tc
    for child in list(tc):
        if child.tag != qn("w:tcPr"):
            tc.remove(child)


def wrap_document_in_textbox(host: Document, content: Document) -> None:
    """content(단락·표)를 본문 순서에 맞는 테두리 1×1 표 안에 넣는다."""
    table = host.add_table(rows=1, cols=1)
    table.autofit = False
    _set_table_width_dxa(table, EASY_READ_BOX_WIDTH_TWIPS)
    cell = table.rows[0].cells[0]
    _set_cell_borders_visible(cell)
    _set_cell_shading(cell, EASY_READ_BOX_FILL)
    pad = EASY_READ_BOX_PAD_TWIPS
    _set_cell_margins(cell, top=pad, bottom=pad, left=pad, right=pad)
    _clear_cell_content(cell)

    tc = cell._tc
    for block in content.element.body:
        if block.tag == qn("w:sectPr"):
            continue
        tc.append(deepcopy(block))

    spacer = host.add_paragraph()
    spacer.paragraph_format.space_after = Pt(10)
