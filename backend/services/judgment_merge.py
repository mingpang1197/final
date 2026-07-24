from __future__ import annotations

"""원문 판결문과 이지리드 본문 병합 — '이유' 직후 삽입."""

import re
from typing import Literal

IntroLineKind = Literal["title", "subtitle", "bullet"]

# 형사 등 — 장애인 대상 Easy-Read 제공 고지 (가·나 항)
EASY_READ_PROVISION_PARAGRAPHS: list[str] = [
    "※ 장애인 등을 위한 이해하기 쉬운(Easy-Read) 판결의 제공",
    (
        "지적장애를 가진 피고인 OOO이 통상의 방식으로 작성한 판결서 내용을 "
        "충실하게 이해하기 어렵다고 보이므로, 아래 가.항과 같은 법적 근거에 따라 "
        "피고인에게 아래 나.항과 같은 ‘이해하기 쉬운(Easy-Read) 판결’을 제공합니다."
    ),
    "가. 제공의 법적 근거",
    (
        "- 헌법 제10조, 제11조, 제27조 제1항, 제34조 제5항\n"
        "- 장애인차별금지 및 권리구제 등에 관한 법률 제21조 제1항, 제26조 제1항, "
        "제4항, 제5항, 제8항 및 같은 법 시행령 제14조 제2항, 제17조 제1항\n"
        "- 발달장애인 권리보장 및 지원에 관한 법률 제10조 제1항\n"
        "- 유엔 장애인의 권리에 관한 협약 제5조, 제9조, 제13조, 제21조 등"
    ),
    "나. 제공하는 “이해하기 쉬운 판결”",
    "아래와 같습니다.",
]

_PARTY_PATTERNS: dict[str, list[str]] = {
    "criminal": [r"피고인\s*([가-힣]{2,4})"],
    "civil": [r"원고\s*([가-힣]{2,4})", r"청구인\s*([가-힣]{2,4})"],
    "family": [
        r"원고\s*([가-힣]{2,4})",
        r"피고\s*([가-힣]{2,4})",
        r"신청인\s*([가-힣]{2,4})",
    ],
    "administrative": [r"청구인\s*([가-힣]{2,4})", r"원고\s*([가-힣]{2,4})"],
}


def resolve_easy_read_recipient_name(
    full_text: str,
    doc_type: str,
    easy_body: str = "",
) -> str:
    """이지리드 안내 문구의 OOO — 피고인·원고·청구인 등."""
    try:
        from backend.services.matcher import build_name_map

        name_map = build_name_map(full_text or easy_body)
        if name_map:
            return next(iter(name_map.values()))
    except Exception:
        pass

    patterns = _PARTY_PATTERNS.get(doc_type, [])
    patterns = patterns + [
        r"피고인\s*([가-힣]{2,4})",
        r"원고\s*([가-힣]{2,4})",
        r"청구인\s*([가-힣]{2,4})",
    ]
    seen: set[str] = set()
    for source in (full_text, easy_body):
        if not source.strip():
            continue
        for pattern in patterns:
            if pattern in seen:
                continue
            seen.add(pattern)
            match = re.search(pattern, source)
            if match:
                return match.group(1)
    return "OOO"


def build_easy_read_intro_lines(
    party_name: str,
    page_count: int,
) -> list[tuple[IntroLineKind, str]]:
    """「나. 제공하는…」 다음, <이 판결의 결론> 앞에 넣는 안내 블록."""
    party = (party_name or "OOO").strip() or "OOO"
    pages = max(int(page_count), 1)
    return [
        ("title", "이해하기 쉬운 판결"),
        ("subtitle", "(이지리드 / Easy-Read)"),
        (
            "bullet",
            f'● "이해하기 쉬운 판결"은 {party}에게 판결 내용을 쉽게 설명합니다.',
        ),
        (
            "bullet",
            '● "이해하기 쉬운 판결"이 원래의 판결문 내용과 다른 것 같으면, '
            "원래의 판결문 내용이 맞는 것입니다.",
        ),
        (
            "bullet",
            f"● 이 판결은, {party}이 어떤 처벌을 받는지를 알려줍니다.",
        ),
        (
            "bullet",
            f"● 이해하기 쉬운 판결은 {pages}쪽까지 있습니다.",
        ),
    ]


_REASON_HEADING = re.compile(r"^이\s*유\s*$", re.MULTILINE)


def split_judgment_at_reason(full_text: str) -> tuple[str, str] | None:
    """(이유 포함 앞부분, 이유 다음 나머지 원문) 또는 None."""
    text = full_text.replace("\r\n", "\n").strip()
    if not text:
        return None

    match = _REASON_HEADING.search(text)
    if not match:
        return None

    prefix = text[: match.end()].rstrip()
    suffix = text[match.end() :].lstrip("\n")
    return prefix, suffix


def can_merge_original_with_easy_read(full_text: str | None) -> bool:
    return bool(full_text and split_judgment_at_reason(full_text))
