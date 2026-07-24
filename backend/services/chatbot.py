from __future__ import annotations

"""챗봇 — LEGAL_DB·사용방안 DB·문서 맥락 우선, 부족 시 웹 검색 후 Solar 응답."""

import re
import sys

from rapidfuzz import fuzz, process

from backend.config import ROOT_DIR
from backend.database import get_document
from backend.models.schemas import ChatMessage, ChatResponse, ChatVisualAid
from backend.services import upstage
from backend.services.image_matcher import list_image_catalog
from backend.services.prompts import format_chat_writing_rules_context, load_chatbot_prompt
from backend.services.usage_guide_db import (
    format_usage_guide_context,
    is_service_help_question,
    match_quick_reply,
    resolve_page_context,
)
from backend.services.web_search import search_web

sys.path.insert(0, str(ROOT_DIR))
from db_rules import LEGAL_DB  # noqa: E402

NEED_WEB_MARKER = "NEED_WEB_SEARCH"
DB_MATCH_THRESHOLD = 55
DB_RESULT_LIMIT = 6
IMAGE_TITLE_RECOMMEND_LIMIT = 5

_SOURCE_REQUEST_TOKENS = ("출처", "근거", "참고문헌", "어디서가져", "출처가", "출처를")
_WRITING_RULES_TOKENS = (
    "번역기준",
    "작성기준",
    "작성규칙",
    "번역규칙",
    "이지리드기준",
    "이지리드규칙",
    "쉬운글기준",
    "쉬운글규칙",
    "writingrule",
    "체크리스트기준",
    "어떻게번역",
    "번역어떻게",
    "번역할때",
    "번역할떄",
)
_IMAGE_HELP_TOKENS = (
    "그림",
    "이미지",
    "image",
    "title",
    "시각자료",
    "첨부할그림",
    "그림이름",
    "이미지이름",
    "그림추천",
    "이미지추천",
)


def _normalize_question(question: str) -> str:
    return re.sub(r"\s+", "", (question or "").strip())


def _wants_source(question: str) -> bool:
    normalized = _normalize_question(question)
    return any(token in normalized for token in _SOURCE_REQUEST_TOKENS)


def _wants_image_help(question: str) -> bool:
    normalized = _normalize_question(question.lower())
    return any(token in normalized for token in _IMAGE_HELP_TOKENS)


def _wants_service_help(question: str) -> bool:
    return is_service_help_question(question)


def _wants_writing_rules(question: str) -> bool:
    normalized = _normalize_question(question.lower())
    if any(token in normalized for token in _WRITING_RULES_TOKENS):
        return True
    if ("기준" in normalized or "규칙" in normalized) and any(
        key in normalized for key in ("번역", "이지리드", "쉬운글", "작성")
    ):
        return True
    return False


def search_image_titles(query: str, *, limit: int | None = None) -> list[dict[str, str]]:
    if not query.strip():
        return []

    catalog = [item for item in list_image_catalog() if (item.get("title") or "").strip()]
    if not catalog:
        return []

    title_to_item = {str(item.get("title") or "").strip(): item for item in catalog}
    titles = list(title_to_item.keys())
    matches = process.extract(
        query,
        titles,
        scorer=fuzz.token_set_ratio,
        limit=len(titles),
    )

    results: list[dict[str, str]] = []
    seen_titles: set[str] = set()
    for title, score, _ in matches:
        if score < 35:
            continue
        if not title or title in seen_titles:
            continue
        item = title_to_item.get(title)
        if not item:
            continue
        seen_titles.add(title)
        results.append(
            {
                "title": title,
                "image_file": str(item.get("image_file") or "").strip(),
            }
        )
        if limit is not None and len(results) >= limit:
            break
    return results


def search_image_catalog(query: str) -> list[dict[str, str]]:
    return search_image_titles(query, limit=IMAGE_TITLE_RECOMMEND_LIMIT)


def _build_image_title_reply(hits: list[dict[str, str]]) -> str:
    if not hits:
        return _fallback_unresolved_reply()
    lines = ["관련된 이미지 title 후보는 아래와 같습니다."]
    for hit in hits:
        image_file = hit.get("image_file") or ""
        if image_file:
            lines.append(f"- {hit['title']} ({image_file})")
        else:
            lines.append(f"- {hit['title']}")
    return "\n".join(lines)


