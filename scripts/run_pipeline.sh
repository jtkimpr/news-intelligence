#!/bin/bash
# 뉴스 인텔리전스 파이프라인 실행 스크립트
# launchd에서 이 파일을 직접 호출
# 사용법: bash ~/news-intelligence/scripts/run_pipeline.sh

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$PROJECT_DIR/.venv/bin/python"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/$(date +%Y%m%d).log"

mkdir -p "$LOG_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 파이프라인 시작" | tee -a "$LOG_FILE"

cd "$PROJECT_DIR"
"$PYTHON" pipeline.py 2>&1 | tee -a "$LOG_FILE"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 파이프라인 종료" | tee -a "$LOG_FILE"
