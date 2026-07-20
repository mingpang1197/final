from __future__ import annotations

"""일러스트 파일 경로 해석.

역할: 로컬 images/ 또는 Vercel CDN·캐시에서 PNG 파일 경로를 반환한다.
주요 기능: resolve_image_path (로컬 우선, Vercel 시 CDN 다운로드 캐시).
관계: config(IMAGES_DIR, IS_VERCEL), word_export(Word 삽입 시 사용).
"""

import os
from functools import lru_cache
from pathlib import Path

import httpx

from backend.config import DATA_DIR, IMAGES_DIR, IS_VERCEL

_CACHE_DIR = DATA_DIR / "image-cache"


@lru_cache(maxsize=256)
def resolve_image_path(image_file: str) -> Path | None:
    local = IMAGES_DIR / image_file
    if local.is_file():
        return local

    if not IS_VERCEL:
        return None

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = _CACHE_DIR / image_file
    if cached.is_file():
        return cached

    host = os.getenv("VERCEL_URL", "").strip()
    if not host:
        return None

    url = f"https://{host}/images/{image_file}"
    try:
        response = httpx.get(url, timeout=15.0, follow_redirects=True)
        if response.status_code == 200 and response.content:
            cached.write_bytes(response.content)
            return cached
    except httpx.HTTPError:
        return None
    return None
