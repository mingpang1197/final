from __future__ import annotations

"""법원 판결문 유사 무료 명조 — 프로젝트 번들 TTF + Word/PDF export 기본값."""

import logging
import sys
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

BODY_PT_DEFAULT = 12.0


@dataclass(frozen=True)
class ExportFontProfile:
    ascii: str = "Nanum Myeongjo"
    h_ansi: str = "Nanum Myeongjo"
    east_asia: str = "Nanum Myeongjo"
    body_pt: float = BODY_PT_DEFAULT

NANUM_MYUNGJO_REGULAR = FONT_DIR / "NanumMyeongjo-Regular.ttf"
NANUM_MYUNGJO_BOLD = FONT_DIR / "NanumMyeongjo-Bold.ttf"

# KoPubWorld 바탕체 Medium.ttf 를 같은 폴더에 넣으면 우선 사용 (KOPUB 무료 배포)
KOPUB_BATANG_MEDIUM = FONT_DIR / "KoPubWorldBatangMedium.ttf"
KOPUB_WORD_NAME = "KoPubWorld바탕체 Medium"
KOPUB_CSS_FAMILY = "KoPubWorld Batang"

NANUM_WORD_NAME = "Nanum Myeongjo"
NANUM_CSS_FAMILY = "Nanum Myeongjo"


def bundled_font_files() -> list[Path]:
    files: list[Path] = []
    if KOPUB_BATANG_MEDIUM.is_file():
        files.append(KOPUB_BATANG_MEDIUM)
    if NANUM_MYUNGJO_REGULAR.is_file():
        files.append(NANUM_MYUNGJO_REGULAR)
    if NANUM_MYUNGJO_BOLD.is_file():
        files.append(NANUM_MYUNGJO_BOLD)
    return files


def bundled_court_font_profile() -> ExportFontProfile:
    if KOPUB_BATANG_MEDIUM.is_file():
        return ExportFontProfile(
            ascii=KOPUB_WORD_NAME,
            h_ansi=KOPUB_WORD_NAME,
            east_asia=KOPUB_WORD_NAME,
            body_pt=BODY_PT_DEFAULT,
        )
    return ExportFontProfile(
        ascii=NANUM_WORD_NAME,
        h_ansi=NANUM_WORD_NAME,
        east_asia=NANUM_WORD_NAME,
        body_pt=BODY_PT_DEFAULT,
    )


def css_font_family_stack() -> str:
    profile = bundled_court_font_profile()
    primary = profile.east_asia.replace('"', "")
    return f'"{primary}", "Nanum Myeongjo", "Batang", "Times New Roman", serif'


def primary_ttf_for_story() -> Path | None:
    if KOPUB_BATANG_MEDIUM.is_file():
        return KOPUB_BATANG_MEDIUM
    if NANUM_MYUNGJO_REGULAR.is_file():
        return NANUM_MYUNGJO_REGULAR
    return None


def story_font_face_css() -> str:
    """PyMuPDF Story @font-face — 번들 TTF 직접 참조."""
    regular = NANUM_MYUNGJO_REGULAR
    bold = NANUM_MYUNGJO_BOLD
    if KOPUB_BATANG_MEDIUM.is_file():
        family = KOPUB_CSS_FAMILY
        return f"""
    @font-face {{
      font-family: "{family}";
      src: url("{KOPUB_BATANG_MEDIUM.name}");
      font-weight: normal;
    }}
    """
    if not regular.is_file():
        return ""
    family = NANUM_CSS_FAMILY
    lines = [
        f"""
    @font-face {{
      font-family: "{family}";
      src: url("{regular.name}");
      font-weight: normal;
    }}"""
    ]
    if bold.is_file():
        lines.append(
            f"""
    @font-face {{
      font-family: "{family}";
      src: url("{bold.name}");
      font-weight: bold;
    }}"""
        )
    return "".join(lines)


def enable_word_font_embedding(document: Document) -> None:
    """Word → PDF 시 글꼴 유실 방지 (옵션: 파일에 TrueType 포함)."""
    root = document.settings.element
    for child in list(root):
        if child.tag in (qn("w:embedTrueTypeFonts"), qn("w:embedSystemFonts")):
            root.remove(child)
    embed_tt = OxmlElement("w:embedTrueTypeFonts")
    embed_tt.set(qn("w:val"), "true")
    embed_sys = OxmlElement("w:embedSystemFonts")
    embed_sys.set(qn("w:val"), "false")
    root.append(embed_tt)
    root.append(embed_sys)


def is_known_export_font_name(name: str) -> bool:
    key = (name or "").strip().lower()
    if not key:
        return False
    known = (
        "nanum myeongjo",
        "nanummyeongjo",
        "나눔명조",
        "kopubworld",
        "kopub",
        "courtbt",
        "바탕",
        "batang",
        "gungsuh",
        "궁서",
        "hygothic",
    )
    return any(k in key for k in known)


def register_bundled_fonts_for_process() -> None:
    """Word/docx2pdf 변환 전 프로세스에 번들 TTF 등록(Windows)."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        gdi32 = ctypes.WinDLL("gdi32")
        add = gdi32.AddFontResourceExW
        add.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_void_p]
        add.restype = ctypes.c_int
        FR_PRIVATE = 0x10
        for path in bundled_font_files():
            added = add(str(path.resolve()), FR_PRIVATE, None)
            if added:
                logger.info("registered bundled font: %s", path.name)
    except Exception:
        logger.exception("bundled font registration failed")
