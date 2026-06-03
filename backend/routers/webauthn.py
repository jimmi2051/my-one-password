"""WebAuthn endpoints for Touch ID registration and vault unlock."""
import hashlib
import json
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import webauthn
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    AuthenticatorAttachment,
    ResidentKeyRequirement,
    PublicKeyCredentialDescriptor,
)
from webauthn.helpers.exceptions import InvalidRegistrationResponse, InvalidAuthenticationResponse
from webauthn import options_to_json
from webauthn.helpers import bytes_to_base64url

from database import get_db
from models import UserProfile, WebAuthnCredential
from schemas import (
    TouchIdStatusOut,
    WebAuthnRegisterOptionsOut,
    WebAuthnRegisterRequest,
    WebAuthnLoginOptionsOut,
    WebAuthnLoginRequest,
    WebAuthnLoginOut,
)
from dependencies import get_current_user, get_jti
from vault_store import vault_store
from crypto import encrypt_key, decrypt_key
from config import WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, WEBAUTHN_ORIGINS, JWT_SECRET

router = APIRouter()

# In-memory challenge store: jti → (challenge_bytes, expires_at)
_CHALLENGE_TTL = 300  # 5 minutes
_challenges: dict[str, tuple[bytes, float]] = {}


def _get_server_wrapping_key() -> bytes:
    """Derive a 32-byte AES key from JWT_SECRET for wrapping vault keys stored in DB."""
    return hashlib.sha256(JWT_SECRET.encode() + b":webauthn-vault-wrap").digest()


def _store_challenge(jti: str, challenge: bytes) -> None:
    _prune_challenges()
    _challenges[jti] = (challenge, time.time() + _CHALLENGE_TTL)


def _pop_challenge(jti: str) -> bytes:
    entry = _challenges.pop(jti, None)
    if entry is None:
        raise HTTPException(status_code=400, detail="No pending challenge — request new options first")
    challenge, expires_at = entry
    if time.time() > expires_at:
        raise HTTPException(status_code=400, detail="Challenge expired — request new options")
    return challenge


def _prune_challenges() -> None:
    now = time.time()
    expired = [k for k, (_, exp) in _challenges.items() if now > exp]
    for k in expired:
        del _challenges[k]


@router.get("/auth/touchid-status", response_model=TouchIdStatusOut)
async def touchid_status(
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
):
    """Return whether Touch ID credential is registered and vault key is stored."""
    credential = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.user_id == user.id)
        .first()
    )
    registered = credential is not None and credential.encrypted_vault_key is not None
    return TouchIdStatusOut(registered=registered, keychain_available=True)


@router.get("/auth/webauthn/register-options", response_model=WebAuthnRegisterOptionsOut)
async def register_options(
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
):
    """Return PublicKeyCredentialCreationOptions to begin Touch ID registration."""
    existing = db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == user.id).all()
    exclude = [
        PublicKeyCredentialDescriptor(id=webauthn.base64url_to_bytes(c.credential_id))
        for c in existing
    ]

    opts = webauthn.generate_registration_options(
        rp_id=WEBAUTHN_RP_ID,
        rp_name=WEBAUTHN_RP_NAME,
        user_name=user.email,
        user_display_name=user.email,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=exclude,
    )
    _store_challenge(jti, opts.challenge)
    return WebAuthnRegisterOptionsOut(options=json.loads(options_to_json(opts)))


