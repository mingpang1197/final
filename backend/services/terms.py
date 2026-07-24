from __future__ import annotations

"""번역 입력용 용어 치환 (LEGAL_DB 매칭 이후).

우선순위 (전체 번역 파이프라인):
  1. db_rules.LEGAL_DB — 판결 문장 매칭 (matcher, 이 모듈 밖)
  2. mohw_terms_dict.json — 보건복지부 「쉬운단어 사전」
  3. terms_dict.json — 법제처 「정비 권고 용어」 (없으면 terms_list.json)
     ※ 현재 ENABLE_MOLEG_TERMS=False 로 비활성 (번역 생성 시 미사용)

역할: original → recommended(쉼표·슬래시 앞 첫 후보) 치환.
관계: translator.translate_summary(Solar 프롬프트용 요약·원문 발췌만).
"""

import json
import logging
import re
from pathlib import Path

from backend.config import ROOT_DIR

logger = logging.getLogger(__name__)

MOHW_TERMS_DICT_PATH = ROOT_DIR / "mohw_terms_dict.json"
MOHW_TERMS_LIST_PATH = ROOT_DIR / "mohw_terms_list.json"
MOLEG_TERMS_DICT_PATH = ROOT_DIR / "terms_dict.json"
MOLEG_TERMS_LIST_PATH = ROOT_DIR / "terms_list.json"

# 법제처 terms_dict / terms_list — 번역 생성 시 비활성
ENABLE_MOLEG_TERMS = False

# 법제처 정비 권고에는 '대'·'인'·편집 지시문처럼 자동 치환에 부적합한 항목이 있음
_MOLEG_MIN_ORIG_LEN = 3
_META_REC_RE = re.compile(
    r"(경우에만|삭제함|＊|예외\s*:|예\s*:|목적어가|각 호를|만들어서 표시)"
)

_term_pairs: list[tuple[str, str]] | None = None


def _first_recommended(raw: str) -> str:
    """권고 표현이 여러 개면 첫 후보만 사용 (쉼표·슬래시 기준)."""
    text = (raw or "").strip()
    if not text:
        return ""
    for sep in (",", "/"):
        if sep in text:
            text = text.split(sep, 1)[0].strip()
            break
    return text


def _load_json(path: Path) -> object | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("%s load failed: %s", path.name, exc)
        return None


def _dict_from_list(data: list) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        orig = str(item.get("original_term") or "").strip()
        rec_raw = str(item.get("recommended_term") or "").strip()
        if not orig or not rec_raw:
            continue
        if orig not in out:
            out[orig] = _first_recommended(rec_raw)
    return out


def _entries_from_data(data: object) -> dict[str, str]:
    if isinstance(data, dict):
        out: dict[str, str] = {}
        for key, value in data.items():
            orig = str(key).strip()
            rec = _first_recommended(str(value or ""))
            if orig and rec:
                out[orig] = rec
        return out
    if isinstance(data, list):
        return _dict_from_list(data)
    return {}


def _is_safe_pair(orig: str, rec: str, *, source: str) -> bool:
    if not orig or not rec or orig == rec:
        return False
    if source == "moleg":
        if len(orig) < _MOLEG_MIN_ORIG_LEN:
            return False
        if _META_REC_RE.search(rec) or _META_REC_RE.search(orig):
            return False
        if rec.startswith("[") or orig.startswith("또는(") or orig.startswith("및("):
            return False
    return True


def _filter_dict(raw: dict[str, str], *, source: str) -> dict[str, str]:
    return {
        orig: rec
        for orig, rec in raw.items()
        if _is_safe_pair(orig, rec, source=source)
    }


def _load_mohw_dict() -> dict[str, str]:
    data = _load_json(MOHW_TERMS_DICT_PATH)
    if data is None:
        data = _load_json(MOHW_TERMS_LIST_PATH)
    if data is None:
        logger.warning("mohw terms DB not found (mohw_terms_dict.json / mohw_terms_list.json)")
        return {}
    return _filter_dict(_entries_from_data(data), source="mohw")


def _load_moleg_dict() -> dict[str, str]:
    if not ENABLE_MOLEG_TERMS:
        logger.info("moleg terms DB disabled (terms_dict.json / terms_list.json)")
        return {}
    data = _load_json(MOLEG_TERMS_DICT_PATH)
    if data is None:
        data = _load_json(MOLEG_TERMS_LIST_PATH)
    if data is None:
        logger.warning("moleg terms DB not found (terms_dict.json / terms_list.json)")
        return {}
    return _filter_dict(_entries_from_data(data), source="moleg")


def _load_term_pairs() -> list[tuple[str, str]]:
    """2순위(보건복지부)가 3순위(법제처)보다 우선. 동일 키면 mohw 유지."""
    global _term_pairs
    if _term_pairs is not None:
        return _term_pairs

    moleg = _load_moleg_dict()
    mohw = _load_mohw_dict()
    merged: dict[str, str] = {**moleg, **mohw}

    pairs = list(merged.items())
    pairs.sort(key=lambda p: len(p[0]), reverse=True)
    _term_pairs = pairs
    logger.info(
        "term DBs loaded: mohw=%d, moleg=%d (safe), merged=%d (mohw overrides moleg)",
        len(mohw),
        len(moleg),
        len(_term_pairs),
    )
    return _term_pairs


def apply_terms_for_translation(text: str) -> str:
    """Solar 번역 입력에 적용. LEGAL_DB 매칭 이후, 긴 원어 우선 치환."""
    if not text or not text.strip():
        return text
    result = text
    for original, recommended in _load_term_pairs():
        if original in result:
            result = result.replace(original, recommended)
    return result


def reload_term_dbs() -> None:
    global _term_pairs
    _term_pairs = None
    _load_term_pairs()
