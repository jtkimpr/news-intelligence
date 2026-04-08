"""
PigeonBrief 파이프라인 메인 스크립트
launchd → scripts/run_pipeline.sh → 이 파일 실행

단계 (사용자별 반복):
1. git pull (최신 코드 반영)
2. 설정 로드 (config/settings.yaml)
3. DB에서 전체 사용자 조회
4. 사용자별: 섹션 조회 → 수집 → seen_urls 필터 → 배치 중복 제거 → LLM 처리 → DB 저장
"""
import os
import sys
import yaml
import subprocess
from datetime import datetime, timezone

# 프로젝트 루트 기준으로 경로 설정
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
sys.path.insert(0, ROOT)

from collectors import rss, keyword
from processor import dedup, claude
from backend.database import (
    init_db,
    get_all_users,
    get_user_sections_config,
    filter_seen_urls,
    mark_urls_seen,
    save_articles_to_db,
)


def git_pull() -> bool:
    """실행 전 최신 코드 반영을 위해 git pull"""
    try:
        result = subprocess.run(
            ['git', 'pull', '--ff-only'],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"[git] pull 완료: {result.stdout.strip() or 'Already up to date.'}")
        else:
            print(f"[warn] git pull 실패 (계속 진행): {result.stderr.strip()}")
        return True
    except Exception as e:
        print(f"[warn] git pull 오류 (계속 진행): {e}")
        return False


def notify_mac(title: str, message: str):
    """Mac 알림 (launchd 실행 시 완료/오류 알림)"""
    try:
        subprocess.run([
            'osascript', '-e',
            f'display notification "{message}" with title "{title}"'
        ], check=True, capture_output=True)
    except Exception:
        pass


def process_user(user: dict, settings: dict) -> int:
    """
    사용자 1명의 전체 파이프라인 실행
    Returns: DB에 저장된 기사 수
    """
    user_id = user['id']
    user_email = user['email']
    print(f"\n{'─'*40}")
    print(f"[사용자] {user_email}")

    # 섹션 설정 조회 (sections + rss_sources + keywords)
    section_configs = get_user_sections_config(user_id)
    if not section_configs:
        print("  설정된 섹션 없음, 건너뜀")
        return 0

    # 수집
    all_articles = []
    for sid, section in section_configs.items():
        print(f"\n  [수집] {section['name']}")
        articles = []
        articles += rss.collect(section, settings)
        articles += keyword.collect(section, settings)
        print(f"    소계: {len(articles)}개")
        all_articles.extend(articles)

    print(f"  수집 합계: {len(all_articles)}개")

    if not all_articles:
        print("  수집된 기사 없음, 건너뜀")
        return 0

    # seen_urls 필터 (이미 처리된 기사 제거)
    all_articles = filter_seen_urls(all_articles, user_id)
    print(f"  seen_urls 필터 후: {len(all_articles)}개")

    if not all_articles:
        print("  새 기사 없음, 건너뜀")
        return 0

    # 배치 내 중복 제거 (URL 해시 + 제목 유사도)
    deduped, stats = dedup.run_batch(all_articles)
    print(
        f"  배치 중복 제거: URL -{stats['removed_url_dup']} / "
        f"제목유사 -{stats['removed_title_dup']} → {stats['remaining']}개"
    )

    if not deduped:
        print("  중복 제거 후 처리할 기사 없음, 건너뜀")
        return 0

    # LLM 필터링 + 한국어 요약
    print(f"  LLM 필터링 + 요약 시작...")
    processed = claude.run(deduped, settings, section_configs)
    print(f"  LLM 처리 완료: {len(processed)}개")

    if not processed:
        print("  관련 기사 없음")
        # 처리 시도한 기사는 seen으로 기록 (다음 실행 시 재처리 방지)
        mark_urls_seen(deduped, user_id)
        return 0

    # DB 저장
    saved = save_articles_to_db(processed, user_id)
    print(f"  DB 저장: {saved}개")

    # seen_urls 기록 (DB 저장 성공 후 — 실패 시 다음 실행에서 재처리 가능)
    mark_urls_seen(deduped, user_id)

    return saved


def main():
    start_time = datetime.now(timezone.utc)
    date_str = start_time.strftime('%Y-%m-%d')
    print(f"{'='*50}")
    print(f"PigeonBrief 파이프라인 시작: {date_str}")
    print(f"{'='*50}")

    try:
        # 0. git pull
        git_pull()

        # 1. DB 초기화 (테이블 없으면 생성)
        init_db()

        # 2. 설정 로드
        with open('config/settings.yaml') as f:
            settings = yaml.safe_load(f)

        # 3. 사용자 목록 조회
        users = get_all_users()
        if not users:
            print("등록된 사용자 없음. 종료.")
            notify_mac("PigeonBrief", f"{date_str} - 등록된 사용자 없음")
            return

        print(f"사용자 {len(users)}명 처리 시작")

        # 4. 사용자별 파이프라인 실행
        total_saved = 0
        for user in users:
            total_saved += process_user(user, settings)

        # 완료
        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        print(f"\n{'='*50}")
        print(f"완료: 총 {total_saved}개 저장, {elapsed:.0f}초 소요")
        notify_mac("PigeonBrief", f"{date_str} 업데이트 완료 (총 {total_saved}개)")

    except Exception as e:
        import traceback
        print(f"\n[오류] {e}")
        traceback.print_exc()
        notify_mac("PigeonBrief 오류", str(e)[:80])
        sys.exit(1)


if __name__ == '__main__':
    main()
