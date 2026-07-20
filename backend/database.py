import json
import uuid
from datetime import datetime, timezone

import aiosqlite

from backend.config import DB_PATH
from backend.models.schemas import (
    ChecklistReport,
    DocumentResponse,
    DocType,
    TranslationSegment,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                doc_type TEXT NOT NULL,
                stage TEXT NOT NULL,
                page_count INTEGER NOT NULL,
                pages_json TEXT NOT NULL,
                full_text TEXT NOT NULL,
                summary TEXT,
                translation_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        await db.commit()


async def create_document(
    filename: str,
    doc_type: DocType,
    pages: list[str],
    full_text: str,
) -> str:
    doc_id = str(uuid.uuid4())
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO documents
            (id, filename, doc_type, stage, page_count, pages_json, full_text,
             summary, translation_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                doc_id,
                filename,
                doc_type,
                "uploaded",
                len(pages),
                json.dumps(pages, ensure_ascii=False),
                full_text,
                now,
                now,
            ),
        )
        await db.commit()
    return doc_id


async def get_document(doc_id: str) -> DocumentResponse | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None

    segments: list[TranslationSegment] = []
    translation_text = None
    checklist = None
    if row["translation_json"]:
        payload = json.loads(row["translation_json"])
        segments = [TranslationSegment(**s) for s in payload.get("segments", [])]
        translation_text = payload.get("text")
        if payload.get("checklist"):
            checklist = ChecklistReport(**payload["checklist"])

    return DocumentResponse(
        id=row["id"],
        filename=row["filename"],
        doc_type=row["doc_type"],
        stage=row["stage"],
        page_count=row["page_count"],
        full_text=row["full_text"],
        summary=row["summary"],
        translation_segments=segments,
        translation_text=translation_text,
        checklist=checklist,
    )


async def get_page(doc_id: str, page_num: int) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT pages_json FROM documents WHERE id = ?", (doc_id,)
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    pages = json.loads(row["pages_json"])
    if page_num < 1 or page_num > len(pages):
        return None
    return pages[page_num - 1]


async def update_summary(doc_id: str, summary: str) -> None:
    now = _now()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE documents SET summary = ?, stage = ?, updated_at = ? WHERE id = ?
            """,
            (summary, "summarized", now, doc_id),
        )
        await db.commit()


async def update_translation(
    doc_id: str,
    segments: list[TranslationSegment],
    text: str,
    checklist: ChecklistReport | None = None,
) -> None:
    now = _now()
    payload: dict = {
        "segments": [s.model_dump() for s in segments],
        "text": text,
    }
    if checklist:
        payload["checklist"] = checklist.model_dump()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            UPDATE documents SET translation_json = ?, stage = ?, updated_at = ? WHERE id = ?
            """,
            (json.dumps(payload, ensure_ascii=False), "translated", now, doc_id),
        )
        await db.commit()


async def get_doc_type(doc_id: str) -> DocType | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT doc_type FROM documents WHERE id = ?", (doc_id,)) as cursor:
            row = await cursor.fetchone()
    return row[0] if row else None
