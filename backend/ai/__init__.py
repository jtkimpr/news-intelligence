"""
AI 키워드 제안 모듈.

- prompts.py        : v2 프롬프트 3종 (Phase 0 검증 완료)
- llm_client.py     : Ollama 호출 + 재시도 + 캐싱 통합
- cache.py          : ai_cache 테이블 기반 24시간 TTL 캐시
- rss_recommender.py: 화이트리스트 기반 RSS 추천
"""
