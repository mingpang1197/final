from __future__ import annotations

"""Word VML 글상자 — 이지리드 삽입 블록 전체를 하나의 텍스트 상자로 감싼다."""

from copy import deepcopy

from docx import Document
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
from docx.shared import Pt

VML_NS = "urn:schemas-microsoft-com:vml"
OFFICE_NS = "urn:schemas-microsoft-com:office:office"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

# 본문 폭(8.5in - 0.6in*2 여백)에 맞춘 글상자 너비
TEXTBOX_WIDTH_PT = 432


def _find_vml_textbox(pict_element):
    for el in pict_element.iter():
        if el.tag == f"{{{VML_NS}}}textbox":
            return el
    return None


def wrap_document_in_textbox(host: Document, content: Document) -> None:
    """content 본문(표·단락 포함)을 host에 Word 글상자 1개로 추가."""
    txbx = OxmlElement("w:txbxContent")
    for block in content.element.body:
        if block.tag == qn("w:sectPr"):
            continue
        txbx.append(deepcopy(block))

    pict = parse_xml(
        f'<w:pict xmlns:w="{W_NS}" xmlns:v="{VML_NS}" xmlns:o="{OFFICE_NS}">'
        f'<v:shape id="_EasyReadTextBox" o:spid="_EasyReadTextBox" type="#_x0000_t202" '
        f'style="width:{TEXTBOX_WIDTH_PT}pt;height:0;mso-fit-shape-to-text:t" '
        f'stroked="t" strokecolor="#595959" strokeweight=".75pt">'
        f'<v:textbox style="mso-fit-shape-to-text:t" inset="8pt,8pt,8pt,8pt"/>'
        f"</v:shape></w:pict>"
    )
    textbox = _find_vml_textbox(pict)
    if textbox is None:
        raise RuntimeError("VML textbox element not created")
    textbox.append(txbx)

    paragraph = host.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(6)
    paragraph.paragraph_format.space_after = Pt(12)
    run = paragraph.add_run()
    run._r.append(pict)
