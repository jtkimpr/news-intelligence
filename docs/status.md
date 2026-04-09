# PigeonBrief 작업 현황

_최종 업데이트: 2026-04-09_

> CEO가 현재 상황을 한눈에 파악하기 위한 문서. Phase별 진행도와 **지금 당장 해야 할 일**을 분리.

---

## 🎯 지금 당장 해야 할 일 (CEO)

1. **pigeonbrief.com 접속 → 새 주제 만들기 위저드 직접 돌려보기**
   - 로그인 후, 기존 섹션이 이미 있으면 설정에서 전부 삭제하거나 새 계정으로 시도
   - Step 1~5를 끝까지 경험 (주제 입력 → 되묻기 → 키워드 편집 → 미리보기 → 저장)
   - 테스트 주제 예: "Ubcare처럼 EPIC을 지향하는 의료 SW 산업 동향"
2. **체감 품질 메모**
   - 되묻기 질문이 자연스러운가?
   - AI가 뽑은 키워드가 말이 되는가?
   - "AI로 수정" 버튼이 의도대로 동작하는가?
   - 미리보기(최대 90초)로 나오는 기사가 주제와 맞는가?
3. **이상 현상 발견 시** → Claude에게 증상·스크린샷·기대했던 결과를 공유
4. **문제 없으면** → 지인 5~10명에게 링크 공유해서 베타 피드백 수집 시작

---

## Phase 0 — 사전 설계 및 프롬프트 검증 ✅ 완료

**목적**: 본격 구현 전 LLM 품질이 실용 가능한지 확인

- [x] 사용자 여정 8단계 설계 (`docs/ai_keyword_design.md`)
- [x] 프롬프트 3종 작성 (A 해석, B 키워드, C 수정)
- [x] v1 프롬프트로 11개 주제 테스트 → 품질 이슈 발견
- [x] v2 프롬프트 튜닝 (Few-shot, 고유명사 규칙, 표면어 반복 금지)
- [x] 자동 평가기 작성 → **v2 평균 4.00/5, 8/11 주제 ≥4점**
- [x] 짧은 입력 되묻기율 테스트 → **10/10 (100%)**
- [x] RSS URL 직접 추천은 환각 심각 → 화이트리스트 방식으로 전환 결정

**완료 기준 충족**: 프롬프트 품질 80%+ 달성, 설계 문서 완성

---

## Phase 1 — AI 키워드 제안 대화형 UX 구현 🚧 90% (Step 8만 남음)

**목적**: Phase 0에서 검증한 프롬프트를 실제 서비스 기능으로 구현

### 완료 Step

- [x] **Step 1 — RSS 화이트리스트 구축**
  69개 후보 feedparser 검증 → 56개 통과 → `data/rss_whitelist.json`
- [x] **Step 2 — AI 모듈 5종 작성** (`backend/ai/`)
  `prompts.py` / `cache.py` (SQLite 24h) / `llm_client.py` (Ollama) / `rss_recommender.py` / `preview.py`
- [x] **Step 3 — API 라우터** (`backend/routers/ai.py`)
  `POST /api/ai/interpret` / `suggest-keywords` / `edit-keywords` / `preview` (Clerk 인증 필수)
- [x] **Step 4 — DB 스키마**
  `ai_cache` 테이블 + `sections.created_via` 컬럼 안전 마이그레이션
- [x] **Step 5 — 프론트엔드 위저드 전면 재작성**
  3단계 → 5단계 (주제 입력 / 되묻기 / 키워드 편집 / 미리보기 / 저장)
  키워드 칩 토글, RSS 체크박스, "AI로 수정" 인라인 박스 포함
- [x] **Step 6 — 미리보기 실제 구현**
  `collectors.rss/keyword` + `processor.claude` 재사용, 가상 `section_config`로 DB 오염 없이 실행
  튜닝: 상한 90초, 후보 15개 컷, 샘플 3건 (로컬 Qwen 속도 제약 반영)
- [x] **커밋·배포**: `7b30402`, `de697fd` → Vercel 자동 배포 완료

### 남은 Step

- [ ] **Step 8 — CEO 베타 테스트** ⭐ 지금 단계
  - [ ] CEO가 직접 위저드 end-to-end 경험
  - [ ] 발견된 버그·UX 이슈 수정
  - [ ] 지인 5~10명 베타 초대
  - [ ] 피드백 기반 프롬프트/위저드 미세 조정

### 의도적으로 보류한 것 (Phase 1에서 안 하기로 한 것)

- 기존 섹션에서 "AI로 수정" 진입점 (`settings.html`) — Step 8 피드백 후 결정
- 병렬 LLM 처리 최적화 — Qwen 동시성 한계로 효과 제한적

---

## Phase 2 이후 — 로드맵

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 2 | Today 탭 + Read Later 탭 고도화 | 대기 |
| Phase 3 | 카드뉴스에 "왜 중요한가" 섹션 추가 | 대기 |
| Phase 4 | Naver 뉴스 API 통합 + NewsAPI/GDELT 검토 | 대기 |
| Phase 5 | 하루 2회 배치 전환 (07:00, 19:00) | 대기 |
| Phase 6 | AI RSS 추천 고도화 (임베딩 기반 유사도) | 대기 |
| Phase 7 | 유료 티어 + 결제 + 원문 전체 번역 | 대기 |

---

## 🧭 참고 문서

| 문서 | 용도 |
|------|------|
| `PIGEONBRIEF.md` | 전체 개요, 기술 스택, 변경 이력 원장 |
| `docs/ai_keyword_design.md` | 프롬프트 설계, 사용자 여정, UI 와이어프레임 |
| `docs/phase1_plan.md` | Phase 1 구현 블루프린트 |
| `docs/status.md` | **(이 문서)** CEO용 현황 요약 |
| `data/rss_whitelist.json` | 검증된 RSS 56개 |

---

## ⚠️ 알려진 제약 / 주의사항

1. **미리보기 90초 상한** — 로컬 Qwen 2.5 14B가 요약당 10~15초 걸려서, 3건 요약도 빠듯함. 나중에 GPU 서버로 옮기면 해소됨
2. **Cloudflare Tunnel 의존** — 맥미니가 켜져 있어야 `api.pigeonbrief.com` 동작
3. **Ollama 프로세스** — 맥미니 재부팅 시 자동 시작 확인 필요
4. **미리보기 `partial` 상태** — 시간 초과 시 일부만 반환. 프론트는 정상적으로 카드 렌더링함
