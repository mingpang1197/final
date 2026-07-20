"""Upstage Document OCR + Solar chat with mock fallback."""

from __future__ import annotations

import base64
from pathlib import Path

import httpx

from backend.config import settings
from backend.services.pdf_extract import extract_pdf_pages

SAMPLE_JUDGMENT = """주문
피고인 갑을 징역 3년에 처한다.

범죄사실
피고인은 2024년 5월 1일 서울 중구에서 피해자 을의 재물을 훔쳤다.

이유
피고인의 범행은 계획적이지 않고 반성하고 있다.
"""


async def extract_text_from_file(file_path: Path, filename: str) -> tuple[list[str], str]:
    if filename.lower().endswith(".txt"):
        text = file_path.read_text(encoding="utf-8", errors="replace")
        pages = _split_pages(text)
        return pages, "\n\n".join(pages)

    if filename.lower().endswith(".pdf"):
        local = extract_pdf_pages(file_path)
        if local:
            return local
        if settings.use_mock:
            raise ValueError(
                "PDF에서 텍스트를 추출하지 못했습니다. "
                "스캔본일 수 있습니다. .env에 UPSTAGE_API_KEY를 넣고 MOCK_UPSTAGE=false로 설정하세요."
            )

    if settings.use_mock:
        return _mock_pages(filename)

    content = file_path.read_bytes()
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            settings.upstage_ocr_url,
            headers={"Authorization": f"Bearer {settings.upstage_api_key}"},
            files={"document": (filename, content)},
            data={"ocr": "force", "base64_encoding": "['table']", "model": "document-parse"},
        )
        response.raise_for_status()
        data = response.json()
        text = data.get("text") or data.get("content", {}).get("text", "")
        if not text and "pages" in data:
            text = "\n\n".join(
                p.get("text", "") for p in data["pages"] if isinstance(p, dict)
            )
        pages = _split_pages(text or SAMPLE_JUDGMENT)
        return pages, "\n\n".join(pages)


def _mock_pages(filename: str) -> tuple[list[str], str]:
    page1 = "주문\n피고인 갑을 징역 3년에 처한다."
    page2 = "범죄사실\n피고인은 2024년 5월 1일 서울 중구에서 피해자 을의 재물을 훔쳤다."
    page3 = "이유\n피고인의 범행은 계획적이지 않고 반성하고 있다."
    pages = [page1, page2, page3]
    return pages, "\n\n".join(pages)


def _split_pages(text: str) -> list[str]:
    chunks = [c.strip() for c in text.split("\f") if c.strip()]
    if len(chunks) > 1:
        return chunks
    parts = [p.strip() for p in text.split("\n\n\n") if p.strip()]
    if len(parts) > 1:
        return parts
    return [text.strip()] if text.strip() else [""]


async def chat_completion(system: str, user: str) -> str:
    if settings.use_mock:
        return _mock_chat(system, user)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            settings.upstage_chat_url,
            headers={
                "Authorization": f"Bearer {settings.upstage_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.solar_model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0.2,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


def _mock_summarize_from_text(text: str) -> str:
    import re

    order = ""
    m = re.search(r"주\s*문([\s\S]{0,2000})", text)
    if m:
        order = re.sub(r"\s+", " ", m.group(1)).strip()[:800]

    heading = "<이 판결의 결론>"
    if "행정법원" in text or "구합" in text or "처분" in text:
        heading = "<이 판결의 결론>"
        intro = "아래는 업로드한 행정판결 원문에서 추출한 내용입니다. (Solar API 키 설정 시 AI 요약)"
    elif "원고" in text or "피고" in text:
        intro = "아래는 업로드한 판결 원문에서 추출한 내용입니다. (Solar API 키 설정 시 AI 요약)"
    else:
        intro = "아래는 업로드한 판결 원문에서 추출한 내용입니다. (Solar API 키 설정 시 AI 요약)"

    body = order or text[:1200].strip()
    return f"{heading}\n{intro}\n\n{body}"


def _mock_chat(system: str, user: str) -> str:
    if "체크리스트" in user and "현재 번역본" in user:
        body = user.split("## 현재 번역본")[-1].strip()
        return body.split("\n\n(모의")[0].strip()

    if "수정" in user or "다음 지시" in user or "refine" in system.lower():
        if "현재 요약" in user:
            start = user.find("현재 요약:")
            snippet = user[start : start + 200] if start >= 0 else user[:200]
            return f"{snippet.replace('현재 요약:', '').strip()}\n\n(모의 AI 수정 반영)"
        if "현재 번역" in user:
            return user.split("현재 번역:")[-1].strip() + "\n\n(모의 AI 수정 반영)"

    if "요약" in system or ("요약" in user and "번역" not in user[:80]):
        body = user
        for marker in ("다음 판결문을 요약", "다음 판결문", "요약하세요"):
            if marker in user:
                body = user.split(marker, 1)[-1].strip()
                break
        if len(body) > 150 and ("주문" in body or "행정법원" in body or "원고" in body):
            return _mock_summarize_from_text(body)
        return (
            "<이 판결의 결론>\n"
            "갑은 감옥에 3년 동안 있어야 합니다.\n\n"
            "<이런 결론을 내린 이유>\n"
            "1. 갑이 저지른 범죄는 이렇습니다.\n"
            "· 날짜·시간: 2024년 5월 1일\n"
            "· 장소: 서울 중구\n"
            "· 갑은 을의 재물을 훔쳤습니다.\n\n"
            "2. 갑은 잘못을 반성하고 있습니다."
        )

    if "이지리드" in system or "번역" in system or "번역" in user:
        if "원문:" in user and len(user) < 300:
            orig = user.split("원문:")[-1].strip()
            if "3년" in orig:
                return "갑은 감옥에 3년 동안 있어야 합니다."
            if "훔" in orig:
                return "갑은 2024년 5월 1일 서울 중구에서 을의 재물을 훔쳤습니다."
            if "반성" in orig:
                return "갑은 잘못을 반성하고 있습니다."
            return f"{orig} (쉬운 말로 바꿈)"
        return (
            "<이 판결의 결론>\n"
            "갑은 감옥에 3년 동안 있어야 합니다.\n\n"
            "<이런 결론을 내린 이유>\n"
            "1. 갑이 저지른 범죄는 이렇습니다.\n"
            "· 날짜·시간: 2024년 5월 1일\n"
            "· 장소: 서울 중구\n"
            "· 갑은 을의 재물을 훔쳤습니다.\n\n"
            "2. 갑은 잘못을 반성하고 있습니다."
        )
    return "처리 완료 (mock mode)"


def encode_file_base64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")
