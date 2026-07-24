from __future__ import annotations

"""생성형 시각자료 — OpenAI DALL·E (키 없으면 stub)."""

import logging
from dataclasses import dataclass

import httpx

from backend.config import settings
from backend.services.openai_settings import get_openai_api_key

logger = logging.getLogger(__name__)

OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"


@dataclass(frozen=True)
class GeneratedImage:
    url: str
    revised_prompt: str | None = None


def image_generation_available() -> bool:
    return settings.image_gen_enabled and bool(get_openai_api_key())


def _build_prompt(phrase: str, context: str = "") -> str:
    base = (
        "Simple flat illustration for Easy-Read legal document for people with "
        "developmental disabilities. Friendly, clear, no text in image, no violence "
        "or scary imagery. Korean legal concept: "
    )
    detail = phrase.strip()
    if context.strip():
        detail = f"{detail}. Context: {context.strip()[:400]}"
    return base + detail


async def generate_visual_aid(
    phrase: str,
    *,
    context: str = "",
) -> GeneratedImage | None:
    """OpenAI DALL·E 3 — 키·IMAGE_GEN_ENABLED 없으면 None (stub)."""
    if not image_generation_available():
        return None

    api_key = get_openai_api_key()
    prompt = _build_prompt(phrase, context)

    payload = {
        "model": settings.openai_image_model,
        "prompt": prompt[:4000],
        "n": 1,
        "size": settings.openai_image_size,
        "quality": "standard",
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                OPENAI_IMAGES_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.warning("OpenAI image generation failed: %s", exc)
        return None

    items = data.get("data") or []
    if not items:
        return None
    item = items[0]
    url = item.get("url") or ""
    if not url:
        return None
    return GeneratedImage(url=url, revised_prompt=item.get("revised_prompt"))


async def generate_visual_aid_mock(phrase: str) -> GeneratedImage | None:
    """테스트용 — 실제 API 호출 없음."""
    if not phrase.strip():
        return None
    return None
