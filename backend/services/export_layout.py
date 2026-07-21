from __future__ import annotations

"""이지리드 export용 섹션·항목 파싱 (프론트 translationSections와 동일 규칙)."""

import re
from dataclasses import dataclass

from backend.services.image_matcher import preview_lines

_IMAGE_PLACEHOLDER = re.compile(r"^\[image\]\s*$", re.I)
_NUMBERED_ITEM = re.compile(r"^\s*\d+[\)\.]\s")


@dataclass(frozen=True)
class ExportSection:
    heading: str | None
    body_lines: list[str]
    start_line_index: int


@dataclass(frozen=True)
class ExportItem:
    """양식 PDF: 1., 2. 등 번호 항목마다 (삽화 | 글) 2단."""

    lines: list[str]
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


def is_numbered_item_line(line: str) -> bool:
    return bool(_NUMBERED_ITEM.match(line))


def parse_section_items(section: ExportSection) -> list[ExportItem]:
    body = section.body_lines
    if not body:
        return []

    body_start = section.start_line_index + (1 if section.heading else 0)
    has_numbered = any(is_numbered_item_line(line) for line in body)

    if not has_numbered:
        return [ExportItem(lines=list(body), start_line_index=body_start)]

    items: list[ExportItem] = []
    current: list[str] = []
    current_start = body_start

    for offset, line in enumerate(body):
        global_idx = body_start + offset
        if is_numbered_item_line(line):
            if current:
                items.append(ExportItem(lines=current, start_line_index=current_start))
            current = [line]
            current_start = global_idx
        else:
            if not current:
                current_start = global_idx
            current.append(line)

    if current:
        items.append(ExportItem(lines=current, start_line_index=current_start))

    return items


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


def prepare_placements_for_export(body: str, placements: list) -> list:
    """항목(line_index)별 배치 유지. section_heading 수동 배치 우선."""
    from backend.models.schemas import ImagePlacement

    if not placements:
        return []

    typed = [p if isinstance(p, ImagePlacement) else ImagePlacement(**p) for p in placements]
    manual = [p for p in typed if p.section_heading]
    source = manual if manual else typed

    by_line: dict[int, ImagePlacement] = {}
    for placement in sorted(source, key=lambda p: p.line_index):
        by_line[placement.line_index] = placement
    return list(by_line.values())


def align_placements_to_items(body: str, placements: list) -> dict[int, object]:
    """Map placements to ExportItem.start_line_index (양식: 항목마다 삽화)."""
    from backend.models.schemas import ImagePlacement

    if not placements:
        return {}

    sections = parse_export_sections(body)
    section_starts = {section.start_line_index for section in sections if section.heading}
    typed = [p if isinstance(p, ImagePlacement) else ImagePlacement(**p) for p in placements]

    item_refs: list[tuple[ExportSection, ExportItem]] = []
    for section in sections:
        for item in parse_section_items(section):
            item_refs.append((section, item))

    if not item_refs:
        return {}

    by_item: dict[int, ImagePlacement] = {}
    used: set[str] = set()

    for placement in typed:
        if placement.line_index in section_starts:
            continue
        if placement.id in used:
            continue
        assigned = False

        for _section, item in item_refs:
            if placement.line_index == item.start_line_index:
                by_item[item.start_line_index] = placement
                used.add(placement.id)
                assigned = True
                break
        if assigned:
            continue

        _section, nearest = min(
            item_refs,
            key=lambda ref: abs(ref[1].start_line_index - placement.line_index),
        )
        if nearest.start_line_index not in by_item:
            by_item[nearest.start_line_index] = placement
            used.add(placement.id)

    return by_item


def align_placements_to_section_headings(body: str, placements: list) -> dict[int, object]:
    """소제목 줄(line_index)에 배치된 대표 그림."""
    from backend.models.schemas import ImagePlacement

    if not placements:
        return {}

    sections = parse_export_sections(body)
    section_starts = {section.start_line_index for section in sections if section.heading}
    typed = [p if isinstance(p, ImagePlacement) else ImagePlacement(**p) for p in placements]

    by_section: dict[int, ImagePlacement] = {}
    for placement in typed:
        if placement.line_index in section_starts:
            by_section[placement.line_index] = placement
    return by_section


def align_placements_to_sections(
    body: str,
    placements: list,
) -> dict[int, list]:
    """Legacy: section-level map (PDF 호환). 항목 배치를 섹션 start에 모음."""
    from backend.models.schemas import ImagePlacement

    sections = parse_export_sections(body)
    by_item = align_placements_to_items(body, placements)
    by_section: dict[int, list[ImagePlacement]] = {
        section.start_line_index: [] for section in sections
    }

    for section in sections:
        for item in parse_section_items(section):
            placement = by_item.get(item.start_line_index)
            if placement and isinstance(placement, ImagePlacement):
                by_section[section.start_line_index].append(placement)

    return by_section
