from fastapi import Depends, HTTPException, Cookie, Header
from typing import Optional
from jose import JWTError
from sqlalchemy.orm import Session
from database import get_db
from models import UserProfile
from auth.session import verify_token
from vault_store import vault_store


def _get_session_token(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
) -> str:
    if session_token:
        return session_token
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if token:
            return token
    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(
    session_token: str = Depends(_get_session_token),
    db: Session = Depends(get_db),
) -> UserProfile:
    try:
        payload = verify_token(session_token)
        google_sub = payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid session token")
    user = db.query(UserProfile).filter(UserProfile.google_sub == google_sub).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_jti(session_token: str = Depends(_get_session_token)) -> str:
    try:
        payload = verify_token(session_token)
        return payload["jti"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid session token")

def get_vault_key(jti: str = Depends(get_jti)) -> bytearray:
    """Get vault key from session store. 401 if not unlocked or expired."""
    key = vault_store.get(jti)
    if key is None:
        raise HTTPException(status_code=401, detail="Vault locked. Please unlock first.")
    return key
