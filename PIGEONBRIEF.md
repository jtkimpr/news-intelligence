# PigeonBrief — 프로젝트 상세 문서

RSS·Google News에서 주제별 뉴스를 수집해 로컬 LLM으로 필터링·요약, 회원제 웹사이트로 자동 발행하는 개인 뉴스 인텔리전스 시스템.

---

## 아키텍처 개요

```
[사용자 브라우저]
  ↕ Clerk 인증
  ↕ 기사·설정 API 호출
[Vercel — 프론트엔드 (pigeonbrief.vercel.app)]
  ↕
[Cloudflare Tunnel — api.pigeonbrief.com]
  ↕
[Mac Mini M4 — localhost:8000]
  ├── FastAPI 백엔드
  │     ├── GET  /api/articles        사용자별 기사 목록
  │     ├── GET  /api/settings        내 섹션/RSS/키워드 조회
  │     ├── POST /api/settings/sections   섹션 추가
  │     ├── PUT  /api/settings/sections/{id}
  │     ├── DELETE /api/settings/sections/{id}
  │     ├── POST /api/settings/rss    RSS 소스 추가
  │     ├── DELETE /api/settings/rss/{id}
  │     ├── POST /api/settings/keywords
  │     └── DELETE /api/settings/keywords/{id}
  ├── SQLite DB (data/pigeonbrief.db)
  │     ├── users
  │     ├── sections     (사용자별)
  │     ├── rss_sources  (섹션별)
  │     ├── keywords     (섹션별)
  │     ├── articles     (사용자별)
  │     └── seen_urls    (중복 방지, 사용자별)
  └── 파이프라인 (launchd 매일 자동 실행)
        ├── git pull
        ├── collectors/rss.py       RSS 수집
        ├── collectors/keyword.py   Google News 수집
        ├── processor/dedup.py      중복 제거
        ├── processor/claude.py     Ollama 필터링 + 한국어 요약
        └── generator/build_site.py → DB 저장 + git push → Vercel 배포
```

---

## 디렉터리 구조

```
pigeonbrief/
├── pipeline.py                  # 메인 파이프라인 실행 스크립트
├── backend/                     # FastAPI 백엔드
│   ├── main.py                  # 앱 진입점, CORS 설정
│   ├── database.py              # SQLite 초기화 및 연결
│   ├── auth.py                  # Clerk JWT 검증
│   └── routers/
│       ├── settings.py          # 섹션/RSS/키워드 CRUD API
│       └── articles.py          # 기사 조회 API
├── collectors/
│   ├── rss.py                   # RSS 피드 수집 (feedparser)
│   └── keyword.py               # Google News 키워드 수집
├── processor/
│   ├── dedup.py                 # SQLite 기반 URL·제목 중복 제거
│   └── claude.py                # Ollama(qwen2.5:14b) 필터링 + 한국어 요약
├── generator/
│   └── build_site.py            # 기사 데이터 생성 및 저장
├── config/
│   ├── settings.yaml            # 파이프라인 전역 설정
│   └── sections.json            # 기본 섹션 정의 (파이프라인용 fallback)
├── scripts/
│   ├── run_pipeline.sh          # launchd 파이프라인 실행 스크립트
│   └── run_backend.sh           # 백엔드 수동 실행 스크립트
├── website/                     # Vercel 배포 대상
│   ├── index.html               # 메인 화면 (Clerk 인증 체크 포함)
│   ├── sign-in.html             # 로그인 페이지 (Clerk UI)
│   ├── settings.html            # 사용자 설정 페이지 (섹션/RSS/키워드)
│   └── assets/
│       ├── app.js               # 메인 프론트엔드 로직 (API 호출 방식)
│       ├── settings.js          # 설정 패널 UI
│       └── style.css            # 스타일
├── data/
│   └── pigeonbrief.db           # SQLite DB (사용자·기사·설정 통합)
├── .env                         # 환경변수 (gitignore됨)
└── requirements.txt             # Python 의존성
```

---

## 환경변수 (.env)

```env
# Clerk 인증
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWKS_URL=https://becoming-salmon-61.clerk.accounts.dev/.well-known/jwks.json
```

---

## 인프라 설정

