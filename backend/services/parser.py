"""Document type classification and section parsing."""

from __future__ import annotations

import re

from backend.models.schemas import DocType

CRIMINAL_MARKERS = ["피고인", "범죄사실", "주문", "징역", "벌금", "무죄"]
CIVIL_MARKERS = ["원고", "피고", "청구", "소송", "손해배상"]
FAMILY_MARKERS = ["이혼", "친권", "양육", "부양", "가사"]
ADMIN_MARKERS = ["처분", "행정", "취소", "무효", "행정청", "행정법원", "구합", "장애등록", "등급외"]


def classify_doc_type(text: str) -> DocType:
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
