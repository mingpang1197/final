from __future__ import annotations

import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response

from backend.config import UPLOAD_DIR, settings
from backend.database import (
    create_document,
    ensure_document,
    get_document,
    get_doc_type,
    get_page,
    update_summary,
    update_translation,
)
from backend.models.schemas import (
    ChecklistReport,
    DocumentResponse,
    ExportRequest,
    ImageCatalogItem,
    ImagePlacement,
    RefineRequest,
    SummarizeRequest,
    SummaryUpdate,
    TranslationUpdate,
    UploadResponse,
)
from backend.services.image_matcher import detect_image_placements, list_image_catalog
from backend.services import parser, prompts, translator, upstage, word_export

router = APIRouter(prefix="/documents", tags=["documents"])


def _source_path(doc_id: str, filename: str) -> Path:
    ext = Path(filename).suffix.lower() or ".bin"
    return UPLOAD_DIR / f"{doc_id}_source{ext}"


_ITEM_START_RE = re.compile(
    r"^(?:<[^>]{1,60}>|\(\d+\)|\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩]|[가-힣]\.|[-*•·])\s*"
)

_PAGE_NUMBER_RE = re.compile(r"^\s*-\s*\d+\s*-\s*$")

_SUMMARY_HEADING_ALIASES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^(?:1[.)]\s*)?<*\s*먼저,?\s*법원의\s*판단을\s*알려드립니다\s*>*$"), "<먼저, 법원의 판단을 알려드립니다>"),
    (re.compile(r"^(?:2[.)]\s*)?<*\s*어떤\s*일이\s*있었나요\??\s*>*$"), "<어떤 일이 있었나요?>"),
    (re.compile(r"^(?:3[.)]\s*)?<*\s*법원이\s*판단한\s*문제는\s*무엇인가요\??\s*>*$"), "<법원이 판단한 문제는 무엇인가요?>"),
    (re.compile(r"^(?:4[.)]\s*)?<*\s*법원은\s*어떻게\s*판단했나요\??\s*>*$"), "<법원은 어떻게 판단했나요?>"),
    (re.compile(r"^(?:5[.)]\s*)?<*\s*최종\s*결과는\s*무엇인가요\??\s*>*$"), "<최종 결과는 무엇인가요?>"),
]

_TRUNCATED_END_RE = re.compile(r"[,:;\-\(\[\{]$|(?:및|또는|등)$")


def _canonicalize_summary_heading(line: str) -> str | None:
    target = line.strip()
    for pattern, canonical in _SUMMARY_HEADING_ALIASES:
        if pattern.match(target):
            return canonical
    return None


def _standardize_summary_sections(text: str) -> str:
    lines = text.split("\n")
    out: list[str] = []
    for raw in lines:
        stripped = raw.strip()
        canonical = _canonicalize_summary_heading(stripped)
        if canonical:
            if out and out[-1] != "":
                out.append("")
            out.append(canonical)
            continue
        out.append(raw.rstrip())
    return "\n".join(out)


def _enforce_item_paragraphs(text: str) -> str:
    lines = text.split("\n")
    out: list[str] = []
    prev_nonblank = ""

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()

        if not stripped:
            if out and out[-1] != "":
                out.append("")
            continue

        if _PAGE_NUMBER_RE.match(stripped):
            continue

        is_item_start = bool(_ITEM_START_RE.match(stripped))
        if out and out[-1] != "" and is_item_start and prev_nonblank:
            out.append("")

        out.append(stripped)
        prev_nonblank = stripped

    return "\n".join(out).strip()


