#!/bin/bash
# PigeonBrief FastAPI 백엔드 실행 스크립트

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$PROJECT_DIR/.venv/bin/python"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"
exec "$PROJECT_DIR/.venv/bin/uvicorn" backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info \
    >> "$LOG_DIR/backend.log" 2>&1
