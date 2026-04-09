"""
미리보기 — 확정된 키워드/RSS로 샘플 뉴스를 실제로 수집·요약.

위저드 Step 4에서 호출됨. 실제 파이프라인(`collectors.*` + `processor.claude`)을
그대로 재사용하되, 가상 section_config를 메모리에서 만들어 DB에 저장하지 않음.
"""
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import yaml

from collectors import rss as rss_collector
from collectors import keyword as kw_collector
from processor.claude import _get_client, filter_section, summarize_article
from backend.ai.rss_recommender import _load_whitelist

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SETTINGS_PATH = REPO_ROOT / "config" / "settings.yaml"

# 미리보기 전용 상수
PREVIEW_MAX_AGE_HOURS = 72       # 파이프라인(24h)보다 넓게
PREVIEW_CANDIDATE_LIMIT = 15     # LLM에 넘기는 후보 상한
PREVIEW_MIN_SCORE = 0.5          # 필터링 기준 완화
PREVIEW_TIMEOUT_SEC = 90         # 전체 상한 (초과 시 partial)


def _load_settings() -> dict:
    try:
        with open(SETTINGS_PATH) as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _name_from_url(url: str, whitelist_map: dict) -> str:
    if url in whitelist_map:
        return whitelist_map[url]
    try:
        return urlparse(url).netloc or url[:40]
    except Exception:
        return url[:40]


def run_preview(
    keyword_set: dict,
    rss_urls: list[str],
    topic: str,
    max_articles: int = 5,
) -> dict[str, Any]:
    """미리보기 본체. run_in_threadpool 안에서 호출되므로 동기 OK."""
    t0 = time.time()

    # ---- 1. 가상 section_config 생성 ----
    whitelist_map = {f["url"]: f["name"] for f in _load_whitelist()}
    rss_sources = [
        {"name": _name_from_url(u, whitelist_map), "url": u}
        for u in (rss_urls or []) if u
    ]

    recommended_query = (keyword_set or {}).get("recommended_query", "").strip()
    queries = [recommended_query] if recommended_query else []

    section_name = (topic or recommended_query or "미리보기")[:60]
    description = "\n".join([
        f"주제: {topic}" if topic else "",
        f"핵심 키워드: {', '.join((keyword_set or {}).get('core_keywords', []))}",
        f"제외: {', '.join((keyword_set or {}).get('exclude_keywords', []))}",
    ]).strip()

    section_cfg = {
        "id": "preview",
        "name": section_name,
        "description": description,
        "channel2_rss": {"sources": rss_sources},
        "channel3_keywords": {
            "queries": queries,
            "max_age_hours": PREVIEW_MAX_AGE_HOURS,
        },
    }

    # ---- 2. settings (max_age 오버라이드) ----
    settings = _load_settings()
    settings.setdefault("pipeline", {})["max_age_hours"] = PREVIEW_MAX_AGE_HOURS

    # ---- 3. 수집 ----
    collected: list = []
    try:
        if rss_sources:
            collected.extend(rss_collector.collect(section_cfg, settings))
    except Exception as e:
        print(f"  [preview] RSS 수집 실패: {e}")

    if time.time() - t0 > PREVIEW_TIMEOUT_SEC:
        return _partial_response(collected, [], t0, reason="rss_timeout")

    try:
        if queries:
            collected.extend(kw_collector.collect(section_cfg, settings))
    except Exception as e:
        print(f"  [preview] 키워드 수집 실패: {e}")

    if not collected:
        return {
            "status": "empty",
            "articles": [],
            "stats": {"collected": 0, "filtered": 0, "summarized": 0},
            "elapsed_sec": round(time.time() - t0, 2),
            "hint": "해당 기간 내 기사를 찾지 못했어요. 키워드를 넓히거나 RSS를 추가해보세요.",
        }

    # ---- 4. 정렬·컷 ----
    collected.sort(key=lambda a: a.get("published_at") or "", reverse=True)
    candidates = collected[:PREVIEW_CANDIDATE_LIMIT]

    if time.time() - t0 > PREVIEW_TIMEOUT_SEC:
        return _partial_response(collected, candidates, t0, reason="pre_llm_timeout")

    # ---- 5. LLM 필터링 ----
    try:
        client, model = _get_client(settings)
    except Exception as e:
        return {
            "status": "no_llm",
            "articles": [_serialize(a) for a in candidates[:max_articles]],
            "stats": {"collected": len(collected), "filtered": 0, "summarized": 0},
            "elapsed_sec": round(time.time() - t0, 2),
            "hint": f"LLM 연결 실패: {e}",
        }

    try:
        filtered = filter_section(candidates, section_cfg, client, model, min_score=PREVIEW_MIN_SCORE)
    except Exception as e:
        print(f"  [preview] 필터링 실패: {e}")
        filtered = candidates

    if not filtered:
        filtered = candidates[:max_articles]  # 폴백

    filtered = filtered[:max_articles]

    # ---- 6. 요약 ----
    summarized = []
    for a in filtered:
        if time.time() - t0 > PREVIEW_TIMEOUT_SEC:
            break
        try:
            summary = summarize_article(a, client, model, max_chars=1000)
        except Exception as e:
            print(f"  [preview] 요약 실패: {e}")
            summary = ""
        a["summary_ko"] = summary
        summarized.append(a)

    elapsed = round(time.time() - t0, 2)
    status = "ok" if len(summarized) == len(filtered) else "partial"
    if not any(a.get("summary_ko") for a in summarized):
        status = "no_summary"

    return {
        "status": status,
        "articles": [_serialize(a) for a in summarized],
        "stats": {
            "collected": len(collected),
            "filtered": len(filtered),
            "summarized": sum(1 for a in summarized if a.get("summary_ko")),
        },
        "elapsed_sec": elapsed,
    }


def _serialize(a: dict) -> dict:
    return {
        "title": a.get("title", ""),
        "url": a.get("url", ""),
        "source_name": a.get("source_name", ""),
        "published_at": a.get("published_at", ""),
        "summary_ko": a.get("summary_ko", ""),
    }


def _partial_response(collected: list, candidates: list, t0: float, reason: str) -> dict:
    return {
        "status": "partial",
        "articles": [_serialize(a) for a in candidates[:5]],
        "stats": {"collected": len(collected), "filtered": len(candidates), "summarized": 0},
        "elapsed_sec": round(time.time() - t0, 2),
        "hint": f"시간 초과({reason})로 일부만 반환했어요.",
    }
