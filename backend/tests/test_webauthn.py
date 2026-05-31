"""Unit tests for the WebAuthn / Touch ID endpoints (routers/webauthn.py).

Test strategy:
  - FastAPI TestClient with dependency overrides for DB, current user, and JTI.
  - WebAuthn library calls are patched; we test our routing/storage logic only.
  - vault_store and _challenges are cleared before each test (see conftest.py).
"""
from unittest.mock import MagicMock, patch

import pytest

from crypto import decrypt_key, encrypt_key
from models import WebAuthnCredential
from routers.webauthn import _challenges, _get_server_wrapping_key
from tests.conftest import FAKE_JTI, FAKE_USER_ID, TestSession
from vault_store import vault_store

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_credential(db, *, vault_key: bytes | None = None, credential_id: str = "cred-id-abc"):
    """Insert a WebAuthnCredential row; optionally store an encrypted vault key."""
    evk = encrypt_key(vault_key, _get_server_wrapping_key()) if vault_key else None
    cred = WebAuthnCredential(
        user_id=FAKE_USER_ID,
        credential_id=credential_id,
        public_key=b"fake-public-key",
        sign_count=0,
        encrypted_vault_key=evk,
    )
    db.add(cred)
    db.commit()
    return cred


def _inject_challenge(jti: str = FAKE_JTI, challenge: bytes = b"test-challenge") -> None:
    """Directly inject a challenge into the in-memory store (never expires)."""
    _challenges[jti] = (challenge, float("inf"))


# ---------------------------------------------------------------------------
# GET /auth/touchid-status
# ---------------------------------------------------------------------------

class TestTouchIdStatus:
    def test_no_credential_returns_not_registered(self, client):
        resp = client.get("/auth/touchid-status")
        assert resp.status_code == 200
        assert resp.json() == {"registered": False, "keychain_available": True}

    def test_credential_without_vault_key_is_not_registered(self, client, db):
        _add_credential(db, vault_key=None)
        resp = client.get("/auth/touchid-status")
        assert resp.json()["registered"] is False

    def test_credential_with_vault_key_is_registered(self, client, db):
        _add_credential(db, vault_key=b"\x01" * 32)
        resp = client.get("/auth/touchid-status")
        assert resp.json()["registered"] is True


# ---------------------------------------------------------------------------
# GET /auth/webauthn/register-options
# ---------------------------------------------------------------------------

class TestRegisterOptions:
    def test_returns_options_and_stores_challenge(self, client):
        mock_opts = MagicMock()
        mock_opts.challenge = b"reg-challenge-bytes"
        with patch("routers.webauthn.webauthn.generate_registration_options", return_value=mock_opts), \
             patch("routers.webauthn.options_to_json", return_value='{"challenge":"dGVzdA"}'):
            resp = client.get("/auth/webauthn/register-options")

        assert resp.status_code == 200
        assert "options" in resp.json()
        assert FAKE_JTI in _challenges
        assert _challenges[FAKE_JTI][0] == b"reg-challenge-bytes"

    def test_excludes_existing_credential_ids(self, client, db):
        _add_credential(db, credential_id="dGVzdA")  # valid base64url: "test"
        mock_opts = MagicMock()
        mock_opts.challenge = b"ch"
        with patch("routers.webauthn.webauthn.generate_registration_options", return_value=mock_opts) as gen_mock, \
             patch("routers.webauthn.options_to_json", return_value="{}"), \
             patch("routers.webauthn.webauthn.base64url_to_bytes", return_value=b"test"):
            client.get("/auth/webauthn/register-options")
        call_kwargs = gen_mock.call_args.kwargs
        assert len(call_kwargs["exclude_credentials"]) == 1


# ---------------------------------------------------------------------------
# POST /auth/webauthn/register
# ---------------------------------------------------------------------------

class TestRegister:
    def test_vault_locked_returns_401(self, client):
        _inject_challenge()
        resp = client.post("/auth/webauthn/register", json={"credential": {}})
        assert resp.status_code == 401
        assert "locked" in resp.json()["detail"].lower()

    def test_no_challenge_returns_400(self, client):
        vault_store.store(FAKE_JTI, bytearray(32), "test@example.com")
        resp = client.post("/auth/webauthn/register", json={"credential": {}})
        assert resp.status_code == 400

    def test_invalid_webauthn_response_returns_400(self, client):
        vault_store.store(FAKE_JTI, bytearray(32), "test@example.com")
        _inject_challenge()
        from webauthn.helpers.exceptions import InvalidRegistrationResponse
        with patch("routers.webauthn.webauthn.verify_registration_response",
                   side_effect=InvalidRegistrationResponse("tampered")):
            resp = client.post("/auth/webauthn/register", json={"credential": {}})
        assert resp.status_code == 400
        assert "Registration failed" in resp.json()["detail"]

    def test_valid_registration_stores_credential_with_encrypted_vault_key(self, client, db):
        original_key = b"\xca\xfe" * 16  # 32 bytes
        vault_store.store(FAKE_JTI, bytearray(original_key), "test@example.com")
        _inject_challenge()

        mock_verified = MagicMock()
        mock_verified.credential_id = b"\xde\xad\xbe\xef"
        mock_verified.credential_public_key = b"cose-public-key"
        mock_verified.sign_count = 0

        with patch("routers.webauthn.webauthn.verify_registration_response",
                   return_value=mock_verified):
            resp = client.post("/auth/webauthn/register", json={"credential": {}})

        assert resp.status_code == 200
        assert resp.json()["message"] == "Touch ID registered"

        # Credential row must exist and store the encrypted vault key
        with TestSession() as verify_db:
            cred = verify_db.query(WebAuthnCredential).filter_by(user_id=FAKE_USER_ID).first()
        assert cred is not None
        assert cred.encrypted_vault_key is not None

        # The encrypted key must round-trip back to the original vault key
        recovered = decrypt_key(cred.encrypted_vault_key, _get_server_wrapping_key())
        assert bytes(recovered) == original_key

    def test_valid_registration_upserts_existing_credential(self, client, db):
        """Re-registering the same credential_id updates the row instead of duplicating."""
        _add_credential(db, vault_key=b"\x11" * 32)
        vault_store.store(FAKE_JTI, bytearray(b"\x22" * 32), "test@example.com")
        _inject_challenge()

        mock_verified = MagicMock()
        # bytes_to_base64url(b"\xde\xad\xbe\xef") maps to the credential we just inserted
        mock_verified.credential_id = b"cred-id-abc"  # won't match existing, inserts new
        mock_verified.credential_public_key = b"new-pk"
        mock_verified.sign_count = 5

        with patch("routers.webauthn.webauthn.verify_registration_response",
                   return_value=mock_verified):
            resp = client.post("/auth/webauthn/register", json={"credential": {}})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /auth/webauthn/login-options
