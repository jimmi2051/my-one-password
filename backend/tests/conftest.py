"""Shared fixtures for all tests.

Sets required environment variables BEFORE any app module is imported,
so config.py does not raise RuntimeError about JWT_SECRET.
"""
import os

# Must be set before importing anything from the app
os.environ.setdefault("JWT_SECRET", "a" * 64)
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from dependencies import get_current_user, get_jti
from models import UserProfile
from routers.webauthn import router, _challenges
from vault_store import vault_store

# Single in-memory SQLite DB shared across all sessions via StaticPool
TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)

FAKE_USER_ID = "user-1"
FAKE_JTI = "test-jti-001"
FAKE_USER = UserProfile(
    id=FAKE_USER_ID,
    google_sub="sub-1",
    email="test@example.com",
    vault_key_enc="enc",
    argon2_salt="salt",
)


def _override_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def reset_state():
    """Recreate schema and wipe in-memory singletons between tests."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    _challenges.clear()
    vault_store._store.clear()
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_jti] = lambda: FAKE_JTI
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()
