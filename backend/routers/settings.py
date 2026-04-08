"""
사용자 설정 API
섹션 / RSS 소스 / 키워드 CRUD
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.auth import verify_token, get_user_id
from backend.database import get_conn

router = APIRouter()


# ── 모델 ──────────────────────────────────────────────────────────────────────

class SectionCreate(BaseModel):
    name: str
    description: str = ""

class SectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None

class RssCreate(BaseModel):
    section_id: int
    url: str
    name: str

class KeywordCreate(BaseModel):
    section_id: int
    query: str


# ── 전체 설정 조회 ─────────────────────────────────────────────────────────────

@router.get("")
def get_settings(payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        # 사용자 없으면 자동 등록
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)",
            (user_id, payload.get("email", ""))
        )
        sections = [dict(r) for r in conn.execute(
            "SELECT * FROM sections WHERE user_id = ? ORDER BY sort_order, id",
            (user_id,)
        )]
        for s in sections:
            s["rss_sources"] = [dict(r) for r in conn.execute(
                "SELECT * FROM rss_sources WHERE section_id = ?", (s["id"],)
            )]
            s["keywords"] = [dict(r) for r in conn.execute(
                "SELECT * FROM keywords WHERE section_id = ?", (s["id"],)
            )]
    return {"sections": sections}


# ── 섹션 CRUD ──────────────────────────────────────────────────────────────────

@router.post("/sections")
def create_section(body: SectionCreate, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)",
            (user_id, payload.get("email", ""))
        )
        cur = conn.execute(
            "INSERT INTO sections (user_id, name, description) VALUES (?, ?, ?)",
            (user_id, body.name, body.description)
        )
    return {"id": cur.lastrowid, "name": body.name, "description": body.description}


@router.put("/sections/{section_id}")
def update_section(section_id: int, body: SectionUpdate, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM sections WHERE id = ? AND user_id = ?", (section_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="섹션을 찾을 수 없음")
        if body.name is not None:
            conn.execute("UPDATE sections SET name = ? WHERE id = ?", (body.name, section_id))
        if body.description is not None:
            conn.execute("UPDATE sections SET description = ? WHERE id = ?", (body.description, section_id))
        if body.enabled is not None:
            conn.execute("UPDATE sections SET enabled = ? WHERE id = ?", (int(body.enabled), section_id))
    return {"ok": True}


@router.delete("/sections/{section_id}")
def delete_section(section_id: int, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM sections WHERE id = ? AND user_id = ?", (section_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="섹션을 찾을 수 없음")
        conn.execute("DELETE FROM sections WHERE id = ?", (section_id,))
    return {"ok": True}


# ── RSS 소스 ───────────────────────────────────────────────────────────────────

@router.post("/rss")
def add_rss(body: RssCreate, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM sections WHERE id = ? AND user_id = ?", (body.section_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="섹션을 찾을 수 없음")
        cur = conn.execute(
            "INSERT INTO rss_sources (section_id, url, name) VALUES (?, ?, ?)",
            (body.section_id, body.url, body.name)
        )
    return {"id": cur.lastrowid, "url": body.url, "name": body.name}


@router.delete("/rss/{rss_id}")
def delete_rss(rss_id: int, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        row = conn.execute("""
            SELECT r.id FROM rss_sources r
            JOIN sections s ON r.section_id = s.id
            WHERE r.id = ? AND s.user_id = ?
        """, (rss_id, user_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="RSS 소스를 찾을 수 없음")
        conn.execute("DELETE FROM rss_sources WHERE id = ?", (rss_id,))
    return {"ok": True}


# ── 키워드 ─────────────────────────────────────────────────────────────────────

@router.post("/keywords")
def add_keyword(body: KeywordCreate, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM sections WHERE id = ? AND user_id = ?", (body.section_id, user_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="섹션을 찾을 수 없음")
        cur = conn.execute(
            "INSERT INTO keywords (section_id, query) VALUES (?, ?)",
            (body.section_id, body.query)
        )
    return {"id": cur.lastrowid, "query": body.query}


@router.delete("/keywords/{keyword_id}")
def delete_keyword(keyword_id: int, payload: dict = Depends(verify_token)):
    user_id = get_user_id(payload)
    with get_conn() as conn:
        row = conn.execute("""
            SELECT k.id FROM keywords k
            JOIN sections s ON k.section_id = s.id
            WHERE k.id = ? AND s.user_id = ?
        """, (keyword_id, user_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="키워드를 찾을 수 없음")
        conn.execute("DELETE FROM keywords WHERE id = ?", (keyword_id,))
    return {"ok": True}
