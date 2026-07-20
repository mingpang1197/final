"""Match LEGAL_DB illustrations to easy-read text (only when PNG exists on disk)."""

from __future__ import annotations

import re
import sys
import uuid
from dataclasses import dataclass
from functools import lru_cache

from backend.config import IMAGES_DIR, ROOT_DIR
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
            if not (IMAGES_DIR / image_file).is_file():
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


def list_image_catalog(query: str = "") -> list[dict[str, str]]:
    """All PNG files on disk with LEGAL_DB titles when available."""
    title_by_file: dict[str, str] = {}
    for _image_file, title, _keywords in _load_index():
        if title:
            title_by_file[_image_file] = title.replace("\n", " ")

    items: list[dict[str, str]] = []
    if not IMAGES_DIR.is_dir():
        return items
    for path in sorted(IMAGES_DIR.glob("*.png")):
        image_file = path.name
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
