from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from backend.config import IMAGES_DIR, settings
from backend.database import init_db
from backend.routers import documents


class VercelPathMiddleware(BaseHTTPMiddleware):
    """Restore original URL path when Vercel rewrites to /api/index.py."""

    async def dispatch(self, request: Request, call_next):
        original = request.headers.get("x-vercel-original-url") or request.headers.get(
            "x-forwarded-uri"
        )
        path = request.url.path
        if original and path in {"/api", "/api/index", "/api/index.py"}:
            parsed = urlparse(original)
            if parsed.path and parsed.path != path:
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
