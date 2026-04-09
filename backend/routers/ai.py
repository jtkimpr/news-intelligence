"""
AI 키워드 제안 대화형 UX API.

엔드포인트:
- POST /api/ai/interpret         — 주제 해석 + 되묻기 (프롬프트 A)
- POST /api/ai/suggest-keywords  — 키워드 추천 + RSS 추천 (프롬프트 B + 화이트리스트)
- POST /api/ai/edit-keywords     — 자연어 수정 요청 (프롬프트 C)
- POST /api/ai/preview           — 미리보기 (샘플 5건 수집·요약)

모두 Clerk 인증 필요.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth import verify_token, get_user_id
from backend.ai import llm_client, rss_recommender, preview as ai_preview

router = APIRouter()


# ----------------------------------------------------------------------------
# 요청/응답 모델
# ----------------------------------------------------------------------------

class InterpretRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=2000)


class SuggestKeywordsRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=2000)
    clarification_answer: str = Field(default="", max_length=2000)


class KeywordSet(BaseModel):
    core_keywords: list[str] = []
    related_entities: list[str] = []
    related_concepts: list[str] = []
    exclude_keywords: list[str] = []
    recommended_query: str = ""


class EditKeywordsRequest(BaseModel):
    current: KeywordSet
    instruction: str = Field(..., min_length=1, max_length=1000)


class PreviewRequest(BaseModel):
    keywords: KeywordSet
    rss_urls: list[str] = []
    max_articles: int = Field(default=3, ge=1, le=10)


# ----------------------------------------------------------------------------
# 엔드포인트
# ----------------------------------------------------------------------------

@router.post("/interpret")
def interpret(req: InterpretRequest, payload: dict = Depends(verify_token)) -> dict[str, Any]:
    """프롬프트 A — 주제 해석 + 되묻기 판단."""
    _ = get_user_id(payload)
    try:
        result = llm_client.interpret(req.topic.strip())
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"LLM 응답 파싱 실패: {e}")
    return result


@router.post("/suggest-keywords")
def suggest_keywords(
    req: SuggestKeywordsRequest, payload: dict = Depends(verify_token)
) -> dict[str, Any]:
    """프롬프트 B — 키워드 추천 + 화이트리스트 기반 RSS 추천."""
    _ = get_user_id(payload)

    topic = req.topic.strip()
    if req.clarification_answer.strip():
        topic = f"{topic}\n\n추가 답변: {req.clarification_answer.strip()}"

    try:
        llm_result = llm_client.suggest_keywords(topic)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"LLM 응답 파싱 실패: {e}")

    keyword_set = llm_result["data"]
    rss_suggestions = rss_recommender.recommend(keyword_set, top_n=5)

    return {
        "data": keyword_set,
        "rss_suggestions": rss_suggestions,
        "cached": llm_result.get("cached", False),
        "elapsed_sec": llm_result.get("elapsed_sec", 0.0),
    }


@router.post("/edit-keywords")
def edit_keywords(
    req: EditKeywordsRequest, payload: dict = Depends(verify_token)
) -> dict[str, Any]:
    """프롬프트 C — 자연어 수정 요청 처리."""
    _ = get_user_id(payload)
    try:
        llm_result = llm_client.edit_keywords(
            current_state=req.current.model_dump(),
            instruction=req.instruction.strip(),
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=f"LLM 응답 파싱 실패: {e}")

    keyword_set = llm_result["data"]
    rss_suggestions = rss_recommender.recommend(keyword_set, top_n=5)

    return {
        "data": keyword_set,
        "rss_suggestions": rss_suggestions,
        "cached": llm_result.get("cached", False),
        "elapsed_sec": llm_result.get("elapsed_sec", 0.0),
    }


@router.post("/preview")
def preview(req: PreviewRequest, payload: dict = Depends(verify_token)) -> dict[str, Any]:
    """미리보기 — 확정된 키워드/RSS로 샘플 뉴스 실시간 수집·요약."""
    _ = get_user_id(payload)
    try:
        return ai_preview.run_preview(
            keyword_set=req.keywords.model_dump(),
            rss_urls=req.rss_urls,
            topic=req.keywords.recommended_query or "",
            max_articles=req.max_articles,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"미리보기 실패: {e}")
