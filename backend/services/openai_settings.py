from __future__ import annotations

"""OpenAI API 키 저장 — UI에서 설정, 향후 DALL·E 등 이미지 생성에 사용."""

import yaml

from backend.config import DATA_DIR, settings

OPENAI_SETTINGS_PATH = DATA_DIR / "openai_settings.yaml"


def _load_file_key() -> str:
    if not OPENAI_SETTINGS_PATH.is_file():
        return ""
    try:
        data = yaml.safe_load(OPENAI_SETTINGS_PATH.read_text(encoding="utf-8")) or {}
        return str(data.get("api_key") or "").strip()
    except (OSError, yaml.YAMLError):
        return ""


def get_openai_api_key() -> str:
    """환경 변수 우선, 없으면 data/openai_settings.yaml."""
    env_key = settings.openai_api_key.strip()
    if env_key:
        return env_key
    return _load_file_key()


def mask_api_key(key: str) -> str:
    key = key.strip()
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return f"{key[:3]}••••{key[-4:]}"


def is_openai_configured() -> bool:
    return bool(get_openai_api_key())


def save_openai_api_key(api_key: str) -> None:
    OPENAI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    cleaned = api_key.strip()
    payload = {"api_key": cleaned} if cleaned else {}
    with OPENAI_SETTINGS_PATH.open("w", encoding="utf-8") as f:
        yaml.safe_dump(payload, f, allow_unicode=True, sort_keys=False)


def openai_settings_status() -> dict[str, str | bool]:
    key = get_openai_api_key()
    if settings.openai_api_key.strip():
        source = "env"
    elif key:
        source = "file"
    else:
        source = "none"
    return {
        "configured": bool(key),
        "api_key_masked": mask_api_key(key),
        "source": source,
        "image_gen_enabled": settings.image_gen_enabled,
    }
