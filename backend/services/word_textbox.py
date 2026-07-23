from __future__ import annotations

"""이지리드 삽입 블록 — 본문 흐름에 맞는 테두리 글상자(1×1 표)."""

from copy import deepcopy

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt


def _set_cell_borders_visible(cell, *, color: str = "595959", size: str = "4") -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)
        borders.append(element)
    tc_pr.append(borders)


def _clear_cell_content(cell) -> None:
    tc = cell._tc
    for child in list(tc):
        if child.tag != qn("w:tcPr"):
            tc.remove(child)


def wrap_document_in_textbox(host: Document, content: Document) -> None:
    """content(단락·표)를 본문 순서에 맞는 테두리 1×1 표 안에 넣는다."""
    table = host.add_table(rows=1, cols=1)
    table.autofit = False
    cell = table.rows[0].cells[0]
    _set_cell_borders_visible(cell)
    _clear_cell_content(cell)

    tc = cell._tc
    for block in content.element.body:
        if block.tag == qn("w:sectPr"):
            continue
        tc.append(deepcopy(block))

    spacer = host.add_paragraph()
    spacer.paragraph_format.space_after = Pt(6)
