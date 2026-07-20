from __future__ import annotations

"""이지리드 export용 섹션 파싱 (프론트 translationSections와 동일 규칙)."""

import re
from dataclasses import dataclass

from backend.services.image_matcher import preview_lines

_IMAGE_PLACEHOLDER = re.compile(r"^\[image\]\s*$", re.I)


@dataclass(frozen=True)
class ExportSection:
    heading: str | None
    body_lines: list[str]
    start_line_index: int


def is_image_placeholder(line: str) -> bool:
    return bool(_IMAGE_PLACEHOLDER.match(line.strip()))


def is_section_heading(line: str) -> bool:
    stripped = line.strip()
    if stripped.startswith("<") and stripped.endswith(">"):
        return True
    if stripped.startswith("■"):
        return True
    return stripped.startswith("#")


def parse_export_sections(text: str) -> list[ExportSection]:
    lines = preview_lines(text)
    if not lines:
        return []

    sections: list[ExportSection] = []
    index = 0
    while index < len(lines):
        if is_section_heading(lines[index]):
            heading = lines[index]
            start = index
            index += 1
            body: list[str] = []
            while index < len(lines) and not is_section_heading(lines[index]):
                line = lines[index]
                if not is_image_placeholder(line):
                    body.append(line)
                index += 1
            sections.append(ExportSection(heading=heading, body_lines=body, start_line_index=start))
            continue

        start = index
        body = []
        while index < len(lines) and not is_section_heading(lines[index]):
            line = lines[index]
            if not is_image_placeholder(line):
                body.append(line)
            index += 1
        sections.append(ExportSection(heading=None, body_lines=body, start_line_index=start))

    return sections
