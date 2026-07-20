"""Strip LLM revision meta sections from easy-read translation text."""

from __future__ import annotations

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
