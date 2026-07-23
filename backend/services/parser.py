from __future__ import annotations

"""판결문 유형 분류 및 섹션 파싱.

역할: OCR 텍스트에서 형사·민사·가사·행정 등 doc_type을 추정하고 섹션을 분리한다.
주요 기능: classify_doc_type(사건번호 우선), classify_case_number, extract_sections.
관계: models/schemas(DocType), routers/documents(업로드 시), prompts(유형별 프롬프트).
"""

import re
from collections import Counter

from backend.models.schemas import DocType

CRIMINAL_MARKERS = ["피고인", "범죄사실", "주문", "징역", "벌금", "무죄"]
CIVIL_MARKERS = ["원고", "피고", "청구", "소송", "손해배상"]
FAMILY_MARKERS = ["이혼", "친권", "양육", "부양", "가사"]
ADMIN_MARKERS = ["처분", "행정", "취소", "무효", "행정청", "행정법원", "구합", "장애등록", "등급외"]

CASE_NUM_PATTERN = re.compile(r"\d{2,4}\s*[가-힣]{1,4}\s*\d+")
_CASE_NUMBER_LABEL = re.compile(r"사\s*건\s*번\s*호")

CIVIL_SYMBOLS = frozenset({
    "가", "가합", "가단", "가소", "나", "다", "라", "마", "그", "바", "머", "자", "차", "러",
    "재가합", "재가단", "재가소", "재나", "재다", "재라", "재마", "재그", "재머", "재자", "재차",
    "준재가합", "준재가단", "준재가소", "준재나", "준재다", "준재라", "준재자", "준재머",
    "카", "카단", "카합", "카공", "카담", "카조", "카구", "카경", "카정", "카단조", "카합조",
    "타경", "타채", "타기", "타인", "타배", "타집",
    "차전", "비", "비단", "비합", "과", "과단", "과합", "동", "인", "전", "지", "상",
})

CRIMINAL_SYMBOLS = frozenset({
    "고", "고합", "고단", "고정", "고약", "노", "도", "로", "모", "오", "보", "코", "조", "토",
    "초", "초적", "초보", "초기", "초사", "초치", "초재",
    "감고", "감노", "감도", "감로", "감모", "감오", "감토", "감초",
    "재고합", "재고단", "재고정", "재고약", "재노", "재도", "재감고", "재감노", "재감도",
    "고약전",
    "치고", "치노", "치도", "치오", "치초", "치로", "치모",
    "전고", "전노", "전도", "전오", "전초", "전로", "전모",
    "보고", "보노", "보도", "보오", "보초", "보로", "보모",
})

FAMILY_SYMBOLS = frozenset({
    "준재너단", "준재너합",
    "드", "드합", "드단", "르", "므", "브", "스", "으", "너", "츠",
    "즈", "즈합", "즈단", "즈기", "느", "느합", "느단",
    "후개", "후감", "후기",
    "재드", "재드합", "재드단", "재르", "재므", "재브", "재스", "재너",
    "재즈합", "재즈단", "재즈기", "재느합", "재느단", "재으",
    "준재드", "준재드합", "준재드단", "준재르", "준재므", "준재브", "준재스",
    "준재즈기", "준재느합", "준재느단",
    "정", "정단", "정합",
})

ADMIN_SYMBOLS = frozenset({
    "구", "구합", "구단", "누", "두", "루", "무", "부", "사", "아",
    "재구", "재구합", "재구단", "재누", "재두", "재루", "재무", "재아", "재부",
    "준재구", "준재구합", "준재구단", "준재누", "준재두", "준재루", "준재아",
})


def classify_case_number(case_num: str) -> DocType | None:
    """사건번호 문자열에서 대법원 사건부호 기준 doc_type을 반환한다."""
    cleaned = re.sub(r"[^0-9가-힣]", "", case_num.strip())
    match = re.match(r"^\d{2,4}([가-힣]{1,4})\d+", cleaned)
    if not match:
        return None

    symbol = match.group(1)
    if symbol in CIVIL_SYMBOLS:
        return "civil"
    if symbol in CRIMINAL_SYMBOLS:
        return "criminal"
    if symbol in FAMILY_SYMBOLS:
        return "family"
    if symbol in ADMIN_SYMBOLS:
        return "administrative"
    return None


