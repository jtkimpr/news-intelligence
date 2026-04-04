"""
정적 사이트 생성기
처리된 articles → website/data/articles.json 갱신
app.js가 이 JSON을 읽어 카드뉴스를 렌더링
"""
import json
import os
from datetime import datetime, timezone


def build(
    articles: list,
    section_configs: dict,
    output_path: str = 'website/data/articles.json',
    max_per_section: int = 20,
) -> dict:
    """
    articles: Claude 처리 완료된 article dict 리스트
    section_configs: {section_id: section_config_dict}
    Returns: 생성된 JSON 데이터
    """
    # 섹션별 그룹화
    by_section: dict = {}
    for article in articles:
        sid = article['section']
        by_section.setdefault(sid, []).append(article)

    # 섹션별 최신순 정렬 + 최대 개수 제한
    for sid in by_section:
        by_section[sid].sort(
            key=lambda a: a.get('published_at', ''),
            reverse=True
        )
        by_section[sid] = by_section[sid][:max_per_section]

    # 섹션 순서: 설정 파일에 등록된 순서 유지
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
            'articles': [_pick_fields(a) for a in by_section[sid]],
        })

    # section_order에 없는 섹션도 뒤에 추가 (새 섹션 추가 대비)
    for sid, arts in by_section.items():
        if sid not in section_order:
            cfg = section_configs.get(sid, {})
            ordered_sections.append({
                'id': sid,
                'name': cfg.get('name', sid),
                'description': cfg.get('description', ''),
                'articles': [_pick_fields(a) for a in arts],
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
        'id':          article.get('id', ''),
        'title':       article.get('title', ''),
        'summary_ko':  article.get('summary_ko', ''),
        'url':         article.get('url', ''),
        'source_name': article.get('source_name', ''),
        'channel':     article.get('channel', 0),
        'published_at': article.get('published_at', ''),
        'section':     article.get('section', ''),
    }


if __name__ == '__main__':
    import yaml, os
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # 샘플 데이터로 JSON 구조 테스트
    section_configs = {}
    for sec_name in ['agentic-ai', 'epic-ai', 'financial-macro']:
        with open(f'config/sections/{sec_name}.yaml') as f:
            s = yaml.safe_load(f)
            section_configs[s['id']] = s

    # 더미 article로 구조 검증
    dummy = [{
        'id': 'test001',
        'section': 'agentic-ai',
        'channel': 3,
        'source_name': 'VentureBeat AI',
        'title': '테스트 기사 제목',
        'url': 'https://example.com',
        'published_at': '2026-04-04T03:00:00+00:00',
        'summary_ko': '테스트 한국어 요약입니다.',
    }]

    data = build(dummy, section_configs)
    print(f"생성 완료: {data['generated_at']}")
    print(f"섹션 수: {len(data['sections'])}")
    print(f"총 기사: {data['total_articles']}개")
    print(f"저장 위치: website/data/articles.json")
