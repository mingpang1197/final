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


def _normalize_heading(text: str) -> str:
    return text.strip().lstrip("#").strip()


def align_placements_to_sections(
    body: str,
    placements: list,
) -> dict[int, list]:
    """Map image placements to section start indices (handles sanitize reorder)."""
    from backend.models.schemas import ImagePlacement

    sections = parse_export_sections(body)
    if not sections or not placements:
        return {}

    lines = preview_lines(body)
    by_section: dict[int, list[ImagePlacement]] = {
        section.start_line_index: [] for section in sections
    }
    used: set[str] = set()

    typed = [p if isinstance(p, ImagePlacement) else ImagePlacement(**p) for p in placements]

    for placement in typed:
        if placement.id in used:
            continue
        assigned = False

        if placement.section_heading:
            target = _normalize_heading(placement.section_heading)
            for section in sections:
                if section.heading and _normalize_heading(section.heading) == target:
                    by_section[section.start_line_index].append(placement)
                    used.add(placement.id)
                    assigned = True
                    break
        if assigned:
            continue

        for section in sections:
            if section.start_line_index == placement.line_index:
                by_section[section.start_line_index].append(placement)
                used.add(placement.id)
                assigned = True
                break
        if assigned:
            continue

        if placement.line_index < len(lines):
            line_at = _normalize_heading(lines[placement.line_index])
            for section in sections:
                if section.heading and _normalize_heading(section.heading) == line_at:
                    by_section[section.start_line_index].append(placement)
                    used.add(placement.id)
                    assigned = True
                    break
        if assigned:
            continue

        nearest = min(sections, key=lambda s: abs(s.start_line_index - placement.line_index))
        by_section[nearest.start_line_index].append(placement)
        used.add(placement.id)

    return by_section