### Cloudflare Tunnel
- 터널명: `pigeonbrief`
- 터널 ID: `a35624e3-6d74-40ae-b253-ff5f09acb696`
- 설정 파일: `~/.cloudflared/config.yml`
- 연결: `api.pigeonbrief.com` → `localhost:8000`
- 자동 실행: `brew services start cloudflared`

### launchd 서비스
| 서비스 | plist 파일 | 역할 |
|--------|-----------|------|
| 파이프라인 | `com.pigeonbrief.pipeline.plist` | 매일 자동 수집·요약 |
| 백엔드 | `com.pigeonbrief.backend.plist` | FastAPI 서버 상시 실행 |
| Cloudflare | `homebrew.mxcl.cloudflared` | 터널 상시 유지 |

### 도메인 (Cloudflare DNS + Vercel)
- 도메인: `pigeonbrief.com` (Cloudflare에서 구매)
- 프론트엔드: `pigeonbrief.com` / `www.pigeonbrief.com` → Vercel (pigeonbrief 프로젝트)
- API: `api.pigeonbrief.com` → Cloudflare Tunnel → `localhost:8000`

**Cloudflare DNS 레코드**
| Type | Name | Value | Proxy |
|------|------|-------|-------|
| A | `@` | `216.198.79.1` | DNS only |
| CNAME | `www` | `530585508f0e547f.vercel-dns-017.com` | DNS only |

> Proxy를 DNS only(회색)로 유지해야 함 — Vercel이 SSL을 직접 처리하므로 Cloudflare 프록시와 충돌

**Vercel Domains 설정**
- `pigeonbrief.com` → 307 redirect → `www.pigeonbrief.com`
- `www.pigeonbrief.com` → Production

