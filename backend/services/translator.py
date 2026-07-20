"""Translation orchestration: LEGAL_DB + Solar fallback + checklist."""

from __future__ import annotations

import uuid

from backend.models.schemas import ChecklistReport, DocType, TranslationSegment
from backend.services import checklist, matcher, prompts, upstage
from backend.services.easy_read_sanitize import sanitize_translation_text
from backend.services.image_matcher import detect_image_placements


def _build_checklist_report(text: str) -> ChecklistReport:
    raw = checklist.validate_easy_read(text)
    return ChecklistReport(**raw)


async def _revise_for_checklist(
    text: str,
    report: ChecklistReport,
    doc_type: DocType,
) -> str:
    issues = checklist.format_checklist_for_prompt(report.model_dump())
    if not issues.strip():
        return text
    system = prompts.build_translation_system_prompt(doc_type)
    user = (
        "다음 이지리드 번역본을 체크리스트에 맞게 **수정**하세요.\n"
        "의미는 유지하고, 아래 문제만 고치세요.\n"
        "**수정된 이지리드 번역본**, **수정 사항 설명** 같은 메타 제목·설명은 출력하지 마세요.\n"
        "번역본 본문만 출력하세요.\n\n"
        f"## 체크리스트 지적 사항\n{issues}\n\n"
        f"## 현재 번역본\n{text}"
    )
    revised = await upstage.chat_completion(system, user)
    return sanitize_translation_text(revised)


def _attach_placements(segments: list[TranslationSegment], text: str) -> list[TranslationSegment]:
    if not segments:
        return segments
    segments[0].image_placements = detect_image_placements(text)
    return segments


def _merge_db_images(
    db_segments: list[TranslationSegment],
    easy_text: str,
) -> list[TranslationSegment]:
    """Keep a single main translation segment; images are inserted at export time."""
    return [
        TranslationSegment(
            id=str(uuid.uuid4()),
            original=db_segments[0].original if db_segments else easy_text[:80],
            easy_text=easy_text,
            source="solar",
        )
    ]


async def translate_summary(
    summary: str,
    full_text: str,
    doc_type: DocType,
) -> tuple[list[TranslationSegment], str, ChecklistReport]:
    db_segments = matcher.translate_with_db(summary, full_context=full_text)
    db_hits = [s for s in db_segments if s.source == "db"]
    needs_solar = any(s.source == "solar" for s in db_segments) or not db_hits

    if needs_solar:
        system = prompts.build_translation_system_prompt(doc_type)
        user = (
            "다음 판결 요약 전체를 이지리드로 번역하세요. "
            "공통 작성 규칙·판결 유형 규칙·예시를 따르세요.\n\n"
            f"{summary}"
        )
        easy_text = await upstage.chat_completion(system, user)
        easy_text = sanitize_translation_text(easy_text)
        segments = _merge_db_images(db_hits, easy_text)
    else:
        segments = db_hits
        easy_text = "\n\n".join(s.easy_text for s in segments)

    text = easy_text if needs_solar else "\n\n".join(s.easy_text for s in segments)
    report = _build_checklist_report(text)

    if report.overall in ("fail", "warn"):
        revised = await _revise_for_checklist(text, report, doc_type)
        revised_report = _build_checklist_report(revised)
        if revised_report.overall != "fail" or report.overall == "fail":
            text = revised
            report = revised_report
            segments[0].easy_text = text
            segments[0].source = "solar"

    segments = _attach_placements(segments, text)
    return segments, text, report


async def refine_translation(
    segments: list[TranslationSegment],
    instruction: str,
    doc_type: DocType,
) -> tuple[list[TranslationSegment], str, ChecklistReport]:
    current = "\n".join(s.easy_text for s in segments)
    system = prompts.build_translation_system_prompt(doc_type)
    user = f"현재 번역:\n{current}\n\n다음 지시에 따라 번역을 수정하세요:\n{instruction}"
    revised = await upstage.chat_completion(system, user)
    revised = sanitize_translation_text(revised)

    new_segments = [
        TranslationSegment(
            id=segments[0].id if segments else "1",
            original=segments[0].original if segments else "",
            easy_text=revised,
            source="solar",
            image_placements=segments[0].image_placements if segments else [],
        )
    ]
    report = _build_checklist_report(revised)
    return new_segments, revised, report


def run_checklist(text: str) -> ChecklistReport:
    return _build_checklist_report(text)