def _normalize_summary_text(text: str) -> str:
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _standardize_summary_sections(cleaned)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = _enforce_item_paragraphs(cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _count_canonical_headings(text: str) -> int:
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    count = 0
    for line in lines:
        if _canonicalize_summary_heading(line):
            count += 1
    return count


def _looks_truncated_summary(base: str, candidate: str) -> bool:
    if not candidate:
        return True

    if len(candidate) < max(240, int(len(base) * 0.65)):
        return True

    base_headings = _count_canonical_headings(base)
    cand_headings = _count_canonical_headings(candidate)
    if base_headings >= 3 and cand_headings < max(1, base_headings - 1):
        return True

    tail = candidate.strip()
    if _TRUNCATED_END_RE.search(tail):
        return True

    return False


async def _polish_summary_text(text: str) -> str:
    base = _normalize_summary_text(text)
    if not base:
        return base
    if settings.use_mock:
        return base

    system = (
        "당신은 한국어 교정 편집자입니다. 문서의 의미·사실관계는 절대 바꾸지 말고, "
        "맞춤법/띄어쓰기/문장부호를 교정하고 문단 구분만 읽기 쉽게 정리하세요."
    )
    user = (
        "아래 요약문을 교정하세요.\n"
        "- 원래 의미·결론·수치·고유명사는 변경 금지\n"
        "- 맞춤법, 띄어쓰기, 문장부호만 교정\n"
        "- 문단은 주제 전환마다 줄바꿈하여 읽기 쉽게 정리\n"
        "- 제목, 주석, 설명 문구를 추가하지 말고 교정된 본문만 출력\n\n"
        f"{base}"
    )
    try:
        polished = await upstage.chat_completion(system, user, max_tokens=5000)
    except Exception:
        return base
    polished = _normalize_summary_text(polished)
    if _looks_truncated_summary(base, polished):
        return base
    return polished or base


def _doc_for_export(doc_id: str, doc: DocumentResponse | None, body: ExportRequest | None) -> DocumentResponse | None:
    if body and body.segments:
        text = body.translation_text or "\n\n".join(
            s.easy_text for s in body.segments if s.easy_text
        )
        if doc:
            return doc.model_copy(
                update={
                    "summary": body.summary if body.summary is not None else doc.summary,
                    "translation_segments": body.segments,
                    "translation_text": text,
                    "stage": "translated",
                }
            )
        return DocumentResponse(
            id=doc_id,
            filename=body.filename or "document.pdf",
            doc_type=body.doc_type or "unknown",
            stage="translated",
            page_count=len(body.pages or []),
            full_text=body.full_text or "",
            summary=body.summary,
            translation_segments=body.segments,
            translation_text=text,
        )
    return doc


async def _resolve_document(doc_id: str, body: ExportRequest | None) -> DocumentResponse | None:
    doc = await get_document(doc_id)
    if doc:
        return doc
    if body and body.full_text:
        pages = body.pages or [body.full_text]
        await ensure_document(
            doc_id,
            filename=body.filename or "upload.pdf",
            doc_type=body.doc_type or "unknown",
            pages=pages,
            full_text=body.full_text,
        )
        return await get_document(doc_id)
    return None


@router.get("/catalog/images", response_model=list[ImageCatalogItem])
async def image_catalog(q: str = Query("")) -> list[ImageCatalogItem]:
    return [ImageCatalogItem(**item) for item in list_image_catalog(q)]


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(400, "파일명이 없습니다.")

    ext = Path(file.filename).suffix.lower()
    allowed = {".pdf", ".png", ".jpg", ".jpeg", ".txt", ".doc", ".docx", ".hwp", ".hwpx"}
    if ext not in allowed:
        raise HTTPException(400, f"지원하지 않는 형식: {ext}")

    content = await file.read()
    save_path = UPLOAD_DIR / f"{uuid.uuid4()}{ext}"
    save_path.write_bytes(content)

    try:
        pages, full_text = await upstage.extract_text_from_file(save_path, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    doc_type = parser.classify_doc_type(full_text)

    doc_id = await create_document(file.filename, doc_type, pages, full_text)
    _source_path(doc_id, file.filename).write_bytes(content)
    return UploadResponse(
        id=doc_id,
        filename=file.filename,
        doc_type=doc_type,
        page_count=len(pages),
        message="업로드 및 OCR 완료",
        pages=pages,
        full_text=full_text,
    )


@router.get("/{doc_id}/source")
async def read_source_file(doc_id: str) -> FileResponse:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")

    path = _source_path(doc_id, doc.filename)
    if not path.is_file():
        raise HTTPException(404, "원본 파일을 찾을 수 없습니다.")

    media_type, _ = mimetypes.guess_type(doc.filename)
    return FileResponse(
        path=path,
        media_type=media_type or "application/octet-stream",
        filename=doc.filename,
        content_disposition_type="inline",
    )


@router.head("/{doc_id}/source")
async def head_source_file(doc_id: str) -> Response:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")

    path = _source_path(doc_id, doc.filename)
    if not path.is_file():
        raise HTTPException(404, "원본 파일을 찾을 수 없습니다.")

    media_type, _ = mimetypes.guess_type(doc.filename)
    return Response(status_code=200, media_type=media_type or "application/octet-stream")


@router.get("/{doc_id}", response_model=DocumentResponse)
async def read_document(doc_id: str) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    return doc


@router.get("/{doc_id}/pages/{page_num}")
async def read_page(doc_id: str, page_num: int) -> dict[str, str]:
    page = await get_page(doc_id, page_num)
    if page is None:
        raise HTTPException(404, "페이지를 찾을 수 없습니다.")
    return {"page": page}


@router.post("/{doc_id}/summarize", response_model=DocumentResponse)
async def summarize_document(
    doc_id: str,
    force: bool = Query(False),
    body: SummarizeRequest | None = None,
) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc:
        if not body or not body.full_text:
            raise HTTPException(404, "문서를 찾을 수 없습니다.")
        pages = body.pages or [body.full_text]
        await ensure_document(
            doc_id,
            filename=body.filename or "upload.pdf",
            doc_type=body.doc_type or "unknown",
            pages=pages,
            full_text=body.full_text,
        )
        doc = await get_document(doc_id)
        if not doc:
            raise HTTPException(404, "문서를 복구하지 못했습니다.")
    if doc.summary and not force:
        return doc

    system = prompts.build_summary_system_prompt(doc.doc_type)
    user = f"다음 판결문을 요약하세요:\n\n{doc.full_text}"
    summary = await upstage.chat_completion(system, user)
    summary = await _polish_summary_text(summary)
    await update_summary(doc_id, summary)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.patch("/{doc_id}/summary", response_model=DocumentResponse)
async def patch_summary(doc_id: str, body: SummaryUpdate) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc and body.full_text:
        pages = body.pages or [body.full_text]
        await ensure_document(
            doc_id,
            filename=body.filename or "upload.pdf",
            doc_type=body.doc_type or "unknown",
            pages=pages,
            full_text=body.full_text,
        )
        doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    await update_summary(doc_id, body.summary)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.post("/{doc_id}/summary/refine", response_model=DocumentResponse)
async def refine_summary(doc_id: str, body: RefineRequest) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    current = doc.summary or ""
    system = prompts.build_summary_system_prompt(doc.doc_type)
    user = f"현재 요약:\n{current}\n\n다음 지시에 따라 요약을 수정하세요:\n{body.prompt}"
    revised = await upstage.chat_completion(system, user)
    revised = await _polish_summary_text(revised)
    await update_summary(doc_id, revised)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.post("/{doc_id}/translate", response_model=DocumentResponse)
async def translate_document(doc_id: str) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    if not doc.summary:
        raise HTTPException(400, "먼저 요약을 생성하세요.")

    segments, text, checklist_report = await translator.translate_summary(
        doc.summary, doc.full_text, doc.doc_type
    )
    await update_translation(doc_id, segments, text, checklist=checklist_report)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.post("/{doc_id}/translation/detect-placements", response_model=list[ImagePlacement])
async def detect_translation_placements(doc_id: str) -> list[ImagePlacement]:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    text = doc.translation_text or "\n\n".join(
        s.easy_text for s in doc.translation_segments if s.easy_text
    )
    if not text.strip():
        raise HTTPException(400, "번역본이 없습니다.")
    return detect_image_placements(text)


@router.patch("/{doc_id}/translation", response_model=DocumentResponse)
async def patch_translation(doc_id: str, body: TranslationUpdate) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc and body.full_text:
        pages = body.pages or [body.full_text]
        await ensure_document(
            doc_id,
            filename=body.filename or "upload.pdf",
            doc_type=body.doc_type or "unknown",
            pages=pages,
            full_text=body.full_text,
        )
        doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    text = "\n\n".join(s.easy_text for s in body.segments)
    checklist_report = translator.run_checklist(text)
    await update_translation(doc_id, body.segments, text, checklist=checklist_report)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.post("/{doc_id}/translation/refine", response_model=DocumentResponse)
async def refine_translation(doc_id: str, body: RefineRequest) -> DocumentResponse:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    doc_type = await get_doc_type(doc_id) or "unknown"
    segments, text, checklist_report = await translator.refine_translation(
        doc.translation_segments, body.prompt, doc_type
    )
    await update_translation(doc_id, segments, text, checklist=checklist_report)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.post("/{doc_id}/translation/checklist", response_model=ChecklistReport)
async def run_translation_checklist(doc_id: str) -> ChecklistReport:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    text = doc.translation_text or "\n\n".join(
        s.easy_text for s in doc.translation_segments
    )
    if not text.strip():
        raise HTTPException(400, "번역본이 없습니다.")
    report = translator.run_checklist(text)
    if doc.translation_segments:
        await update_translation(
            doc_id, doc.translation_segments, text, checklist=report
        )
    return report


@router.get("/{doc_id}/export.docx")
async def export_docx_get(doc_id: str) -> Response:
    return await _export_docx(doc_id, None)


@router.post("/{doc_id}/export.docx")
async def export_docx_post(doc_id: str, body: ExportRequest | None = None) -> Response:
    return await _export_docx(doc_id, body)


async def _export_docx(doc_id: str, body: ExportRequest | None) -> Response:
    doc = await _resolve_document(doc_id, body)
    doc = _doc_for_export(doc_id, doc, body)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    if not doc.translation_text and not doc.summary and not doc.translation_segments:
        raise HTTPException(400, "내보낼 내용이 없습니다.")

    content = word_export.export_to_docx(doc)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="easyread_{doc_id[:8]}.docx"'},
    )