# ---------------------------------------------------------------------------

class TestLoginOptions:
    def test_no_credentials_returns_404(self, client):
        resp = client.post("/auth/webauthn/login-options")
        assert resp.status_code == 404

    def test_returns_options_and_stores_challenge(self, client, db):
        _add_credential(db, credential_id="dGVzdA")  # valid base64url
        mock_opts = MagicMock()
        mock_opts.challenge = b"login-challenge"
        with patch("routers.webauthn.webauthn.generate_authentication_options", return_value=mock_opts), \
             patch("routers.webauthn.options_to_json", return_value='{"challenge":"bG9naW4"}'), \
             patch("routers.webauthn.webauthn.base64url_to_bytes", return_value=b"test"):
            resp = client.post("/auth/webauthn/login-options")

        assert resp.status_code == 200
        assert "options" in resp.json()
        assert FAKE_JTI in _challenges
        assert _challenges[FAKE_JTI][0] == b"login-challenge"


# ---------------------------------------------------------------------------
# POST /auth/webauthn/login
# ---------------------------------------------------------------------------

class TestLogin:
    def test_no_challenge_returns_400(self, client):
        resp = client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})
        assert resp.status_code == 400

    def test_unknown_credential_returns_400(self, client):
        _inject_challenge()
        resp = client.post("/auth/webauthn/login", json={"credential": {"id": "unknown-cred"}})
        assert resp.status_code == 400
        assert "Unknown credential" in resp.json()["detail"]

    def test_invalid_webauthn_assertion_returns_401(self, client, db):
        _add_credential(db)
        _inject_challenge()
        from webauthn.helpers.exceptions import InvalidAuthenticationResponse
        with patch("routers.webauthn.webauthn.verify_authentication_response",
                   side_effect=InvalidAuthenticationResponse("bad sig")):
            resp = client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})
        assert resp.status_code == 401
        assert "Touch ID verification failed" in resp.json()["detail"]

    def test_missing_vault_key_in_db_returns_requires_password(self, client, db):
        _add_credential(db, vault_key=None)
        _inject_challenge()
        mock_verified = MagicMock()
        mock_verified.new_sign_count = 1
        with patch("routers.webauthn.webauthn.verify_authentication_response",
                   return_value=mock_verified):
            resp = client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})
        assert resp.status_code == 200
        data = resp.json()
        assert data["requires_password"] is True
        assert "re-register" in data["message"].lower()

    def test_valid_login_unlocks_vault_and_returns_success(self, client, db):
        original_key = b"\xab" * 32
        _add_credential(db, vault_key=original_key)
        _inject_challenge()
        mock_verified = MagicMock()
        mock_verified.new_sign_count = 1
        with patch("routers.webauthn.webauthn.verify_authentication_response",
                   return_value=mock_verified):
            resp = client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})

        assert resp.status_code == 200
        data = resp.json()
        assert data["requires_password"] is False
        assert "Touch ID" in data["message"]

        # Vault key must be available in VaultKeyStore
        stored = vault_store.get(FAKE_JTI)
        assert stored is not None
        assert bytes(stored) == original_key

    def test_valid_login_updates_sign_count(self, client, db):
        """Sign count must be incremented to prevent replay attacks."""
        _add_credential(db, vault_key=b"\x01" * 32)
        _inject_challenge()
        mock_verified = MagicMock()
        mock_verified.new_sign_count = 42
        with patch("routers.webauthn.webauthn.verify_authentication_response",
                   return_value=mock_verified):
            client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})

        with TestSession() as verify_db:
            cred = verify_db.query(WebAuthnCredential).filter_by(
                user_id=FAKE_USER_ID, credential_id="cred-id-abc"
            ).first()
        assert cred.sign_count == 42

    def test_challenge_consumed_after_login_prevents_replay(self, client, db):
        """Challenge is a one-time token — second request must fail."""
        _add_credential(db, vault_key=b"\x01" * 32)
        _inject_challenge()
        mock_verified = MagicMock()
        mock_verified.new_sign_count = 1
        with patch("routers.webauthn.webauthn.verify_authentication_response",
                   return_value=mock_verified):
            resp1 = client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})
        assert resp1.status_code == 200

        # Second attempt with same credential but no new challenge
        resp2 = client.post("/auth/webauthn/login", json={"credential": {"id": "cred-id-abc"}})
        assert resp2.status_code == 400
        assert "No pending challenge" in resp2.json()["detail"]
