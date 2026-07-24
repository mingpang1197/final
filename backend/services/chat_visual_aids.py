from __future__ import annotations

"""챗봇 답변 보조 — 문구 이해용 시각자료 추천·생성(stub/API)."""

import re

from backend.models.schemas import ChatVisualAid
from backend.services.image_generation import generate_visual_aid, image_generation_available
from backend.services.image_matcher import find_matching_images
from backend.services.image_web_search import search_web_images

_MAX_AIDS = 2


def _phrases_from_question(question: str) -> list[str]:
    text = question.strip()
    if not text:
        return []
    quoted = re.findall(r"[「『\"']([^」』\"']{2,80})[」』\"']", text)
    if quoted:
        return quoted[:_MAX_AIDS]
    return [text[:120]]


async def suggest_visual_aids(
    question: str,
    *,
    doc_context: str = "",
    reply: str = "",
) -> list[ChatVisualAid]:
    """DB → 웹 검색 → (키 있으면) OpenAI 생성 → pending."""
    phrases = _phrases_from_question(question)
    if not phrases:
        return []

    aids: list[ChatVisualAid] = []
    used_files: set[str] = set()

    for phrase in phrases[:_MAX_AIDS]:
        explanation = _short_explanation(reply, phrase)
        aid = await _resolve_aid_for_phrase(
            phrase,
            doc_context=doc_context,
            explanation=explanation,
            used_files=used_files,
        )
        if aid:
            aids.append(aid)
            if aid.image_file:
                used_files.add(aid.image_file)

    return aids


def _short_explanation(reply: str, phrase: str) -> str | None:
    if not reply.strip():
        return None
    sentences = re.split(r"(?<=[.!?])\s+", reply.strip())
    for sent in sentences:
        if phrase[:10] in sent or len(sent) <= 200:
            return sent[:300]
    return reply.strip()[:300]


async def _resolve_aid_for_phrase(
    phrase: str,
    *,
    doc_context: str,
    explanation: str | None,
    used_files: set[str],
) -> ChatVisualAid | None:
    search_text = f"{phrase} {doc_context[:500]}".strip()

    for match in find_matching_images(search_text, max_images=1):
        if match.image_file in used_files:
            continue
        return ChatVisualAid(
            phrase=phrase,
            explanation=explanation,
            image_file=match.image_file,
            image_url=f"/images/{match.image_file}",
            title=match.title,
            source="db",
            generated=False,
        )

    web_items = await search_web_images(phrase, max_results=3)
    for item in web_items:
        key = item.get("image_file") or item.get("url")
        if key in used_files:
            continue
        return ChatVisualAid(
            phrase=phrase,
            explanation=explanation,
            image_file=item.get("image_file"),
            image_url=item.get("source_url") or item.get("url"),
            title=item.get("title"),
            source="web",
            generated=False,
        )

    if image_generation_available():
        generated = await generate_visual_aid(phrase, context=doc_context)
        if generated:
            return ChatVisualAid(
                phrase=phrase,
                explanation=explanation,
                image_url=generated.url,
                title=phrase[:80],
                source="generated",
                generated=True,
            )

    return ChatVisualAid(
        phrase=phrase,
        explanation=explanation,
        source="pending",
        generated=False,
    )
