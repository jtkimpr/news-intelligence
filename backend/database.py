"""
SQLite DB 초기화 및 연결 관리
"""
import sqlite3
import os

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
