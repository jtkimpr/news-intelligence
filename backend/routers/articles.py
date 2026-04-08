"""
기사 조회 API
로그인한 사용자의 기사 목록 반환
"""
from fastapi import APIRouter, Depends, Query
from backend.auth import verify_token, get_user_id
from backend.database import get_conn

router = APIRouter()


@router.get("")
def get_articles(
    section_id: int | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    payload: dict = Depends(verify_token),
):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        if section_id:
            rows = conn.execute("""
                SELECT a.*, s.name as section_name
                FROM articles a
                LEFT JOIN sections s ON a.section_id = s.id
                WHERE a.user_id = ?
                  AND a.section_id = ?
                  AND a.collected_at >= datetime('now', ? || ' days')
                ORDER BY a.collected_at DESC
            """, (user_id, section_id, f"-{days}")).fetchall()
        else:
            rows = conn.execute("""
                SELECT a.*, s.name as section_name
                FROM articles a
                LEFT JOIN sections s ON a.section_id = s.id
                WHERE a.user_id = ?
                  AND a.collected_at >= datetime('now', ? || ' days')
                ORDER BY a.section_id, a.collected_at DESC
            """, (user_id, f"-{days}")).fetchall()

        articles = [dict(r) for r in rows]

    # 섹션별로 그룹화
    sections: dict = {}
    for a in articles:
        sid = a.get("section_id")
        sname = a.get("section_name", "기타")
        if sid not in sections:
            sections[sid] = {"id": sid, "name": sname, "articles": []}
        sections[sid]["articles"].append(a)

    return {
        "total": len(articles),
        "sections": list(sections.values()),
    }
