"""
PigeonBrief FastAPI 백엔드
실행: .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db
from backend.routers import settings, articles

# .env 로드
if os.path.exists('.env'):
    with open('.env') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"\''))

app = FastAPI(title="PigeonBrief API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pigeonbrief.com",
        "https://www.pigeonbrief.com",
        "https://pigeonbrief.vercel.app",
        "http://localhost:3000",  # 로컬 테스트용
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(articles.router, prefix="/api/articles", tags=["articles"])
