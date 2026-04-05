"""
정적 사이트 생성기
처리된 articles → website/data/articles.json 갱신
- 기존 articles.json과 병합 (7일간 누적)
- 7일 이상 된 기사 자동 삭제
"""
import json
import os
from datetime import datetime, timezone, timedelta


def build(
    articles: list,
    section_configs: dict,
    output_path: str = 'website/data/articles.json',
    max_age_days: int = 7,
) -> dict:
    """
    articles: Claude 처리 완료된 article dict 리스트 (오늘 새 기사)
    section_configs: {section_id: section_config_dict}
    기존 articles.json을 로드해 병합하고, max_age_days 초과 기사 제거
    Returns: 생성된 JSON 데이터
    """
    # 1. 기존 articles.json 로드 (누적분)
    existing_by_id: dict = {}
    if os.path.exists(output_path):
        try:
            with open(output_path, encoding='utf-8') as f:
                existing_data = json.load(f)
            for sec in existing_data.get('sections', []):
                for art in sec.get('articles', []):
                    if art.get('id'):
                        existing_by_id[art['id']] = art
        except Exception:
            pass

    # 2. 새 기사 추가 (같은 ID면 덮어씀)
    for article in articles:
        picked = _pick_fields(article)
        if picked['id']:
            existing_by_id[picked['id']] = picked

    # 3. 7일 초과 기사 제거 (좋아요 예외 처리는 브라우저 localStorage에서 담당)
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    all_articles = []
    for art in existing_by_id.values():
        pub = art.get('published_at', '')
        try:
            pub_dt = datetime.fromisoformat(pub)
            # timezone-naive인 경우 UTC로 간주
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
            if pub_dt >= cutoff:
                all_articles.append(art)
        except Exception:
            all_articles.append(art)  # 날짜 파싱 실패 시 유지

    # 4. 섹션별 그룹화 + 최신순 정렬
    by_section: dict = {}
    for art in all_articles:
        sid = art.get('section', '')
        if sid:
            by_section.setdefault(sid, []).append(art)

    for sid in by_section:
        by_section[sid].sort(key=lambda a: a.get('published_at', ''), reverse=True)

    # 5. 섹션 순서 유지
    section_order = list(section_configs.keys())
    ordered_sections = []

    for sid in section_order:
        if sid not in by_section:
            continue
        cfg = section_configs[sid]
        ordered_sections.append({
            'id': sid,
            'name': cfg.get('name', sid),
            'description': cfg.get('description', ''),
            'articles': by_section[sid],
        })

    for sid, arts in by_section.items():
        if sid not in section_order:
            cfg = section_configs.get(sid, {})
            ordered_sections.append({
                'id': sid,
                'name': cfg.get('name', sid),
                'description': cfg.get('description', ''),
                'articles': arts,
            })

    data = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'total_articles': sum(len(s['articles']) for s in ordered_sections),
        'sections': ordered_sections,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return data


def _pick_fields(article: dict) -> dict:
    """웹사이트에 필요한 필드만 추출 (raw_content 등 제외)"""
    return {
        'id':           article.get('id', ''),
        'title':        article.get('title', ''),
        'summary_ko':   article.get('summary_ko', ''),
        'url':          article.get('url', ''),
        'source_name':  article.get('source_name', ''),
        'published_at': article.get('published_at', ''),
        'section':      article.get('section', ''),
    }
