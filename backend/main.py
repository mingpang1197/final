from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from backend.config import BACKEND_DIR, IMAGES_DIR, IS_VERCEL, settings
from backend.database import init_db
from backend.routers import documents

STATIC_DIR = BACKEND_DIR / "static"


class VercelPathMiddleware(BaseHTTPMiddleware):
    """Restore the browser URL path when Vercel rewrites to /api/index.py."""

    async def dispatch(self, request: Request, call_next):
        original = (
            request.headers.get("x-vercel-original-url")
            or request.headers.get("x-forwarded-uri")
            or request.headers.get("x-invoke-path")
        )
        if original:
            value = original if original.startswith("/") else urlparse(original).path
            parsed = urlparse(value)
            if parsed.path:
                request.scope["path"] = parsed.path
                request.scope["raw_path"] = parsed.path.encode()
                if parsed.query:
                    request.scope["query_string"] = parsed.query.encode()
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Easy-Read 판결문 작성 보조 API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(VercelPathMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if IMAGES_DIR.exists():
    app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

app.include_router(documents.router, prefix="/api")


@app.get("/health")
@app.get("/api/health")
async def health():
    return {"status": "ok", "mock_mode": settings.use_mock}


def _static_file(relative: str) -> Path | None:
    candidate = (STATIC_DIR / relative).resolve()
    static_root = STATIC_DIR.resolve()
    if not str(candidate).startswith(str(static_root)):
        return None
    return candidate if candidate.is_file() else None


@app.get("/")
async def serve_root():
    index = _static_file("index.html")
    if index:
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="SPA build not found")


@app.get("/assets/{asset_path:path}")
async def serve_assets(asset_path: str):
    asset = _static_file(f"assets/{asset_path}")
    if asset:
        return FileResponse(asset)
    raise HTTPException(status_code=404, detail="Asset not found")


@app.get("/favicon.svg")
async def serve_favicon():
    icon = _static_file("favicon.svg")
    if icon:
        return FileResponse(icon)
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/documents/{rest:path}")
async def serve_spa_routes(rest: str):
    index = _static_file("index.html")
    if index:
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="SPA build not found")
