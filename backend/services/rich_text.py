"""이지리드 **강조** 마크다운 파싱 (Word/PDF export 공통)."""

from __future__ import annotations

import re

BOLD_PATTERN = re.compile(r"\*\*(.+?)\*\*")


def iter_bold_runs(line: str) -> list[tuple[str, bool]]:
    """Return (text, is_bold) segments preserving order."""
    parts = BOLD_PATTERN.split(line)
    runs: list[tuple[str, bool]] = []
    for index, part in enumerate(parts):
        if not part:
            continue
        if index % 2 == 1:
            runs.append((part, True))
        else:
            cleaned = part.replace("**", "")
            if cleaned:
                runs.append((cleaned, False))
    return runs
