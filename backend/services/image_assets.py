"""Resolve illustration files locally or from Vercel static CDN."""

from __future__ import annotations

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
