"""
LLM 응답 24시간 TTL 캐시 (SQLite 기반).

키 구성: sha256(prompt_version + prompt_name + user_input)
저장 위치: ai_cache 테이블 (database.py에서 init_db 시 생성)
"""
import hashlib
import json
import time
from typing import Any

from backend.database import get_conn

CACHE_TTL_SECONDS = 24 * 60 * 60  # 24시간


def make_key(prompt_version: str, prompt_name: str, user_input: str) -> str:
    raw = f"{prompt_version}::{prompt_name}::{user_input}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get(key: str) -> Any | None:
    """캐시 조회. 만료된 항목은 None 반환."""
    now = int(time.time())
    with get_conn() as conn:
        row = conn.execute(
            "SELECT response, created_at FROM ai_cache WHERE cache_key = ?",
            (key,),
        ).fetchone()
        if not row:
            return None
        if now - row["created_at"] > CACHE_TTL_SECONDS:
            return None
        try:
            return json.loads(row["response"])
        except json.JSONDecodeError:
            return None


def set(key: str, value: Any) -> None:
    """캐시 저장 (UPSERT)."""
    now = int(time.time())
    payload = json.dumps(value, ensure_ascii=False)
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO ai_cache (cache_key, response, created_at) VALUES (?, ?, ?)",
            (key, payload, now),
        )
        conn.commit()


def purge_expired() -> int:
    """만료된 캐시 항목 삭제. 삭제된 행 수 반환."""
    cutoff = int(time.time()) - CACHE_TTL_SECONDS
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM ai_cache WHERE created_at < ?", (cutoff,))
        conn.commit()
        return cur.rowcount