def _sanitize_reply(reply: str) -> str:
    cleaned_lines: list[str] = []
    for line in reply.splitlines():
        if re.search(r"(출처\s*:|참고\s*:|근거\s*:|웹\s*검색\s*결과|DB\s*자료|문서\s*맥락)", line):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def _remove_source_sentences(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    filtered = [part for part in parts if part and not re.search(r"(출처|참고|근거)", part)]
    return " ".join(filtered).strip() if filtered else text.strip()


def _normalize_reply_markup(reply: str) -> str:
    return reply.strip()


def _sanitize_reply_for_request(reply: str, *, wants_source: bool) -> str:
    cleaned = reply.replace(NEED_WEB_MARKER, "").strip()
    if wants_source:
        return _normalize_reply_markup(cleaned)
    sanitized = _sanitize_reply(cleaned)
    return _remove_source_sentences(sanitized)


def _fallback_unresolved_reply() -> str:
    return (
        "답변에 필요한 정보를 찾지 못했습니다. "
        "질문을 조금 더 구체적으로 말씀해 주세요."
    )


def search_legal_db(query: str, *, limit: int = DB_RESULT_LIMIT) -> list[dict[str, str]]:
    """LEGAL_DB에서 질의와 관련된 이지리드 사례 검색."""
    if not query.strip() or not LEGAL_DB:
        return []

    matches = process.extract(
        query,
        LEGAL_DB.keys(),
        scorer=fuzz.token_set_ratio,
        limit=limit,
    )

    hits: list[dict[str, str]] = []
    seen: set[str] = set()
    for key, score, _ in matches:
        if score < DB_MATCH_THRESHOLD:
            continue
        if key in seen:
            continue
        seen.add(key)
        entries = LEGAL_DB.get(key) or []
        if not entries:
            continue
        entry = entries[0]
        hits.append(
            {
                "original": key,
                "easy_text": (entry.get("easy_text") or "").strip(),
                "title": (entry.get("title") or "").strip(),
                "score": str(score),
            }
        )
    return hits


async def build_document_context(doc_id: str | None) -> str:
    if not doc_id:
        return ""
    doc = await get_document(doc_id)
    if not doc:
        return ""

    parts = [
        f"파일명: {doc.filename}",
        f"사건 유형: {doc.doc_type}",
        f"진행 단계: {doc.stage}",
    ]
    if doc.summary:
        parts.append(f"요약:\n{doc.summary[:4000]}")
    translation = doc.translation_text
    if not translation and doc.translation_segments:
        translation = "\n\n".join(s.easy_text for s in doc.translation_segments if s.easy_text)
    if translation:
        parts.append(f"이지리드 번역:\n{translation[:4000]}")
    if doc.full_text and not doc.summary:
        parts.append(f"원문 발췌:\n{doc.full_text[:2000]}")
    return "\n\n".join(parts)


def _format_db_context(hits: list[dict[str, str]]) -> str:
    if not hits:
        return ""
    blocks: list[str] = []
    for i, hit in enumerate(hits, 1):
        title = f" — {hit['title']}" if hit.get("title") else ""
        blocks.append(
            f"{i}. [원문] {hit['original']}{title}\n   [이지리드] {hit['easy_text']}"
        )
    return "\n\n".join(blocks)


def _build_user_payload(
    question: str,
    *,
    usage_guide_context: str,
    db_context: str,
    doc_context: str,
    page_context: str = "",
    image_context: str = "",
    web_context: str = "",
    writing_rules_context: str = "",
    wants_source: bool = False,
) -> str:
    sections = [
        "## 사용자 질문",
        question.strip(),
        "",
    ]
    if writing_rules_context.strip():
        sections.extend(
            [
                "## 번역·이지리드 작성 기준",
                writing_rules_context.strip(),
                "",
            ]
        )
    sections.extend(
        [
            "## 사용방안 DB",
            usage_guide_context,
        ]
    )
    if db_context.strip():
        sections.extend(["", "## DB 자료 (법률·이지리드 사례)", db_context])
    if doc_context.strip():
        sections.extend(["", "## 현재 작업 중인 문서", doc_context.strip()])
    if page_context.strip():
        sections.extend(["", "## 현재 화면 맥락", page_context.strip()])
    if image_context.strip():
        sections.extend(["", "## 이미지 후보", image_context.strip()])
    if web_context.strip():
        sections.extend(["", "## 웹 검색 결과", web_context.strip()])
    sections.extend(
        [
            "",
            "## 지시",
            "위 자료를 우선 활용해 질문에 바로 답하세요. 사용자에게 출처, 참고, 근거, 검색 과정은 언급하지 마세요.",
            "질문이 번역 기준·작성 규칙·이지리드 규칙에 관한 것이라면 번역·이지리드 작성 기준을 우선으로 설명하세요.",
            "질문이 화면 구성이나 버튼 기능에 관한 것이라면 사용방안 DB와 현재 화면 맥락을 기준으로 설명하세요.",
            "현재 화면 맥락이 있으면 버튼 이름, 위치, 동작을 그 맥락에 맞게 설명하세요.",
            "질문이 그림·이미지 추천에 관한 것이라면 이미지 후보의 title을 우선 추천하세요.",
        ]
    )
    if wants_source:
        sections.extend(
            [
                "",
                "## 출처 응답 허용",
                "사용자가 출처를 요구한 경우에만, 답변 끝에 간단히 출처를 알려도 됩니다.",
                "가능하면 짧게 '출처: DB 자료', '출처: 현재 문서', '출처: 웹 검색 결과', '출처: 사용방안 DB', '출처: 작성 기준'처럼 적으세요.",
            ]
        )
    return "\n".join(sections)


def _messages_for_solar(
    system: str,
    history: list[ChatMessage],
    user_payload: str,
) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for msg in history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": user_payload})
    return messages


def _format_image_context(hits: list[dict[str, str]]) -> str:
    if not hits:
        return ""
    lines: list[str] = []
    for idx, hit in enumerate(hits, 1):
        lines.append(f"{idx}. 제목: {hit['title']} | 파일: {hit['image_file']}")
    return "\n\n".join(lines)


def _should_include_image_context(question: str, image_hits: list[dict[str, str]]) -> bool:
    if not image_hits:
        return False
    normalized = _normalize_question(question.lower())
    return any(token in normalized for token in ("그림", "이미지", "시각", "image"))


def _needs_web_fallback(reply: str, db_hits: list[dict], doc_context: str) -> bool:
    if db_hits or doc_context.strip():
        return False
    return not reply.strip()


async def answer_chat(
    question: str,
    *,
    doc_id: str | None = None,
    history: list[ChatMessage] | None = None,
    page_context: str | None = None,
    page_path: str | None = None,
) -> ChatResponse:
    history = history or []
    wants_source = _wants_source(question)
    wants_image_help = _wants_image_help(question)
    wants_writing_rules = _wants_writing_rules(question)
    # 작성 기준 질문은 FAQ/퀵리플라이(번역문 위치 안내 등)로 가로채지 않음
    wants_service_help = _wants_service_help(question) and not wants_writing_rules

    if wants_image_help:
        image_hits = search_image_titles(question, limit=IMAGE_TITLE_RECOMMEND_LIMIT)
        return ChatResponse(reply=_build_image_title_reply(image_hits), sources=["db_rules"])

    if wants_service_help:
        quick_reply = match_quick_reply(question)
        if quick_reply:
            return ChatResponse(reply=quick_reply, sources=["service_guide"])

    system = load_chatbot_prompt()
    usage_guide_context = format_usage_guide_context(question)
    db_hits = [] if wants_writing_rules else search_legal_db(question)
    db_context = _format_db_context(db_hits)
    image_hits = search_image_catalog(question)
    image_context = (
        _format_image_context(image_hits) if _should_include_image_context(question, image_hits) else ""
    )
    doc_context = await build_document_context(doc_id)
    resolved_page_context = resolve_page_context(page_path, inline_context=page_context)
    writing_rules_context = ""
    if wants_writing_rules:
        doc_type = None
        if doc_id:
            doc = await get_document(doc_id)
            if doc and doc.doc_type and doc.doc_type != "unknown":
                doc_type = doc.doc_type
        writing_rules_context = format_chat_writing_rules_context(doc_type)
    sources: list[str] = []

    payload = _build_user_payload(
        question,
        usage_guide_context=usage_guide_context,
        db_context=db_context,
        doc_context=doc_context,
        page_context=resolved_page_context,
        image_context=image_context,
        writing_rules_context=writing_rules_context,
        wants_source=wants_source,
    )
    messages = _messages_for_solar(system, history, payload)
    reply = await upstage.chat_completion_messages(messages, max_tokens=2048)
    reply = _sanitize_reply_for_request(reply, wants_source=wants_source)
    reply = reply.replace(NEED_WEB_MARKER, "").strip()
    if not reply:
        reply = _fallback_unresolved_reply()

    if _needs_web_fallback(reply, db_hits, doc_context) and not writing_rules_context.strip():
        web_context = await search_web(question)
        if web_context.strip():
            sources.append("web")
            payload = _build_user_payload(
                question,
                usage_guide_context=usage_guide_context,
                db_context=db_context,
                doc_context=doc_context,
                page_context=resolved_page_context,
                web_context=web_context,
                writing_rules_context=writing_rules_context,
                wants_source=wants_source,
            )
            messages = _messages_for_solar(system, history, payload)
            reply = await upstage.chat_completion_messages(messages, max_tokens=2048)
            reply = _sanitize_reply_for_request(reply, wants_source=wants_source)
            reply = reply.replace(NEED_WEB_MARKER, "").strip()
            if not reply:
                reply = _fallback_unresolved_reply()
        elif not db_hits and not doc_context.strip():
            reply = _fallback_unresolved_reply()
    else:
        if writing_rules_context.strip():
            sources.append("service_guide")
        if db_hits:
            sources.append("db")
        if doc_context.strip():
            sources.append("document")
        if resolved_page_context.strip() or wants_service_help:
            if "service_guide" not in sources:
                sources.append("service_guide")

    if not sources:
        sources.append("solar")

    reply_text = reply.strip()
    # 챗봇 답변에 시각자료 카드/생성 이미지를 붙이지 않음
    visual_aids: list[ChatVisualAid] = []

    return ChatResponse(reply=reply_text, sources=sources, visual_aids=visual_aids)
