from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response

from backend.config import UPLOAD_DIR
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


@router.get("/catalog/images", response_model=list[ImageCatalogItem])
async def image_catalog(q: str = Query("")) -> list[ImageCatalogItem]:
    return [ImageCatalogItem(**item) for item in list_image_catalog(q)]


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(400, "파일명이 없습니다.")

    ext = Path(file.filename).suffix.lower()
    allowed = {".pdf", ".png", ".jpg", ".jpeg", ".txt", ".docx"}
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
    return UploadResponse(
        id=doc_id,
        filename=file.filename,
        doc_type=doc_type,
        page_count=len(pages),
        message="업로드 및 OCR 완료",
        pages=pages,
        full_text=full_text,
    )


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
    await update_summary(doc_id, summary)
    return (await get_document(doc_id))  # type: ignore[return-value]


@router.patch("/{doc_id}/summary", response_model=DocumentResponse)
async def patch_summary(doc_id: str, body: SummaryUpdate) -> DocumentResponse:
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
async def export_docx(doc_id: str) -> Response:
    doc = await get_document(doc_id)
    if not doc:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    if not doc.translation_text and not doc.summary:
        raise HTTPException(400, "내보낼 내용이 없습니다.")

    content = word_export.export_to_docx(doc)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="easyread_{doc_id[:8]}.docx"'},
    )
