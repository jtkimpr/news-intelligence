"""
RSS 화이트리스트 기반 추천.

`data/rss_whitelist.json`(51개)에서 키워드 세트와 매칭되는 RSS 피드를 점수화해서 상위 N개 반환.

알고리즘 (v1, 단순):
1. 사용자 키워드 세트에서 카테고리 추론 (키워드 → 카테고리 매핑 휴리스틱)
2. 화이트리스트의 각 피드 카테고리와 교집합 점수
3. 동률 시 entries 많은 매체 우선 (가중치는 하지 않음 — 정보 없음)

향후 개선: 임베딩 기반 유사도 (Phase 6에서 검토).
"""
import json
from collections import Counter
from pathlib import Path

WHITELIST_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "rss_whitelist.json"

# 키워드 → 카테고리 매핑 (소문자 부분문자열 매칭)
KEYWORD_TO_CATEGORY = {
    # tech / ai
    "ai": ["ai", "tech"],
    "artificial intelligence": ["ai", "tech"],
    "machine learning": ["ai", "tech"],
    "llm": ["ai", "tech"],
    "agent": ["ai", "tech"],
    "copilot": ["ai", "tech"],
    "openai": ["ai", "tech"],
    "anthropic": ["ai", "tech"],
    "chip": ["tech"],
    "semiconductor": ["tech", "geopolitics"],
    "반도체": ["tech", "geopolitics"],
    "quantum": ["tech", "science"],
    "tech": ["tech"],
    "software": ["tech"],
    "cloud": ["tech"],
    # business / finance
    "stock": ["finance", "business"],
    "주식": ["finance", "business"],
    "etf": ["finance"],
    "bond": ["finance"],
    "채권": ["finance"],
    "kospi": ["finance"],
    "nasdaq": ["finance"],
    "fed": ["finance"],
    "federal reserve": ["finance"],
    "interest rate": ["finance"],
    "금리": ["finance"],
    "earnings": ["business", "finance"],
    "ipo": ["finance", "startup"],
    "venture": ["vc", "startup"],
    "vc": ["vc", "startup"],
    "startup": ["startup", "vc"],
    "스타트업": ["startup", "vc"],
    # healthcare / bio
    "healthcare": ["healthcare"],
    "의료": ["healthcare"],
    "emr": ["healthcare", "tech"],
    "ehr": ["healthcare", "tech"],
    "epic systems": ["healthcare"],
    "epic": ["healthcare"],
    "hospital": ["healthcare"],
    "physician": ["healthcare"],
    "biotech": ["bio", "healthcare"],
    "바이오": ["bio", "healthcare"],
    "fda": ["bio", "healthcare", "pharma"],
    "drug": ["bio", "pharma"],
    "신약": ["bio", "pharma"],
    "clinical": ["bio", "healthcare"],
    "pharma": ["pharma", "bio"],
    "제약": ["pharma", "bio"],
    # geopolitics / policy
    "geopolitics": ["geopolitics"],
    "지정학": ["geopolitics"],
    "trade war": ["geopolitics"],
    "export control": ["geopolitics", "policy"],
    "sanction": ["geopolitics"],
    "china": ["geopolitics"],
    "us-china": ["geopolitics"],
    "policy": ["policy"],
    "regulation": ["policy"],
    "정책": ["policy"],
    "regulatory": ["policy"],
    # science
    "science": ["science"],
    "research": ["science"],
    "physics": ["science"],
    "biology": ["science"],
    # legal
    "legal": ["business", "policy"],
    "law firm": ["business", "policy"],
    "litigation": ["business", "policy"],
    # space
    "space": ["science", "tech"],
    "rocket": ["science", "tech"],
    "우주": ["science", "tech"],
    # general/macro
    "real estate": ["finance", "business"],
    "부동산": ["finance", "business"],
    "inflation": ["finance"],
    "recession": ["finance"],
}


_whitelist_cache: list[dict] | None = None


def _load_whitelist() -> list[dict]:
    global _whitelist_cache
    if _whitelist_cache is None:
        data = json.loads(WHITELIST_PATH.read_text())
        _whitelist_cache = data.get("feeds", [])
    return _whitelist_cache


def infer_categories(keyword_set: dict) -> Counter:
    """키워드 세트에서 카테고리 점수 추론."""
    scores: Counter = Counter()
    fields = (
        keyword_set.get("core_keywords", []) or []
    ) + (
        keyword_set.get("related_entities", []) or []
    ) + (
        keyword_set.get("related_concepts", []) or []
    )
    for kw in fields:
        kw_lower = str(kw).lower()
        for trigger, cats in KEYWORD_TO_CATEGORY.items():
            if trigger in kw_lower:
                for c in cats:
                    scores[c] += 1
    return scores


def recommend(keyword_set: dict, top_n: int = 5) -> list[dict]:
    """화이트리스트에서 키워드 세트와 가장 관련성 높은 RSS 상위 N개 반환."""
    feeds = _load_whitelist()
    cat_scores = infer_categories(keyword_set)

    if not cat_scores:
        # 카테고리 추론 실패 → 일반 카테고리 폴백
        cat_scores = Counter({"general": 1, "tech": 1, "business": 1})

    scored = []
    for feed in feeds:
        score = sum(cat_scores.get(c, 0) for c in feed.get("categories", []))
        if score > 0:
            scored.append((score, feed))

    scored.sort(key=lambda x: -x[0])
    top = [
        {
            "name": f["name"],
            "url": f["url"],
            "language": f.get("language", "en"),
            "country": f.get("country", ""),
            "categories": f.get("categories", []),
            "score": s,
        }
        for s, f in scored[:top_n]
    ]
    return top
