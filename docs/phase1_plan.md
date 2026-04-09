# Phase 1 구현 계획 — AI 키워드 제안 대화형 UX

> Phase 0에서 검증한 v2 프롬프트(평균 4.00/5)를 실제 사용자 대화형 UX로 구현한다.
> 본 문서는 Phase 1 작업의 청사진. 새로운 세션에서도 이 문서만 보면 작업을 이어갈 수 있어야 한다.

## 1. 목표

- 사용자가 자연어로 관심 주제를 설명 → AI가 키워드/RSS 제안 → 사용자 확정 → 미리보기 → 저장
- 4단계 위저드 UX
- 화이트리스트 기반 RSS 추천 (Phase 0에서 환각 문제 확인)

## 2. 범위

**In scope**
- 백엔드 API 4종: `/api/ai/interpret`, `/api/ai/suggest-keywords`, `/api/ai/edit-keywords`, `/api/ai/preview`
- LLM 응답 24시간 캐싱 (SQLite)
- JSON 파싱 실패 1회 재시도
- RSS 화이트리스트 기반 추천 (`data/rss_whitelist.json`, 51개)
- 프론트엔드 온보딩 위저드 4단계 확장
- 기존 섹션 "AI와 다시 대화해서 수정" 진입점

**Out of scope (Phase 2 이후)**
- Today / Read Later 탭
- 카드뉴스 "왜 중요한가" 포맷
- Naver API 통합
- 결제/유료 티어

## 3. Phase 0 산출물 (참고 자료)

- `docs/ai_keyword_design.md` — 프롬프트 v2 + 사용자 여정 + UI 와이어프레임 + 리스크
- `data/rss_whitelist.json` — 검증된 RSS 51개 (51/69 통과)
- `data/test_results/2026-04-09-1320-v2/` — v2 프롬프트 11개 주제 결과 (평균 4.00/5)
- `data/test_results/2026-04-09-1344-short-inputs/` — 짧은 입력 되묻기 100% 검증
- `scripts/test_ai_keyword.py` — v2 프롬프트 + 자동 평가
- `scripts/test_short_inputs.py` — 짧은 입력 되묻기 검증
- `scripts/build_rss_whitelist.py` — 화이트리스트 빌더

## 4. 단계별 구현 순서

### Step 1 — RSS 화이트리스트 구축 ✅ 완료
- `data/rss_whitelist.json` 생성, 51개 검증 통과
- 카테고리 분포: tech 14, business 12, finance 11, science 8, healthcare 5, bio 5, geopolitics 5, ai 5, vc 4, policy 4, general 4, startup 3, pharma 2, security 1

### Step 2 — 백엔드 AI 모듈 신설 (다음 단계)
- `backend/ai/__init__.py`
- `backend/ai/prompts.py` — v2 프롬프트 3종 상수 (PROMPT_A, PROMPT_B, PROMPT_C)
- `backend/ai/llm_client.py` — Ollama 호출 (재시도 + 캐싱 통합 인터페이스)
- `backend/ai/cache.py` — `ai_cache` 테이블 기반 24시간 TTL 캐시
- `backend/ai/rss_recommender.py` — 화이트리스트 로드 + 키워드 매칭 (단순 카테고리 매칭부터)

### Step 3 — 백엔드 API 라우터 신설
- `backend/routers/ai.py` — Clerk 인증 적용, 4종 엔드포인트
- `backend/main.py`에 라우터 등록 (`/api/ai`)
- 각 엔드포인트 입출력 스펙은 `docs/ai_keyword_design.md` 6절 참조

### Step 4 — DB 스키마 추가
- `ai_cache` 테이블: `cache_key TEXT PRIMARY KEY, response TEXT, created_at INTEGER`
- 기존 `sections` 테이블에 `created_via TEXT DEFAULT 'manual'` 컬럼 추가
- `database.py:init_db()` 안전 마이그레이션

### Step 5 — 프론트엔드 위저드 확장
- 기존 `website/assets/app.js` 온보딩 위저드 3단계 → 4단계 확장
- 단계: 주제 입력 / AI 키워드 제안 / 소스 선택 / 미리보기
- 단계마다 백엔드 API 호출 + 로딩 UI
- "AI에게 자연어로 요청" 입력란 (프롬프트 C)
- 미리보기 결과 카드 5건

### Step 6 — 기존 섹션 재편집 진입점
- `settings.html` 각 섹션에 "AI로 수정" 버튼
- 클릭 시 위저드 Step 2부터 시작 (현재 키워드를 초기값)

### Step 7 — 짧은 입력 되묻기 검증 ✅ Phase 0에서 완료
- `scripts/test_short_inputs.py` 실행 → 되묻기 100% (10/10) 확인 완료

### Step 8 — 통합 테스트 (대표 1인 베타)
- 대표가 직접 위저드로 11개 주제 등록
- 피드백 수집 → 프롬프트/UI 미세조정
- 만족 시 지인 5~10명 베타 확장

## 5. 주요 설계 결정

| 결정 | 이유 |
|------|------|
| RSS 화이트리스트 우선 | Phase 0에서 AI 직접 추천 환각률 60% 확인 |
| LLM 캐시는 SQLite | 기존 인프라 재사용, PoC 규모 충분 |
| 미리보기 5건 | 응답 속도와 정보량 균형 |
| 재시도 1회만 | 응답 시간 상한 유지 |
| 위저드는 기존 app.js 확장 | 학습 비용 최소 |
| `created_via` 컬럼 | AI 위저드 사용률·품질 분석용 |

## 6. 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| 화이트리스트가 사용자 주제 커버 못함 | 사용자 직접 RSS 추가 + 키워드 검색(Google News) 보완 |
| Qwen 응답 30~40초로 답답함 | 단계별 명확한 로딩 UI |
| 미리보기 가장 느림 | 백엔드 병렬 수집, "최대 60초" 안내 |
| 캐시 무효화 | 입력 해시 + 24시간 TTL + "다시 생성" 버튼 |

## 7. 완료 기준

- 대표가 직접 위저드로 11개 주제 모두 5분 이내 등록 가능
- 미리보기에서 의도와 일치하는 뉴스 3건 이상
- 백엔드 API 4종 정상 응답 + 캐시 작동
- 기존 섹션 재편집 진입점 동작
- 기존 launchd 파이프라인 회귀 없음

## 8. 변경 이력

- 2026-04-09: Phase 1 계획 확정, Step 1 (화이트리스트 51개) 완료
