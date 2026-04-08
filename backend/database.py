"""
SQLite DB 초기화 및 연결 관리
"""
import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'pigeonbrief.db')


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                email       TEXT NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sections (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT NOT NULL,
                name        TEXT NOT NULL,
                description TEXT DEFAULT '',
                enabled     INTEGER DEFAULT 1,
                sort_order  INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS rss_sources (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                section_id  INTEGER NOT NULL,
                url         TEXT NOT NULL,
                name        TEXT NOT NULL,
                enabled     INTEGER DEFAULT 1,
                FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS keywords (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                section_id  INTEGER NOT NULL,
                query       TEXT NOT NULL,
                enabled     INTEGER DEFAULT 1,
                FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS articles (
                id           TEXT NOT NULL,
                user_id      TEXT NOT NULL,
                section_id   INTEGER,
                title        TEXT NOT NULL,
                url          TEXT NOT NULL,
                source_name  TEXT,
                summary_ko   TEXT,
                published_at TIMESTAMP,
                collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id, user_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS seen_urls (
                url         TEXT NOT NULL,
                user_id     TEXT NOT NULL,
                seen_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (url, user_id)
            );
        """)
    print(f"[DB] 초기화 완료: {DB_PATH}")


# ─────────────────────────────────────────
# 파이프라인 전용 헬퍼
# ─────────────────────────────────────────

def get_all_users() -> list:
    """파이프라인용: 전체 사용자 목록 반환"""
    with get_conn() as conn:
        rows = conn.execute("SELECT id, email FROM users").fetchall()
    return [dict(r) for r in rows]


def get_user_sections_config(user_id: str) -> dict:
    """
    파이프라인용: 사용자별 섹션 설정을 pipeline 호환 dict 형태로 반환
    Returns: {section_id(int): section_config_dict}
    """
    with get_conn() as conn:
        sections = conn.execute("""
            SELECT id, name, description FROM sections
            WHERE user_id = ? AND enabled = 1
            ORDER BY sort_order, id
        """, (user_id,)).fetchall()

        result = {}
        for sec in sections:
            sec_id = sec['id']
            rss_rows = conn.execute("""
                SELECT name, url FROM rss_sources
                WHERE section_id = ? AND enabled = 1
            """, (sec_id,)).fetchall()
            kw_rows = conn.execute("""
                SELECT query FROM keywords
                WHERE section_id = ? AND enabled = 1
            """, (sec_id,)).fetchall()

            result[sec_id] = {
                'id': sec_id,
                'name': sec['name'],
                'description': sec['description'] or '',
                'channel2_rss': {
                    'sources': [{'name': r['name'], 'url': r['url']} for r in rss_rows]
                },
                'channel3_keywords': {
                    'queries': [r['query'] for r in kw_rows]
                },
            }
    return result


def filter_seen_urls(articles: list, user_id: str) -> list:
    """파이프라인용: seen_urls에 이미 있는 기사 제거 (사용자별)"""
    if not articles:
        return []
    urls = [a['url'] for a in articles]
    placeholders = ','.join('?' * len(urls))
    with get_conn() as conn:
        seen = {row[0] for row in conn.execute(
            f"SELECT url FROM seen_urls WHERE user_id = ? AND url IN ({placeholders})",
            [user_id] + urls
        )}
    return [a for a in articles if a['url'] not in seen]


def mark_urls_seen(articles: list, user_id: str) -> None:
    """파이프라인용: 처리 완료된 기사 URL을 seen_urls에 기록"""
    if not articles:
        return
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO seen_urls (url, user_id, seen_at) VALUES (?, ?, ?)",
            [(a['url'], user_id, now) for a in articles]
        )


def save_articles_to_db(articles: list, user_id: str) -> int:
    """파이프라인용: LLM 처리 완료된 기사를 articles 테이블에 저장, 저장 건수 반환"""
    if not articles:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    saved = 0
    with get_conn() as conn:
        for a in articles:
            conn.execute("""
                INSERT OR REPLACE INTO articles
                    (id, user_id, section_id, title, url, source_name, summary_ko, published_at, collected_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                a['id'],
                user_id,
                a.get('section'),
                a.get('title', ''),
                a.get('url', ''),
                a.get('source_name', ''),
                a.get('summary_ko', ''),
                a.get('published_at') or None,
                a.get('collected_at') or now,
            ))
            saved += 1
    return saved
