from __future__ import annotations

"""terms_list.json — 번역(Solar) 입력용 용어 치환 (LEGAL_DB 매칭 이후).

역할: original_term → recommended_term(쉼표 앞 첫 후보) 치환.
관계: translator.translate_summary(Solar 프롬프트용 요약·원문 발췌만).
"""

import json
import logging
from pathlib import Path

from backend.config import ROOT_DIR

logger = logging.getLogger(__name__)

TERMS_LIST_PATH = ROOT_DIR / "terms_list.json"

_term_pairs: list[tuple[str, str]] | None = None


def _first_recommended(raw: str) -> str:
    part = raw.split(",", 1)[0].strip()
    return part if part else raw.strip()


def _load_term_pairs() -> list[tuple[str, str]]:
    global _term_pairs
    if _term_pairs is not None:
        return _term_pairs

    pairs: list[tuple[str, str]] = []
    if not TERMS_LIST_PATH.is_file():
        logger.warning("terms_list.json not found at %s", TERMS_LIST_PATH)
        _term_pairs = []
        return _term_pairs

    try:
        data = json.loads(TERMS_LIST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("terms_list.json load failed: %s", exc)
        _term_pairs = []
        return _term_pairs

    if not isinstance(data, list):
        _term_pairs = []
        return _term_pairs

    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        orig = str(item.get("original_term") or "").strip()
        rec_raw = str(item.get("recommended_term") or "").strip()
        if not orig or not rec_raw:
            continue
        if orig in seen:
            continue
        seen.add(orig)
        pairs.append((orig, _first_recommended(rec_raw)))

    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    _term_pairs = pairs
    logger.info("terms_list loaded: %d entries", len(_term_pairs))
    return _term_pairs


def apply_terms_for_translation(text: str) -> str:
    """Solar 번역 입력에만 적용. 긴 original_term 우선 치환."""
    if not text or not text.strip():
        return text
    result = text
    for original, recommended in _load_term_pairs():
        if original in result:
            result = result.replace(original, recommended)
    return result