def _append_case_match(found: list[str], seen: set[str], raw: str) -> None:
    normalized = re.sub(r"[^0-9가-힣]", "", raw)
    if normalized and normalized not in seen:
        seen.add(normalized)
        found.append(raw.strip())


def extract_case_numbers_above_label(text: str, *, max_lines_before: int = 5) -> list[str]:
    """「사건번호」 표기 **위** 줄에 적힌 사건번호 (민사·형사·가사 판결 상단 배치)."""
    lines = text.splitlines()
    found: list[str] = []
    seen: set[str] = set()
    for index, line in enumerate(lines):
        if not _CASE_NUMBER_LABEL.search(line):
            continue
        start = max(0, index - max_lines_before)
        for j in range(start, index):
            for m in CASE_NUM_PATTERN.finditer(lines[j]):
                _append_case_match(found, seen, m.group(0))
    return found


def extract_case_numbers_below_label(text: str, *, max_lines_after: int = 5) -> list[str]:
    """「사건번호」 표기 직후·아래 줄에 적힌 사건번호 (OCR 세로 배치)."""
    lines = text.splitlines()
    found: list[str] = []
    seen: set[str] = set()
    for index, line in enumerate(lines):
        if not _CASE_NUMBER_LABEL.search(line):
            continue
        for j in range(index, min(index + max_lines_after, len(lines))):
            for m in CASE_NUM_PATTERN.finditer(lines[j]):
                _append_case_match(found, seen, m.group(0))
    return found


def extract_case_numbers(text: str) -> list[str]:
    """본문에서 사건번호 후보를 추출한다 (공백·특수문자 허용)."""
    found: list[str] = []
    seen: set[str] = set()
    for raw in extract_case_numbers_below_label(text):
        normalized = re.sub(r"[^0-9가-힣]", "", raw)
        if normalized:
            seen.add(normalized)
            found.append(raw)
    for m in CASE_NUM_PATTERN.finditer(text):
        _append_case_match(found, seen, m.group(0))
    return found


def classify_doc_type(text: str) -> DocType:
    """사건번호 우선 분류, 실패 시 키워드 점수 폴백."""
    votes: Counter[DocType] = Counter()
    priority_norm: set[str] = set()

    for case_num in extract_case_numbers_above_label(text):
        norm = re.sub(r"[^0-9가-힣]", "", case_num)
        if norm:
            priority_norm.add(norm)
        kind = classify_case_number(case_num)
        if kind in ("criminal", "civil", "family"):
            votes[kind] += 5

    labeled_below = extract_case_numbers_below_label(text)
    for case_num in labeled_below:
        norm = re.sub(r"[^0-9가-힣]", "", case_num)
        if norm:
            priority_norm.add(norm)
        kind = classify_case_number(case_num)
        if kind:
            votes[kind] += 5

    for case_num in extract_case_numbers(text):
        norm = re.sub(r"[^0-9가-힣]", "", case_num)
        if norm in priority_norm:
            continue
        kind = classify_case_number(case_num)
        if kind:
            votes[kind] += 1
    if votes:
        return votes.most_common(1)[0][0]
    return _classify_by_keywords(text)


def _classify_by_keywords(text: str) -> DocType:
    scores = {
        "criminal": _score(text, CRIMINAL_MARKERS),
        "civil": _score(text, CIVIL_MARKERS),
        "family": _score(text, FAMILY_MARKERS),
        "administrative": _score(text, ADMIN_MARKERS),
    }
    if "행정법원" in text or "구합" in text:
        scores["administrative"] += 3
    if "피고인" in text and "범죄사실" in text:
        scores["criminal"] += 2
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "unknown"
    return best  # type: ignore[return-value]


def _score(text: str, markers: list[str]) -> int:
    return sum(1 for m in markers if m in text)


def extract_sections(text: str) -> dict[str, str]:
    headers = ["주문", "범죄사실", "이유", "청구취지", "공소사실", "판시", "결론"]
    sections: dict[str, str] = {}
    pattern = "|".join(re.escape(h) for h in headers)
    splits = re.split(rf"(?=(?:{pattern})\s*\n)", text)
    for part in splits:
        part = part.strip()
        if not part:
            continue
        for h in headers:
            if part.startswith(h):
                body = part[len(h) :].strip()
                sections[h] = body
                break
    if not sections:
        sections["전문"] = text
    return sections
