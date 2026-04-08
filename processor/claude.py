"""
LLM 처리: 2단계 (Ollama 로컬 LLM)
1단계: 섹션별 관련성 필터링 (제목+소스만 입력, JSON 배열 반환)
2단계: 한국어 요약 생성 (통과한 기사만, 본문 1000자 truncate)
"""
import json
import re
from openai import OpenAI


def _get_client(settings: dict) -> tuple[OpenAI, str]:
    llm = settings.get('llm', {})
    base_url = llm.get('base_url', 'http://localhost:11434/v1')
    model = llm.get('model', 'qwen2.5:14b')
    client = OpenAI(base_url=base_url, api_key='ollama')
    return client, model


def _parse_json(text: str) -> list:
    """LLM 응답에서 JSON 배열 추출 (마크다운 코드블록 포함 대응)"""
    text = re.sub(r'```(?:json)?\s*', '', text).strip('` \n')
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        # {"items": [...]} 형태 대응
        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    return v
        return []
    except json.JSONDecodeError:
        m = re.search(r'\[.*?\]', text, re.DOTALL)
        return json.loads(m.group()) if m else []


def filter_section(
    articles: list,
    section_config: dict,
    client: OpenAI,
    model: str,
    min_score: float = 0.6,
) -> list:
    """
    1단계: 관련성 필터링
    제목 + 소스만 입력 → 관련 기사만 반환
    """
    if not articles:
        return []

    numbered = {i + 1: a for i, a in enumerate(articles)}
    article_list = '\n'.join(
        f"{i}. [{a['source_name']}] {a['title']}"
        for i, a in numbered.items()
    )

    system_prompt = (
        "You are a news relevance filter. "
        "Given a list of articles, return ONLY a JSON array of relevant ones with scores. "
        "Format: [{\"num\": 1, \"score\": 0.9}, ...] "
        "Score 0.0-1.0. No explanation. JSON only."
    )
    user_prompt = (
        f"Topic: {section_config['name']}\n"
        f"Purpose: {section_config.get('description', '')}\n\n"
        f"Articles:\n{article_list}\n\n"
        f"Return JSON array with score >= {min_score}."
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw = response.choices[0].message.content or ''
        results = _parse_json(raw)
        relevant_nums = {
            r['num'] for r in results
            if isinstance(r, dict) and r.get('score', 0) >= min_score
        }
        return [numbered[n] for n in sorted(relevant_nums) if n in numbered]
    except Exception as e:
        print(f"  [warn] 필터링 실패 ({section_config['name']}): {e}")
        return articles  # 실패 시 전체 통과


def summarize_article(
    article: dict,
    client: OpenAI,
    model: str,
    max_chars: int = 1000,
) -> str:
    """
    2단계: 한국어 요약 생성
    영문 기사도 한국어로 요약
    """
    content = article.get('raw_content', '').strip()
    if len(content) > max_chars:
        content = content[:max_chars] + '...'

    body = f"제목: {article['title']}\n\n본문:\n{content}" if content else f"제목: {article['title']}"

    system_prompt = (
        "당신은 뉴스 요약 전문가입니다.\n"
        "주어진 기사를 한국어로 3~4문장으로 요약하세요.\n"
        "요약에는 반드시 다음을 포함하세요:\n"
        "1) 무슨 일이 있었는지\n"
        "2) 왜 중요한지\n"
        "3) 독자(기업 CEO, 투자자, 의료 IT 전문가)에게 주는 시사점\n"
        "영문 기사도 반드시 한국어로 요약하세요.\n"
        "요약문만 출력하고 다른 설명은 하지 마세요."
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": body},
            ],
            temperature=0.3,
        )
        return (response.choices[0].message.content or '').strip()
    except Exception as e:
        print(f"  [warn] 요약 실패: {article['title'][:40]} — {e}")
        return ''


def run(articles: list, settings: dict, section_configs: dict) -> list:
    """
    전체 LLM 처리 파이프라인
    section_configs: {section_id: section_config_dict}
    Returns: 필터링 통과 + 한국어 요약 완료된 article 리스트
    """
    llm_settings = settings.get('llm', {})
    max_chars = llm_settings.get('max_input_tokens', 1000)
    min_score = llm_settings.get('min_relevance_score', 0.6)

    client, model = _get_client(settings)
    print(f"  [LLM] {model} @ {llm_settings.get('base_url', 'http://localhost:11434/v1')}")

    # 섹션별 그룹화
    by_section: dict = {}
    for a in articles:
        by_section.setdefault(a['section'], []).append(a)

    results = []
    for section_id, section_articles in by_section.items():
        section_cfg = section_configs.get(section_id, {'name': section_id})
        name = section_cfg.get('name', section_id)
        print(f"\n  [{name}] {len(section_articles)}개 → 필터링 중...")

        # 1단계: 관련성 필터링
        filtered = filter_section(section_articles, section_cfg, client, model, min_score)
        print(f"  [{name}] {len(filtered)}개 통과 → 한국어 요약 중...")

        # 2단계: 한국어 요약
        for i, article in enumerate(filtered, 1):
            summary = summarize_article(article, client, model, max_chars)
            article['summary_ko'] = summary
            article['included'] = True
            results.append(article)
            print(f"    ({i}/{len(filtered)}) {article['title'][:55]}")

    return results
