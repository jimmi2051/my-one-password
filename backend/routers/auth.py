import secrets
import base64
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from database import get_db
from models import UserProfile
from schemas import UnlockRequest, ChangePasswordRequest
from auth.google_oauth import get_auth_url, exchange_code, verify_id_token
from auth.session import create_token, verify_token
from auth.keychain import store_key, get_key, delete_key
from crypto import generate_vault_key, derive_key, encrypt_key, decrypt_key
from vault_store import vault_store
from dependencies import get_current_user, get_jti, get_vault_key
from jose import JWTError

router = APIRouter()

# Simple CSRF state store
_oauth_states: dict[str, bool] = {}

# In-memory rate limiter for /auth/unlock: {ip: [timestamp, ...]}
_unlock_attempts: dict[str, list[float]] = defaultdict(list)

def _check_rate_limit(ip: str) -> None:
    now = time.time()
    minute_window = [t for t in _unlock_attempts[ip] if now - t < 60]
    hour_window = [t for t in _unlock_attempts[ip] if now - t < 3600]
    if len(minute_window) >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in 1 minute.")
    if len(hour_window) >= 10:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again in 1 hour.")
    # Record attempt using hour window list (superset)
    hour_window.append(now)
    _unlock_attempts[ip] = hour_window


@router.get("/auth/google")
async def auth_google():
    state = secrets.token_hex(16)
    _oauth_states[state] = True
    return RedirectResponse(url=get_auth_url(state))


@router.get("/auth/callback")
async def auth_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    del _oauth_states[state]

    try:
        tokens = exchange_code(code)
        claims = verify_id_token(tokens["id_token"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {str(e)}")

    google_sub = claims["sub"]
    email = claims.get("email", "")

    user = db.query(UserProfile).filter(UserProfile.google_sub == google_sub).first()
    if not user:
        vault_key = generate_vault_key()
        salt = secrets.token_bytes(16)
        # Temporary derived key (empty password) — user must set master password
        derived_key = derive_key("", salt)
        vault_key_enc = encrypt_key(vault_key, derived_key)
        user = UserProfile(
            google_sub=google_sub,
            email=email,
            vault_key_enc=vault_key_enc,
            argon2_salt=base64.b64encode(salt).decode(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token, jti = create_token(google_sub, email)
    from config import FRONTEND_URL
    _secure = FRONTEND_URL.startswith("https://")
    redirect = RedirectResponse(url=f"{FRONTEND_URL}/unlock", status_code=302)
    redirect.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=_secure,
        path="/",
        max_age=86400,
    )
    return redirect


@router.post("/auth/unlock")
async def unlock(
    request: Request,
    body: UnlockRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    session_token = request.cookies.get("session_token")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = verify_token(session_token)
        google_sub = payload["sub"]
        email = payload.get("email", "")
        jti = payload["jti"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid session")

    user = db.query(UserProfile).filter(UserProfile.google_sub == google_sub).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    vault_key = None

    # Try Keychain first (Touch ID), then fall back to master password
    keychain_hex = get_key(email)
    if keychain_hex:
        try:
            vault_key = bytearray.fromhex(keychain_hex)
        except Exception:
            vault_key = None

    if vault_key is None and body.master_password is not None:
        try:
            salt = base64.b64decode(user.argon2_salt)
            derived_key = derive_key(body.master_password, salt)
            vault_key = decrypt_key(user.vault_key_enc, derived_key)
            # Cache in Keychain for future Touch ID access
            store_key(email, vault_key.hex())
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid master password")

    if vault_key is None:
        raise HTTPException(status_code=401, detail="Provide master_password to unlock")

    vault_store.store(jti, vault_key, email)
    return {"message": "Vault unlocked", "email": email}


@router.post("/auth/setup-master-password")
async def setup_master_password(
    body: UnlockRequest,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
):
    """Set master password for new account (after first Google OAuth login)."""
    if not body.master_password:
        raise HTTPException(status_code=400, detail="master_password required")

    # Decrypt vault key with old derived key (empty password for new accounts)
    old_salt = base64.b64decode(user.argon2_salt)
    old_derived = derive_key("", old_salt)
    try:
        vault_key = decrypt_key(user.vault_key_enc, old_derived)
    except Exception:
        # Already has a real password — get from session store
        vault_key = vault_store.get(jti)
        if vault_key is None:
            raise HTTPException(status_code=401, detail="Cannot decrypt vault")

    new_salt = secrets.token_bytes(16)
    new_derived = derive_key(body.master_password, new_salt)
    new_vault_key_enc = encrypt_key(vault_key, new_derived)

    user.vault_key_enc = new_vault_key_enc
    user.argon2_salt = base64.b64encode(new_salt).decode()
    db.commit()

    vault_store.store(jti, vault_key, user.email)
    store_key(user.email, vault_key.hex())

    return {"message": "Master password set"}


@router.post("/auth/change-password")
async def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
    vault_key: bytearray = Depends(get_vault_key),
):
    old_salt = base64.b64decode(user.argon2_salt)
    old_derived = derive_key(body.old_password, old_salt)
    try:
        decrypt_key(user.vault_key_enc, old_derived)  # verify old password
    except Exception:
        raise HTTPException(status_code=401, detail="Current password incorrect")

    new_salt = secrets.token_bytes(16)
    new_derived = derive_key(body.new_password, new_salt)
    new_vault_key_enc = encrypt_key(vault_key, new_derived)

    user.vault_key_enc = new_vault_key_enc
    user.argon2_salt = base64.b64encode(new_salt).decode()
    db.commit()
    store_key(user.email, vault_key.hex())

    return {"message": "Password changed"}


@router.post("/auth/logout")
async def logout(response: Response, jti: str = Depends(get_jti)):
    vault_store.revoke(jti)
    response.delete_cookie("session_token")
    return {"message": "Logged out"}


@router.get("/auth/me")
async def me(
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
):
    return {
        "email": user.email,
        "unlocked": vault_store.get(jti) is not None,
    }
