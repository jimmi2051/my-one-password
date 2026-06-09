"""Regression tests for mobile-compatible session handling."""
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import pytest

from auth.session import create_token
from database import Base, get_db
from dependencies import get_current_user, get_jti
from models import UserProfile
from routers.auth import router as auth_router, _oauth_states


ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=ENGINE)


def _override_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _build_dependency_client() -> TestClient:
    app = FastAPI()

    @app.get("/whoami")
    def whoami(user: UserProfile = Depends(get_current_user), jti: str = Depends(get_jti)):
        return {"email": user.email, "jti": jti}

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def _seed_user(google_sub: str = "sub-mobile", email: str = "mobile@example.com") -> UserProfile:
    with SessionLocal() as db:
        user = UserProfile(
            google_sub=google_sub,
            email=email,
            vault_key_enc="enc",
            argon2_salt="salt",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.create_all(bind=ENGINE)
    _oauth_states.clear()
    yield
    Base.metadata.drop_all(bind=ENGINE)
    _oauth_states.clear()


class TestBearerSessionDependencies:
    def test_current_user_accepts_cookie_session(self):
        _seed_user()
        token, expected_jti = create_token("sub-mobile", "mobile@example.com")

        client = _build_dependency_client()
        response = client.get("/whoami", cookies={"session_token": token})

        assert response.status_code == 200
        assert response.json() == {"email": "mobile@example.com", "jti": expected_jti}

    def test_current_user_accepts_authorization_bearer_session(self):
        _seed_user()
        token, expected_jti = create_token("sub-mobile", "mobile@example.com")

        client = _build_dependency_client()
        response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 200
        assert response.json() == {"email": "mobile@example.com", "jti": expected_jti}

    def test_malformed_authorization_header_is_rejected(self):
        _seed_user()

        client = _build_dependency_client()
        response = client.get("/whoami", headers={"Authorization": "Token nope"})

        assert response.status_code == 401
        assert response.json()["detail"] == "Not authenticated"


class TestMobileOAuthRedirect:
    def test_google_login_state_tracks_mobile_redirect_uri(self, monkeypatch):
        app = FastAPI()
        app.include_router(auth_router)
        client = TestClient(app, follow_redirects=False)

        monkeypatch.setattr("routers.auth.get_auth_url", lambda state: f"https://accounts.example.test?state={state}")

        response = client.get("/auth/google?mobile_redirect_uri=myonepassword://auth/callback")

        assert response.status_code == 307
        location = response.headers["location"]
        state = location.rsplit("=", 1)[-1]
        assert _oauth_states[state] == "myonepassword://auth/callback"

    def test_callback_redirects_mobile_clients_with_token(self, monkeypatch):
        app = FastAPI()
        app.include_router(auth_router)
        app.dependency_overrides[get_db] = _override_db
        client = TestClient(app, follow_redirects=False)
        _oauth_states["state-mobile"] = "myonepassword://auth/callback"

        monkeypatch.setattr("routers.auth.exchange_code", lambda code: {"id_token": "id-token"})
        monkeypatch.setattr(
            "routers.auth.verify_id_token",
            lambda token: {"sub": "sub-mobile", "email": "mobile@example.com"},
        )

        response = client.get("/auth/callback?code=abc&state=state-mobile")

        assert response.status_code == 302
        location = response.headers["location"]
        assert location.startswith("myonepassword://auth/callback?")
        assert "token=" in location
        assert "email=mobile%40example.com" in location
        assert "session_token" not in response.headers.get("set-cookie", "")