### Clerk
- 애플리케이션명: PigeonBrief
- 프론트엔드 API: `becoming-salmon-61.clerk.accounts.dev`
- 사용자 관리: [clerk.com 대시보드](https://clerk.com) → Users 메뉴
- 가입 방식: 오픈 가입 (Allowlist 비활성화 — 누구든 가입 가능)
- 신규 사용자 DB 등록: 로그인 후 설정 페이지(`/settings.html`) 첫 방문 시 자동 등록

---

## LLM 설정 (processor/claude.py)

Claude API 대신 로컬 Ollama + qwen2.5:14b 사용.

```yaml
# config/settings.yaml
llm:
  model: qwen2.5:14b
  base_url: http://localhost:11434/v1
  max_input_tokens: 1000
  min_relevance_score: 0.6
```

- 1단계: 관련성 필터링 (JSON 배열 반환, `response_format: json_object`)
- 2단계: 한국어 3~4문장 요약
- API 비용 없음, 속도: 기사당 약 20~30초

---

## 파이프라인 상세

### 현재 상태 (2026-04-08 기준)
파이프라인은 **DB 기반 사용자별 수집**으로 전환 완료.

### 현재 흐름
```
DB (사용자별 sections/rss/keywords)
  → 사용자별 수집 (rss.collect + keyword.collect)
  → seen_urls 필터 (pigeonbrief.db, 사용자별)
  → 배치 중복 제거 (URL 해시 + 제목 유사도)
  → Ollama 필터링·요약
  → articles 테이블 저장
  → seen_urls 기록
  → FastAPI /api/articles → 프론트엔드
```

---

## 프론트엔드

### 인증 흐름
1. `index.html` 접속 → Clerk SDK 로드
2. 로그인 안 된 경우 → `sign-in.html`로 자동 이동
3. 로그인 완료 → `initApp()` 호출 → 백엔드 API에서 기사 로드
4. 헤더 로그아웃 버튼(→ 아이콘) → `Clerk.signOut()` → `sign-in.html`

### 설정 흐름 (settings.html)
- 헤더 ⚙️ 버튼 클릭 → `settings.html` 이동
- 섹션 추가/삭제, RSS 소스 추가/삭제, 키워드 추가/삭제
- 변경사항 즉시 API 호출로 DB 저장

### 기사 로드
- `app.js`의 `loadData()`: `GET https://api.pigeonbrief.com/api/articles` (Bearer 토큰)
- 기존 `articles.json` 파일 방식 → API 방식으로 전환 완료

---

## 제품 비전 및 로드맵 (2026-04-09 재정립)

### 제품 핵심 정체성
**"AI 키워드 제안 대화형 UX로 자신만의 개인화된 맞춤 뉴스를 누구나 쉽게 설정할 수 있는 서비스"**

타겟: 자기 분야 최신 뉴스를 빠르게 파악해야 하는 전문직 (영어 뉴스 비중 큼)
차별화: 사용자가 키워드를 직접 만들 필요 없이, AI가 검색 전문가 역할로 키워드/소스를 제안하고 사용자는 결정만 함.

### 비즈니스 모델
- 무료: 관심 주제 3개까지
- 유료 ($1/월): 주제 4개 이상 + 카드뉴스 원문 전체 번역

### 갭 분석 — 현재 vs 목표

| 항목 | 현재 | 목표 |
|------|------|------|
| AI 키워드 제안 대화형 UX | ❌ 수동 입력만 | ⭐ 핵심 기능 |
| AI RSS 소스 추천 | ❌ | ✅ |
| 키워드 미리보기 (저장 전 샘플 결과) | ❌ | ✅ |
| Today 탭 (전 섹션 통합) | ❌ 섹션별만 | ✅ |
| Read Later 탭 (영구 보관) | ❌ | ✅ |
| 카드뉴스 "왜 중요한가" | ❌ 요약만 | ✅ |
| Naver 뉴스 소스 | ❌ Google News만 | ✅ |
| 영문 소스 강화 (NewsAPI 등) | 부분 | ✅ |
| 하루 2회 배치 (07:00 / 19:00) | 하루 1회 | ✅ |
| 유료 티어 + 결제 | ❌ | (PoC 후반) |
| 원문 전체 번역 (유료) | ❌ | (PoC 후반) |

### PoC 로드맵

**Phase 0 — AI 키워드 제안 사전 설계 및 검증** ⭐ (현재 단계)
- 핵심 기능 품질을 본격 구현 전 프롬프트 단위로 검증
- 산출물:
  - `docs/ai_keyword_design.md` — 프롬프트 3종 + 사용자 플로우 + API 스펙 + UI 와이어프레임
  - `scripts/test_ai_keyword.py` — 10개 테스트 주제로 프롬프트 단독 실행
  - 프롬프트 튜닝 반복 (목표: 10개 중 8개 이상 실용 가능 수준)
- 완료 기준: 프롬프트 품질 80%+ 및 설계 문서 완성 → Phase 1 착수 승인

**Phase 1 — AI 키워드 제안 대화형 UX 구현**
- 백엔드 API 4종 신규
  - `POST /api/ai/interpret` — 주제 해석 + 되묻기
  - `POST /api/ai/suggest-keywords` — 키워드 + RSS 추천
  - `POST /api/ai/edit-keywords` — 자연어 수정 요청
  - `POST /api/ai/preview` — 미리보기 실행 (샘플 5건 수집·요약)
- LLM 응답 캐싱 (24시간), JSON 파싱 실패 재시도, RSS feedparser 검증
- 프론트엔드 온보딩 위저드 4단계 확장 (주제 입력 / 키워드 제안 / 소스 / 미리보기)
- 기존 섹션 "AI와 다시 대화해서 수정" 진입점

**Phase 2** — Today 탭 + Read Later 탭
**Phase 3** — 카드뉴스 "왜 중요한가" 추가
**Phase 4** — Naver API 통합 + NewsAPI/GDELT 검토
**Phase 5** — 하루 2회 배치 전환 (07:00, 19:00)
**Phase 6** — AI RSS 추천 고도화 (화이트리스트 검토)
**Phase 7** — 유료 티어 + 결제 + 원문 전체 번역

### AI 키워드 제안 — 핵심 설계 요약

**사용자 여정 (8 step)**
1. 주제 자연어 입력
2. AI가 해석 → 필요 시 1회 되묻기 (선택지 제공)
3. AI가 키워드 후보 카테고리화 (핵심 / 관련 기업 / 관련 개념 / 제외)
4. 사용자가 체크박스로 수정 + 자연어로 "X도 추가해줘" 가능
5. 검색 쿼리 미리보기 (AND/OR/NOT)
6. AI가 적합 RSS 소스 추천 (feedparser 검증 통과한 것만)
7. 미리보기: 최근 24시간 샘플 결과 5건
8. 섹션 확정 + 저장

**핵심 설계 원칙**
- 대화는 3~5회 상호작용으로 완료, 너무 많이 묻지 않기
- AI는 제안자, 사용자는 결정자 (모든 제안 수정 가능)
- 저장 전 미리보기 필수
- 콜드 스타트 OK (사용자 히스토리 없이도 첫 시도부터 유용)
- 섹션 저장 후에도 AI 대화로 재편집 가능

**프롬프트 3종 (Qwen 14B)**
- A: 주제 해석 + 되묻기 (`needs_clarification`, `clarification_options`)
- B: 키워드 + RSS 추천 (`core_keywords`, `related_entities`, `related_concepts`, `exclude_keywords`, `recommended_query`, `recommended_rss`)
- C: 자연어 수정 요청 처리

**RSS 환각 방지**: AI 추천 URL을 반환 전 feedparser로 검증, 실패 시 제외

**리스크 및 완화**
- Qwen 응답 품질 편차 → Phase 0 프롬프트 사전 튜닝
- JSON 파싱 실패 → `response_format: json_object` + 재시도
- RSS 환각 → 실시간 검증
- 미리보기 속도 → 샘플 5건만, 병렬 처리, 30초 상한

> 상세 설계는 `docs/ai_keyword_design.md` 참조.

---

## 남은 작업

**Phase 0 완료 (2026-04-09)** — v2 프롬프트로 11개 주제 평균 자동 점수 4.00/5 달성, 8/11 주제 ≥4점. 상세는 `docs/ai_keyword_design.md` 및 `data/test_results/2026-04-09-1320-v2/summary.md` 참조.

**Phase 0 핵심 발견사항 (Phase 1에 반영됨)**
- 키워드 품질은 v2 프롬프트로 충분 — 표면 단어 반복 문제 해결, related_entities에 진짜 고유명사 등장
- **RSS URL 직접 추천은 한계 명확** — v2도 메이저 매체(WSJ, Bloomberg, Reuters) 경로 환각, 한국 매체 RSS 변경 추적 불가
- → **Phase 1에서 RSS 추천 아키텍처 변경**: AI 직접 생성 → 사전 검증된 화이트리스트 DB 기반 추천으로 전환
- 짧은 입력 100% 되묻기 작동 확인 (`scripts/test_short_inputs.py`)

**Phase 1 구현 완료 (2026-04-09)** — Step 1~6 완료, 남은 건 Step 8 (CEO 베타 테스트).
- 상세 계획: `docs/phase1_plan.md`
- 커밋: `7b30402 feat(phase1): AI 키워드 제안 대화형 온보딩 (Step 1~6)`
- **남은 작업**: CEO가 pigeonbrief.com에서 직접 위저드 돌려본 후 피드백 → 수정 → 지인 베타 확대

---

## 주요 변경 이력

### 2026-04-09 — Phase 1: AI 키워드 제안 대화형 온보딩 구현

커밋 `7b30402 feat(phase1): AI 키워드 제안 대화형 온보딩 (Step 1~6)` — 19 files, +3163/-85.

**새 모듈 (`backend/ai/`)**
- `prompts.py` — v2 프롬프트 3종 (A 해석/되묻기, B 키워드 추천, C 자연어 수정). Few-shot 포함, RSS는 프롬프트에서 제외 (화이트리스트로 분리)
- `cache.py` — SQLite 기반 LLM 응답 캐시 (SHA-256 키, 24h TTL, `ai_cache` 테이블)
- `llm_client.py` — Ollama OpenAI 호환 엔드포인트, JSON 모드, 1회 재시도, 캐시 통합. `interpret()` / `suggest_keywords()` / `edit_keywords()`
- `rss_recommender.py` — 키워드 세트 → 카테고리 추론 → `data/rss_whitelist.json` 매칭 → 상위 N개. 약 60개의 키워드→카테고리 매핑 휴리스틱
- `preview.py` — 실제 수집·요약 파이프라인 (`collectors.rss` + `collectors.keyword` + `processor.claude`) 재사용. 가상 `section_config`를 메모리에 만들어 DB 저장 없이 실행. 전체 상한 **90초**, 후보 15개 컷, `min_score=0.5`, 상태별 응답(`ok`/`partial`/`empty`/`no_llm`/`no_summary`)

**새 라우터 (`backend/routers/ai.py`)**
- `POST /api/ai/interpret` — 주제 해석, 필요 시 clarification question 1개 반환
- `POST /api/ai/suggest-keywords` — 키워드 세트 + 화이트리스트 RSS 상위 5개
- `POST /api/ai/edit-keywords` — 자연어 수정 요청
- `POST /api/ai/preview` — 실제 수집·요약 (기본 `max_articles=3`)
- 모두 Clerk 인증(`verify_token`) 필요. `backend/main.py`에 `prefix="/api/ai"`로 등록

**DB 스키마 (`backend/database.py`)**
- `ai_cache` 테이블 신규 (cache_key PK, response, created_at)
- `sections.created_via` 컬럼 추가 (`ALTER TABLE`, 기본값 `'manual'`, 안전 마이그레이션 — `PRAGMA table_info` 체크 후 부재 시에만)

**RSS 화이트리스트 (`data/rss_whitelist.json`)**
- 69개 후보 → feedparser 검증(3회 재시도, 20초 타임아웃) → **56개 통과** 저장
- 카테고리 분포: tech 16 / business 13 / finance 12 / science 9 / ai 6 / geopolitics 6 / startup 5 / healthcare 5 / bio 5 / vc 4 / policy 4 / general 4
- 빌더: `scripts/build_rss_whitelist.py`

**프론트엔드 (`website/assets/app.js`, `style.css`)**
- 온보딩 위저드 **3단계 → 5단계** 전면 교체
  - Step 1: 자연어 주제 입력 (textarea)
  - Step 2: 되묻기 (필요 시만, 건너뛰기 가능)
  - Step 3: 키워드 칩(클릭 토글) + 연관/제외 + 추천 검색어 + RSS 체크박스 + **"AI로 수정"** 인라인 박스
  - Step 4: 미리보기 (상한 90초, 샘플 3건)
  - Step 5: 섹션 생성 + 선택 RSS/검색어 일괄 등록 → 완료
- `wizState` 객체로 단계 간 상태 유지, 로딩 스피너 공통화
- 새 CSS: `.wiz-chip`, `.wiz-rss-item`, `.wiz-ai-edit`, `.wizard-spinner`, `.wiz-preview-*`

**문서·스크립트**
- `docs/ai_keyword_design.md` — 사용자 여정 8단계, 프롬프트 3종, UI 와이어프레임, v1→v2 changelog
- `docs/phase1_plan.md` — Phase 1 구현 블루프린트
- `scripts/test_ai_keyword.py` — 11개 주제 자동 평가 (5점 만점), v2 평균 4.00/5 달성
- `scripts/test_short_inputs.py` — 짧은 입력 10개 되묻기율 100% 확인

**튜닝 결정사항 (로컬 Ollama 제약 반영)**
- 미리보기 상한 45초 → **90초** (Qwen 2.5 14B 요약 1건당 10~15초)
- 미리보기 샘플 5건 → **3건** (미리보기는 맛보기 용도, 실제 일일 파이프라인은 섹션당 20건 유지)

**남은 작업 (Phase 1 Step 8)**
- CEO가 pigeonbrief.com에서 위저드 직접 사용 → 피드백 수집
- 필요 시 수정 후 지인 5~10명 베타 확대
- 설정 화면(`settings.html`)의 기존 섹션에 "AI로 수정" 버튼 추가는 후속 작업

---

### 2026-04-09 (Phase 1 이전)

**브라우저 "Failed to fetch" 해결 — `.env` 로드 import 순서 버그**
- 증상: `pigeonbrief.com` 로그인 후 `/api/articles` 호출이 브라우저에서 CORS 오류처럼 보이며 실패. 실제로는 백엔드가 500을 반환했고, 500 응답에는 CORSMiddleware가 헤더를 붙이지 못해 브라우저에 CORS 오류로 표출됨
- 근본 원인: `backend/main.py`가 `.env`를 로드하기 **전에** `from backend.routers import ...`를 먼저 실행 → `auth.py:15`의 `CLERK_JWKS_URL = os.environ.get(...)`이 모듈 로드 시점에 빈 문자열로 고정 → JWKS 조회 단계에서 `RuntimeError` 발생
- 수정:
  - `backend/main.py`: `.env` 로드 블록을 모든 `backend.*` import 위로 이동
  - `backend/auth.py`: `CLERK_JWKS_URL`을 모듈 전역 상수가 아닌 `_get_jwks()` 호출 시점에 `os.environ.get(...)`으로 읽도록 변경 (import 순서 의존성 제거, 재발 방지)
- 검증: `launchctl kickstart -k` 후 `/health` 200, `/api/articles`(인증 없음) 500 → 401 로 정상화. 브라우저에서도 정상 동작 확인

**`.env` 로딩을 `python-dotenv`로 교체 (후속)**
- 수동 파서(직접 파일 읽어 split)를 `dotenv.load_dotenv()`로 교체
- `Path(__file__).resolve().parent.parent / ".env"` 절대경로 지정 → cwd 의존성 제거
- `requirements.txt`에 `python-dotenv>=1.0.0` 추가
- `.venv`에 설치 후 launchd 재시작, 동일하게 정상 동작 확인

### 2026-04-08 (5차)

**신규 사용자 온보딩 위저드 추가 (`website/assets/app.js`, `website/assets/style.css`)**
- 로그인 후 섹션 없는 신규 사용자에게 `settings.html` 이탈 없이 인라인 3단계 위저드 표시
- Step 1: 주제 이름/설명 입력 → FastAPI 백엔드로 섹션 생성
- Step 2: RSS 피드 / 키워드 탭 전환 UI로 소스 등록 (스킵 가능)
- Step 3: 완료 화면 + "오늘 밤 첫 브리핑 도착" 수집 예약 안내
- 단계 인디케이터(●—●—●), 태그 목록, API 오류 처리 포함
- `loadData()`에 try-catch 추가 → 오류 시 "⚠️ 다시 시도" 버튼 표시 (빈 화면 방지)

**인프라 이슈 수정**
- Cloudflare 터널 plist(`homebrew.mxcl.cloudflared.plist`) 수정:
  - `ProgramArguments`에 `tunnel run pigeonbrief` 인수 추가 (누락으로 터널 미실행 상태였음)
  - `LimitLoadToSessionType` 제거 (bootstrap 오류 원인)
  - `KeepAlive: true` 설정 (프로세스 죽으면 자동 재시작)
- uvicorn 중복 프로세스 정리: 수동 실행 프로세스가 포트 점유 → launchd 재기동 실패 반복 → 정리 후 launchd 단독 관리로 정상화
- `com.pigeonbrief.backend.plist` 연결 plist는 정상, launchd로 uvicorn 관리 중

**미커밋 코드 Git 동기화**
- `pipeline.py`, `processor/claude.py`, `backend/database.py`, `processor/dedup.py` — 이전 세션에서 구현됐으나 미커밋 상태였던 변경사항 푸시 완료

### 2026-04-08 (4차)

**비로그인 랜딩 페이지 추가 (`website/index.html`, `website/assets/style.css`, `website/assets/app.js`)**

- `index.html`: `#landing` / `#app` 두 섹션으로 분리
  - 비로그인 → 랜딩 표시, 로그인 → 앱 표시 (Clerk 로드 후 전환)
  - `<head>` 인라인 스크립트로 `pb_loggedin` localStorage 플래그 확인 → 재방문 로그인 유저는 랜딩을 렌더링 전에 CSS로 즉시 숨겨 flash 완전 제거
  - 로그아웃 시 `pb_loggedin` 플래그 삭제 → 다음 방문 시 랜딩 재표시
- `style.css`: 랜딩 전용 스타일 추가 (landing-nav, hero, features-section, how-it-works, landing-bottom-cta, 반응형)
- `app.js`: 섹션 미등록 신규 사용자에게 빈 화면 대신 온보딩 안내 표시 ("첫 섹션 추가하기 →")

**랜딩 페이지 구성**
- 네비게이션: PigeonBrief 로고 + 로그인 버튼
- 히어로: "나만의 뉴스를 자동으로" + 설명 + CTA 버튼 + 샘플 뉴스 카드 3개
- 기능 소개: 📡 원하는 소스 구독 / 🤖 AI 자동 요약 / 🗂️ 주제별 정리
- 이용 방법: 3단계 (가입 → 주제·소스 등록 → 매일 자동 브리핑)
- 하단 CTA: 다크 배경 재강조

### 2026-04-08 (3차)

**도메인 연결 완료**
- Vercel Domains에 `pigeonbrief.com`, `www.pigeonbrief.com` 추가
- Cloudflare DNS에 A 레코드(`@` → `216.198.79.1`), CNAME(`www` → `530585508f0e547f.vercel-dns-017.com`) 추가
- Proxy status DNS only 설정 (Vercel SSL과 충돌 방지)
- `pigeonbrief.com` 접속 및 로그인 정상 확인
- Clerk Allowlist 비활성화 확인 (오픈 가입)

### 2026-04-08 (2차)

**파이프라인 DB 전환 완료**
- `pipeline.py`: `config/sections.json` → SQLite DB 기반 사용자별 루프로 전면 교체
  - `get_all_users()` → 사용자 루프
  - `get_user_sections_config()` → 섹션+RSS+키워드 조회
  - `filter_seen_urls()` / `mark_urls_seen()` → seen_urls 테이블 활용
  - `save_articles_to_db()` → articles 테이블 저장
  - git push 제거 (기사는 DB→API로 서빙)
- `backend/database.py`: 파이프라인 전용 헬퍼 5개 추가
  (`get_all_users`, `get_user_sections_config`, `filter_seen_urls`, `mark_urls_seen`, `save_articles_to_db`)
- `processor/dedup.py`: `run_batch()` 추가 (seen_urls 제외, 배치 내 중복만 처리)

### 2026-04-08 (1차)

**LLM 교체: Claude API → Ollama 로컬 LLM**
- `processor/claude.py`: `anthropic` → `openai` (Ollama OpenAI 호환 API)
- 모델: `qwen2.5:14b` (맥미니 로컬 설치)
- `requirements.txt`: `anthropic` → `openai>=1.0.0`
- `config/settings.yaml`: `claude:` → `llm:` 섹션으로 변경
- Python 3.13 설치 (Homebrew), `.venv` 생성

**멀티유저 인증 및 개인화 시스템 추가**
- Cloudflare Tunnel 설치·설정 (`api.pigeonbrief.com`)
- `pigeonbrief.com` 도메인 Cloudflare에서 구매
- FastAPI 백엔드 신규 개발 (`backend/`)
  - SQLite DB 설계 (users, sections, rss_sources, keywords, articles, seen_urls)
  - Clerk JWT 검증 (`auth.py`)
  - 설정 CRUD API (`routers/settings.py`)
  - 기사 조회 API (`routers/articles.py`)
- Clerk 인증 연동
  - `website/sign-in.html` 신규 생성
  - `website/index.html` Clerk 인증 체크 + 로그아웃 버튼 추가
  - `website/settings.html` 신규 생성 (섹션/RSS/키워드 관리 UI)
  - `website/assets/app.js` API 호출 방식으로 전환
- launchd 서비스 등록 (`com.pigeonbrief.backend.plist`)

### 2026-04-06

**채널3 키워드 UI 개선 (`settings.js`, `style.css`)**
- 시각적 태그 빌더로 교체 (AND/OR/NOT 그룹)
- 쿼리 미리보기 실시간 확인

**헤더 디자인 개선 (`index.html`, `style.css`)**
- 비둘기 SVG 로고 추가
- 폰트: Libre Baskerville (Google Fonts)

---

## 주요 설계 결정

| 결정 | 이유 |
|------|------|
| Ollama 로컬 LLM | Claude API 비용 절감, 맥미니 상시 가동 활용 |
| FastAPI + SQLite | 경량, Python 기반(기존 코드와 통일), 외부 DB 불필요 |
| Cloudflare Tunnel | 공유기 포트포워딩 불필요, IP 노출 없음, 무료 |
| Clerk 인증 | 완성된 로그인 UI 제공, 10,000 MAU 무료 |
| 로그인 장벽 방식 | articles.json URL 보안보다 실용성 우선 (지인 대상 소규모 운영) |
| 파이프라인 per-user | 사용자별 독립적 설정, 소규모에서 단순함 우선 |
| dedup mark_as_seen 지연 | 사이트 생성 실패 시 다음 실행에서 재처리 가능하게 |
| launchd (not cron) | Mac 절전 후 자동 재실행, 로그 통합 관리 |
