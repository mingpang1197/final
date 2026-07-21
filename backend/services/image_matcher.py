from __future__ import annotations

"""이지리드 텍스트 ↔ LEGAL_DB 이미지 매칭.

역할: 쉬운 글 본문에서 키워드를 찾아 일러스트 배치·카탈로그를 제공한다.
주요 기능: detect_image_placements, list_image_catalog, find_matching_images.
관계: db_rules(LEGAL_DB), easy_read_sanitize, word_export·translator(호출).
"""

import re
import sys
import uuid
from dataclasses import dataclass
from functools import lru_cache

from backend.config import IMAGES_DIR, IS_VERCEL, ROOT_DIR
from backend.models.schemas import ImagePlacement
from backend.services.easy_read_sanitize import sanitize_translation_text

sys.path.insert(0, str(ROOT_DIR))
from db_rules import LEGAL_DB  # noqa: E402

MIN_PHRASE_LEN = 8
MIN_TITLE_LEN = 4
MIN_CHUNK_LEN = 6
MAX_IMAGES_PER_TEXT = 8

# Short title-like triggers that are too generic across doc types
_BLOCKED_KEYWORDS = frozenset(
    {
        "소송비용",
        "각하",
        "기각",
        "상계",
        "위자료",
        "재산분할",
    }
)


@dataclass(frozen=True)
class ImageMatch:
    image_file: str
    title: str | None
    trigger: str


