from pathlib import Path
import os

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
IS_VERCEL = os.getenv("VERCEL") == "1"

if IS_VERCEL:
    DATA_DIR = Path("/tmp/easyread")
else:
    DATA_DIR = ROOT_DIR / "data"

UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "app.db"
IMAGES_DIR = ROOT_DIR / "images"
PROMPTS_DIR = BACKEND_DIR / "prompts"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    upstage_api_key: str = ""
    mock_upstage: bool = True
    backend_host: str = "0.0.0.0"
    backend_port: int = 8001

    upstage_ocr_url: str = "https://api.upstage.ai/v1/document-digitization"
    upstage_chat_url: str = "https://api.upstage.ai/v1/solar/chat/completions"
    solar_model: str = "solar-pro"

    @property
    def use_mock(self) -> bool:
        return self.mock_upstage or not self.upstage_api_key.strip()


settings = Settings()

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
