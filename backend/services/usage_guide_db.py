from __future__ import annotations

"""사용방안 DB — YAML 기반 서비스 이용 가이드 검색·매칭."""

import re
from functools import lru_cache
from typing import Any

import yaml
from rapidfuzz import fuzz, process

from backend.config import DATA_DIR, PROMPTS_DIR

USAGE_GUIDE_OVERRIDE = DATA_DIR / "usage_guide.yaml"
USAGE_GUIDE_DEFAULT = PROMPTS_DIR / "usage_guide.yaml"
SECTION_MATCH_THRESHOLD = 50


def _normalize(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip())


def _load_yaml(path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@lru_cache(maxsize=1)
def load_usage_guide() -> dict[str, Any]:
    if USAGE_GUIDE_OVERRIDE.exists():
        data = _load_yaml(USAGE_GUIDE_OVERRIDE)
        if data:
            return data
    return _load_yaml(USAGE_GUIDE_DEFAULT)


def reload_usage_guide() -> None:
    load_usage_guide.cache_clear()


def _section_search_text(section: dict[str, Any]) -> str:
    parts = [str(section.get("title") or "")]
    parts.extend(str(k) for k in (section.get("keywords") or []))
    parts.extend(str(item) for item in (section.get("items") or []))
    for sub in section.get("subsections") or []:
        if isinstance(sub, dict):
            parts.append(str(sub.get("title") or ""))
            parts.extend(str(item) for item in (sub.get("items") or []))
    return " ".join(parts)


def search_usage_sections(query: str, *, limit: int = 4) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    data = load_usage_guide()
    sections = [s for s in (data.get("sections") or []) if isinstance(s, dict)]
    if not sections:
        return []

    choices = {str(s.get("id") or idx): _section_search_text(s) for idx, s in enumerate(sections)}
    matches = process.extract(
        query,
        choices,
        scorer=fuzz.token_set_ratio,
        limit=len(choices),
    )

    hits: list[dict[str, Any]] = []
    seen: set[str] = set()
    id_to_section = {str(s.get("id") or idx): s for idx, s in enumerate(sections)}
    for key, score, _ in matches:
        if score < SECTION_MATCH_THRESHOLD or key in seen:
            continue
        seen.add(key)
        section = id_to_section.get(key)
        if section:
            hits.append(section)
        if len(hits) >= limit:
            break
    return hits


def _format_section(section: dict[str, Any]) -> str:
    lines = [f"## {section.get('title', '').strip()}"]
    for item in section.get("items") or []:
        lines.append(f"- {item}")
    for sub in section.get("subsections") or []:
        if not isinstance(sub, dict):
            continue
        title = (sub.get("title") or "").strip()
        if title:
            lines.append(f"### {title}")
        for item in sub.get("items") or []:
            lines.append(f"- {item}")
    return "\n".join(lines)


def format_usage_guide_context(query: str) -> str:
    data = load_usage_guide()
    overview = data.get("overview") or {}
    parts: list[str] = []

    title = (overview.get("title") or "ERAI 서비스 이용 가이드").strip()
    parts.append(f"## {title}")
    for item in overview.get("items") or []:
        parts.append(f"- {item}")

    matched = search_usage_sections(query)
    if matched:
        parts.append("")
        parts.append("## 질문과 관련된 사용방안")
        for section in matched:
            parts.append("")
            parts.append(_format_section(section))
    else:
        for section in data.get("sections") or []:
            if isinstance(section, dict):
                parts.append("")
                parts.append(_format_section(section))

    faq_block = _format_faq_context(query)
    if faq_block:
        parts.append("")
        parts.append(faq_block)

    return "\n".join(parts).strip()


def _format_faq_context(query: str) -> str:
    data = load_usage_guide()
    faq_items = data.get("faq") or []
    if not faq_items:
        return ""

    normalized_query = _normalize(query)
    matched_answers: list[str] = []
    for item in faq_items:
        if not isinstance(item, dict):
            continue
        triggers = item.get("triggers") or []
        for trigger in triggers:
            trigger_norm = _normalize(str(trigger))
            if trigger_norm and trigger_norm in normalized_query:
                answer = str(item.get("answer") or "").strip()
                if answer and answer not in matched_answers:
                    matched_answers.append(answer)
                break

    if not matched_answers:
        return ""

    lines = ["## 자주 묻는 질문 (매칭됨)"]
    for answer in matched_answers:
        lines.append(f"- {answer}")
    return "\n".join(lines)


def match_faq_reply(question: str) -> str | None:
    """FAQ는 부분문자열 포함만 허용한다.

    partial_ratio 퍼지 매칭은 '번역 보' ↔ '번역 기준이 뭐야'처럼
    짧은 트리거가 무관한 질문에 오매칭되므로 사용하지 않는다.
    """
    data = load_usage_guide()
    normalized = _normalize(question)
    best_len = 0
    best_answer: str | None = None

    for item in data.get("faq") or []:
        if not isinstance(item, dict):
            continue
        for trigger in item.get("triggers") or []:
            trigger_norm = _normalize(str(trigger))
            if not trigger_norm or trigger_norm not in normalized:
                continue
            # 더 긴 트리거를 우선 (예: '번역문 열기' > '번역 보')
            if len(trigger_norm) > best_len:
                best_len = len(trigger_norm)
                best_answer = str(item.get("answer") or "").strip() or None

    return best_answer


def match_quick_reply(question: str) -> str | None:
    data = load_usage_guide()
    normalized = _normalize(question)

    faq_reply = match_faq_reply(question)
    if faq_reply:
        return faq_reply

    for rule in data.get("quick_replies") or []:
        if not isinstance(rule, dict):
            continue
        triggers = [_normalize(str(t)) for t in (rule.get("triggers") or []) if str(t).strip()]
        if not triggers:
            continue
        if not any(token in normalized for token in triggers):
            continue

        service_intent = [_normalize(str(t)) for t in (rule.get("service_intent") or [])]
        if service_intent and not any(token in normalized for token in service_intent):
            if rule.get("id") in {"past_documents", "past_results"}:
                continue

        reply = str(rule.get("reply") or "").strip()
        if reply:
            return reply.replace("\n", " ").strip()

    return None


def is_service_help_question(question: str) -> bool:
    normalized = _normalize(question)
    if match_quick_reply(question):
        return True

    data = load_usage_guide()
    keywords = [_normalize(str(k)) for k in (data.get("service_help_keywords") or [])]
    return any(k in normalized for k in keywords if k)


def resolve_page_context(page_path: str | None, *, inline_context: str | None = None) -> str:
    if inline_context and inline_context.strip():
        return inline_context.strip()
    if not page_path:
        return ""

    data = load_usage_guide()
    contexts = data.get("page_contexts") or {}
    path = page_path.strip()

    if path in contexts:
        return _format_page_context(contexts[path], path)

    for pattern, ctx in contexts.items():
        if pattern in {"default", "/"}:
            continue
        if pattern.startswith("*") and pattern.endswith("*"):
            needle = pattern[1:-1]
            if needle and needle in path:
                return _format_page_context(ctx, path)

    default = contexts.get("default") or {}
    template = str(default.get("template") or "").strip()
    if template:
        return template.format(page_path=path)
    return f"현재 화면 경로: {path}"


def _format_page_context(ctx: dict[str, Any], page_path: str) -> str:
    if not isinstance(ctx, dict):
        return str(ctx).strip()

    screen = str(ctx.get("screen") or "").strip()
    lines = ctx.get("lines") or []
    parts: list[str] = []
    if screen:
        parts.append(f"현재 화면: {screen}")
    else:
        parts.append(f"현재 화면 경로: {page_path}")
    parts.extend(str(line) for line in lines if str(line).strip())
    return "\n".join(parts)
