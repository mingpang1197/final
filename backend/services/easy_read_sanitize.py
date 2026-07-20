from __future__ import annotations

"""LLM 출력에서 메타 섹션 제거.

역할: Solar가 추가한 '수정된 이지리드 번역본'·'수정 사항' 등 메타 블록을 본문에서 제거한다.
주요 기능: sanitize_translation_text.
관계: translator, image_matcher(미리보기 줄 정리 시).
"""

import re

_META_SECTION_START = re.compile(r"^###\s*수정\s*사항")


def sanitize_translation_text(text: str) -> str:
    lines = text.split("\n")
    out: list[str] = []
    in_meta = False

    for line in lines:
        stripped = line.strip()
        if stripped == "## 수정된 이지리드 번역본":
            continue
        if _META_SECTION_START.match(stripped):
            in_meta = True
            continue
        if in_meta:
            continue
        out.append(line)

    cleaned = "\n".join(out)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()