@router.post("/auth/webauthn/register")
async def register(
    body: WebAuthnRegisterRequest,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
):
    """Verify the registration response, store the credential and encrypted vault key."""
    # Vault must be unlocked so we can capture the vault key
    vault_key = vault_store.get(jti)
    if vault_key is None:
        raise HTTPException(
            status_code=401,
            detail="Vault is locked — unlock with master password first",
        )

    challenge = _pop_challenge(jti)
    last_error = None
    for origin in WEBAUTHN_ORIGINS:
        try:
            verified = webauthn.verify_registration_response(
                credential=body.credential,
                expected_challenge=challenge,
                expected_rp_id=WEBAUTHN_RP_ID,
                expected_origin=origin,
                require_user_verification=True,
            )
            last_error = None
            break
        except InvalidRegistrationResponse as e:
            last_error = e
    if last_error is not None:
        raise HTTPException(status_code=400, detail=f"Registration failed: {last_error}")

    credential_id_b64 = bytes_to_base64url(verified.credential_id)
    encrypted_vault_key = encrypt_key(bytes(vault_key), _get_server_wrapping_key())

    # Upsert: update if same credential already exists, otherwise insert
    existing = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.credential_id == credential_id_b64)
        .first()
    )
    if existing:
        existing.public_key = verified.credential_public_key
        existing.sign_count = verified.sign_count
        existing.encrypted_vault_key = encrypted_vault_key
    else:
        db.add(WebAuthnCredential(
            user_id=user.id,
            credential_id=credential_id_b64,
            public_key=verified.credential_public_key,
            sign_count=verified.sign_count,
            encrypted_vault_key=encrypted_vault_key,
        ))
    db.commit()
    return {"message": "Touch ID registered"}


@router.post("/auth/webauthn/login-options", response_model=WebAuthnLoginOptionsOut)
async def login_options(
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
):
    """Return PublicKeyCredentialRequestOptions to begin Touch ID authentication."""
    credentials = db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == user.id).all()
    if not credentials:
        raise HTTPException(status_code=404, detail="No Touch ID credential registered")

    allow = [
        PublicKeyCredentialDescriptor(id=webauthn.base64url_to_bytes(c.credential_id))
        for c in credentials
    ]
    opts = webauthn.generate_authentication_options(
        rp_id=WEBAUTHN_RP_ID,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    _store_challenge(jti, opts.challenge)
    return WebAuthnLoginOptionsOut(options=json.loads(options_to_json(opts)))


@router.post("/auth/webauthn/login", response_model=WebAuthnLoginOut)
async def login(
    body: WebAuthnLoginRequest,
    db: Session = Depends(get_db),
    user: UserProfile = Depends(get_current_user),
    jti: str = Depends(get_jti),
):
    """Verify Touch ID assertion and unlock the vault from DB-stored encrypted vault key."""
    challenge = _pop_challenge(jti)

    credential_id_b64 = body.credential.get("id", "")
    cred_row = (
        db.query(WebAuthnCredential)
        .filter(
            WebAuthnCredential.user_id == user.id,
            WebAuthnCredential.credential_id == credential_id_b64,
        )
        .first()
    )
    if not cred_row:
        raise HTTPException(status_code=400, detail="Unknown credential")

    try:
        last_error = None
        for origin in WEBAUTHN_ORIGINS:
            try:
                verified = webauthn.verify_authentication_response(
                    credential=body.credential,
                    expected_challenge=challenge,
                    expected_rp_id=WEBAUTHN_RP_ID,
                    expected_origin=origin,
                    credential_public_key=cred_row.public_key,
                    credential_current_sign_count=cred_row.sign_count,
                    require_user_verification=True,
                )
                last_error = None
                break
            except InvalidAuthenticationResponse as e:
                last_error = e
        if last_error is not None:
            raise last_error
    except InvalidAuthenticationResponse as e:
        raise HTTPException(status_code=401, detail=f"Touch ID verification failed: {e}")

    # Update sign count to prevent replay attacks
    cred_row.sign_count = verified.new_sign_count
    db.commit()

    # Retrieve and decrypt vault key from DB
    if not cred_row.encrypted_vault_key:
        return WebAuthnLoginOut(
            message="Touch ID verified but vault key not stored — please re-register Touch ID",
            email=user.email,
            requires_password=True,
        )

    try:
        vault_key = decrypt_key(cred_row.encrypted_vault_key, _get_server_wrapping_key())
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt stored vault key")

    vault_store.store(jti, vault_key, user.email)
    return WebAuthnLoginOut(message="Vault unlocked via Touch ID", email=user.email)
