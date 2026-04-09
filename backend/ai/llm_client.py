"""
Ollama LLM 호출 통합 인터페이스.

- v2 프롬프트 3종 호출 함수 (interpret / suggest_keywords / edit_keywords)
- 24시간 SQLite 캐시
- JSON 파싱 실패 시 1회 재시도
"""
import json
import os
import re
import time
from typing import Any

from openai import OpenAI

from backend.ai import cache
from backend.ai.prompts import (
    PROMPT_A_SYSTEM,
    PROMPT_B_SYSTEM,
    PROMPT_C_SYSTEM,
    PROMPT_VERSION,
)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:14b")
TEMPERATURE = 0.3
MAX_RETRY = 1


def _client() -> OpenAI:
    return OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")


def _safe_parse_json(text: str) -> dict | None:
    text = re.sub(r"```(?:json)?\s*", "", text).strip("` \n")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                return None
        return None


def _call_once(system: str, user: str) -> tuple[dict | None, str, float]:
    client = _client()
    start = time.time()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={"type": "json_object"},
        temperature=TEMPERATURE,
    )
    elapsed = time.time() - start
    raw = response.choices[0].message.content or ""
    return _safe_parse_json(raw), raw, elapsed


def _call_with_retry_and_cache(
    prompt_name: str, system: str, user_input: str, use_cache: bool = True
) -> dict:
    """캐시 조회 → 실패 시 LLM 호출(재시도 1회) → 캐시 저장."""
    cache_key = cache.make_key(PROMPT_VERSION, prompt_name, user_input)

    if use_cache:
        cached = cache.get(cache_key)
        if cached is not None:
            return {"data": cached, "cached": True, "elapsed_sec": 0.0}

    parsed, raw, elapsed = _call_once(system, user_input)
    if parsed is None:
        # 1회 재시도
        parsed, raw, elapsed2 = _call_once(system, user_input)
        elapsed += elapsed2
        if parsed is None:
            raise ValueError(f"LLM JSON 파싱 실패 (재시도 후): {raw[:300]}")

    if use_cache:
        cache.set(cache_key, parsed)

    return {"data": parsed, "cached": False, "elapsed_sec": round(elapsed, 2)}


# ----------------------------------------------------------------------------
# 공개 API
# ----------------------------------------------------------------------------

def interpret(topic: str, use_cache: bool = True) -> dict:
    """프롬프트 A — 주제 해석 + 되묻기."""
    return _call_with_retry_and_cache("interpret", PROMPT_A_SYSTEM, topic, use_cache)


def suggest_keywords(topic: str, use_cache: bool = True) -> dict:
    """프롬프트 B — 키워드 추천. 입력은 원 주제 또는 (주제 + 해석된 의도)."""
    return _call_with_retry_and_cache("suggest_keywords", PROMPT_B_SYSTEM, topic, use_cache)


def edit_keywords(current_state: dict, instruction: str, use_cache: bool = True) -> dict:
    """프롬프트 C — 자연어 수정 요청 처리."""
    user_payload = json.dumps(
        {"current": current_state, "instruction": instruction},
        ensure_ascii=False,
    )
    return _call_with_retry_and_cache("edit_keywords", PROMPT_C_SYSTEM, user_payload, use_cache)