def normalize_match_text(text: str) -> str:
    """Strip markdown markers so **장애인 등록** matches 장애인 등록."""
    cleaned = re.sub(r"\*+", "", text)
    cleaned = re.sub(r"#+\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _is_valid_keyword(phrase: str) -> bool:
    phrase = phrase.strip()
    if len(phrase) < MIN_TITLE_LEN:
        return False
    if phrase in _BLOCKED_KEYWORDS:
        return False
    if len(phrase) < MIN_PHRASE_LEN and phrase in _BLOCKED_KEYWORDS:
        return False
    return True


def _chunk_phrases(text: str) -> list[str]:
    """Extract readable Korean phrase chunks for fuzzy in-text matching."""
    normalized = normalize_match_text(text)
    chunks: list[str] = []
    for segment in re.split(r"[.。\n!?]+", normalized):
        segment = segment.strip()
        if len(segment) >= MIN_CHUNK_LEN:
            chunks.append(segment)
        # Also add leading sub-phrases (e.g. '장애인 등록' from longer easy_text)
        words = segment.split()
        for i in range(len(words)):
            for j in range(i + 2, len(words) + 1):
                phrase = " ".join(words[i:j])
                if len(phrase) >= MIN_CHUNK_LEN:
                    chunks.append(phrase)
    return chunks


def _keywords_for_entry(key: str, easy_text: str, title: str | None) -> list[str]:
    words: list[str] = []
    if title:
        flat = normalize_match_text(title.replace("\n", " "))
        if _is_valid_keyword(flat):
            words.append(flat)
        for part in re.split(r"[\n()]+", title):
            part = normalize_match_text(part)
            if _is_valid_keyword(part):
                words.append(part)
    if easy_text:
        phrase = normalize_match_text(easy_text)
        if len(phrase) >= MIN_PHRASE_LEN:
            words.append(phrase)
        words.extend(_chunk_phrases(easy_text))
    phrase = normalize_match_text(key)
    if len(phrase) >= MIN_PHRASE_LEN:
        words.append(phrase)
    # Deduplicate, longest first
    unique = sorted(set(words), key=len, reverse=True)
    return [w for w in unique if _is_valid_keyword(w)]


@lru_cache(maxsize=1)
def _load_index() -> list[tuple[str, str | None, list[str]]]:
    seen: set[str] = set()
    index: list[tuple[str, str | None, list[str]]] = []
    for key, entries in LEGAL_DB.items():
        for entry in entries:
            image_file = entry.get("image_file")
            if not image_file or image_file in seen:
                continue
            if not IS_VERCEL and not (IMAGES_DIR / image_file).is_file():
                continue
            seen.add(image_file)
            keywords = _keywords_for_entry(
                key,
                entry.get("easy_text", ""),
                entry.get("title"),
            )
            if keywords:
                index.append((image_file, entry.get("title"), keywords))
    return index


def find_matching_images(text: str, *, max_images: int = MAX_IMAGES_PER_TEXT) -> list[ImageMatch]:
    normalized = normalize_match_text(text)
    if not normalized:
        return []
    matches: list[ImageMatch] = []
    used_files: set[str] = set()
    for image_file, title, keywords in _load_index():
        if len(matches) >= max_images:
            break
        if image_file in used_files:
            continue
        for kw in keywords:
            kw_norm = normalize_match_text(kw)
            if kw_norm and kw_norm in normalized:
                matches.append(
                    ImageMatch(image_file=image_file, title=title, trigger=kw_norm)
                )
                used_files.add(image_file)
                break
    return matches


def find_images_for_line(
    line: str,
    *,
    exclude: set[str] | None = None,
    max_total: int = MAX_IMAGES_PER_TEXT,
) -> list[ImageMatch]:
    exclude = exclude or set()
    remaining = max(0, max_total - len(exclude))
    if remaining == 0:
        return []
    results: list[ImageMatch] = []
    for match in find_matching_images(line, max_images=remaining):
        if match.image_file not in exclude:
            results.append(match)
    return results


def preview_lines(text: str) -> list[str]:
    """Lines used for placement indices (matches frontend filterPreviewLines)."""
    sanitized = sanitize_translation_text(text)
    return [
        line
        for line in sanitized.split("\n")
        if line.strip() and not line.strip().startswith("---")
    ]


_NUMBERED_ITEM = re.compile(r"^\s*\d+[\).]\s")


def _is_section_heading(line: str) -> bool:
    s = line.strip()
    return (s.startswith("<") and s.endswith(">")) or s.startswith("■") or s.startswith("#")


def _is_numbered_item_line(line: str) -> bool:
    return bool(_NUMBERED_ITEM.match(line))


def _parse_section_items(
    body_lines: list[str],
    body_start: int,
    section_heading: str | None,
) -> list[tuple[int, str, str | None]]:
    if not body_lines:
        return []

    if not any(_is_numbered_item_line(line) for line in body_lines):
        return [(body_start, "\n".join(body_lines), section_heading)]

    items: list[tuple[int, str, str | None]] = []
    current: list[str] = []
    current_start = body_start

    for offset, line in enumerate(body_lines):
        global_idx = body_start + offset
        if _is_numbered_item_line(line):
            if current:
                items.append((current_start, "\n".join(current), section_heading))
            current = [line]
            current_start = global_idx
        else:
            if not current:
                current_start = global_idx
            current.append(line)

    if current:
        items.append((current_start, "\n".join(current), section_heading))

    return items


def _parse_all_items(text: str) -> list[tuple[int, str, str | None]]:
    """(start_line_index, item_text, section_heading) — mirrors frontend parseSectionItems."""
    lines = preview_lines(text)
    if not lines:
        return []

    results: list[tuple[int, str, str | None]] = []
    i = 0
    while i < len(lines):
        section_heading: str | None = None
        section_start = i
        if _is_section_heading(lines[i]):
            section_heading = lines[i]
            i += 1

        body_lines: list[str] = []
        while i < len(lines) and not _is_section_heading(lines[i]):
            body_lines.append(lines[i])
            i += 1

        if not body_lines:
            continue

        body_start = section_start + (1 if section_heading else 0)
        results.extend(_parse_section_items(body_lines, body_start, section_heading))

    return results


def _parse_all_sections(text: str) -> list[tuple[int, str, str]]:
    """(section_start_line_index, match_text, heading) — 소제목 대표 그림용."""
    lines = preview_lines(text)
    if not lines:
        return []

    results: list[tuple[int, str, str]] = []
    i = 0
    while i < len(lines):
        if not _is_section_heading(lines[i]):
            i += 1
            continue

        heading = lines[i]
        section_start = i
        i += 1
        body_lines: list[str] = []
        while i < len(lines) and not _is_section_heading(lines[i]):
            body_lines.append(lines[i])
            i += 1

        heading_plain = normalize_match_text(heading.strip("<>").strip())
        body_sample = normalize_match_text(" ".join(body_lines[:3]))
        match_text = f"{heading_plain} {body_sample}".strip()
        results.append((section_start, match_text or heading_plain, heading))

    return results


def _make_auto_placement(
    *,
    image_file: str,
    line_index: int,
    title: str | None,
    section_heading: str | None,
) -> ImagePlacement:
    return ImagePlacement(
        id=str(uuid.uuid4()),
        image_file=image_file,
        line_index=line_index,
        title=title,
        section_heading=section_heading,
        auto_filled=True,
    )


def fill_missing_item_placements(
    text: str,
    existing: list[ImagePlacement] | None = None,
) -> list[ImagePlacement]:
    """Keep manual placements; auto-match LEGAL_DB images for empty section/item slots."""
    existing = existing or []
    by_line = {p.line_index: p for p in existing}
    used_files = {p.image_file for p in existing}
    result = list(existing)

    for section_start, match_text, heading in _parse_all_sections(text):
        if section_start in by_line:
            continue
        matches = find_matching_images(match_text, max_images=1)
        if not matches:
            matches = find_matching_images(normalize_match_text(heading.strip("<>")), max_images=1)
        if not matches:
            continue
        match = matches[0]
        if match.image_file in used_files:
            continue
        placement = _make_auto_placement(
            image_file=match.image_file,
            line_index=section_start,
            title=match.title,
            section_heading=heading,
        )
        result.append(placement)
        by_line[section_start] = placement
        used_files.add(match.image_file)

    for start_idx, item_text, section_heading in _parse_all_items(text):
        if start_idx in by_line:
            continue
        matches = find_matching_images(item_text, max_images=1)
        if not matches and item_text:
            first_line = item_text.split("\n", 1)[0]
            matches = find_matching_images(first_line, max_images=1)
        if not matches:
            continue
        match = matches[0]
        if match.image_file in used_files:
            continue
        placement = _make_auto_placement(
            image_file=match.image_file,
            line_index=start_idx,
            title=match.title,
            section_heading=section_heading,
        )
        result.append(placement)
        by_line[start_idx] = placement
        used_files.add(match.image_file)

    return sorted(result, key=lambda p: p.line_index)


def detect_image_placements(text: str) -> list[ImagePlacement]:
    """Auto-detect illustrations per preview line on first translation."""
    lines = preview_lines(text)
    used: set[str] = set()
    placements: list[ImagePlacement] = []
    for i, line in enumerate(lines):
        if len(placements) >= MAX_IMAGES_PER_TEXT:
            break
        for match in find_images_for_line(line, exclude=used, max_total=MAX_IMAGES_PER_TEXT):
            placements.append(
                ImagePlacement(
                    id=str(uuid.uuid4()),
                    image_file=match.image_file,
                    line_index=i,
                    title=match.title,
                )
            )
            used.add(match.image_file)
    return placements


def _catalog_image_files() -> list[str]:
    if IMAGES_DIR.is_dir():
        return sorted(p.name for p in IMAGES_DIR.glob("*.png"))
    seen: set[str] = set()
    files: list[str] = []
    for _key, entries in LEGAL_DB.items():
        for entry in entries:
            image_file = entry.get("image_file")
            if image_file and image_file not in seen:
                seen.add(image_file)
                files.append(image_file)
    return sorted(files)


def list_image_catalog(query: str = "") -> list[dict[str, str]]:
    """All PNG files on disk with LEGAL_DB titles when available."""
    title_by_file: dict[str, str] = {}
    for image_file, title, _keywords in _load_index():
        if title:
            title_by_file[image_file] = title.replace("\n", " ")

    items: list[dict[str, str]] = []
    for image_file in _catalog_image_files():
        title = title_by_file.get(image_file, image_file)
        if query:
            q = query.lower()
            if q not in title.lower() and q not in image_file.lower():
                continue
        items.append(
            {
                "image_file": image_file,
                "title": title,
                "url": f"/images/{image_file}",
            }
        )
    return items
