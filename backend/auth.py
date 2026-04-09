"""
Clerk JWT 검증
Authorization: Bearer <token> 헤더에서 사용자 정보 추출
"""
import os
import httpx
from jose import jwt, JWTError
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

security = HTTPBearer()

_jwks_cache: dict = {}


def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    # 호출 시점에 환경변수를 읽어 import 순서 의존성 제거
    jwks_url = os.environ.get("CLERK_JWKS_URL", "")
    if not jwks_url:
        raise RuntimeError(".env에 CLERK_JWKS_URL을 설정하세요")
    resp = httpx.get(jwks_url, timeout=10)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    return _jwks_cache


def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> dict:
    token = credentials.credentials
    try:
        jwks = _get_jwks()
        # 헤더에서 kid 추출
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        # 매칭되는 공개키 찾기
        key = next(
            (k for k in jwks.get("keys", []) if k.get("kid") == kid),
            None
        )
        if not key:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰 키")
        payload = jwt.decode(token, key, algorithms=["RS256"])
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"토큰 검증 실패: {e}")


def get_user_id(payload: dict) -> str:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="사용자 ID 없음")
    return user_id
