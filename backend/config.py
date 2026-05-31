import os
from dotenv import load_dotenv

load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback")
_JWT_SECRET = os.getenv("JWT_SECRET", "")
_KNOWN_WEAK_DEFAULT = "change-me-in-production-use-secrets-token-hex-32"
if not _JWT_SECRET or _JWT_SECRET == _KNOWN_WEAK_DEFAULT:
    raise RuntimeError(
        "JWT_SECRET is not set or is the default placeholder.\n"
        "Generate one with: python3 -c \"import secrets; print(secrets.token_hex(32))\"\n"
        "Then set it in backend/.env"
    )
JWT_SECRET = _JWT_SECRET
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24
DB_PATH = os.getenv("DB_PATH", "./vault.db")
PORT = int(os.getenv("PORT", "8008"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# WebAuthn / Touch ID
_frontend_host = FRONTEND_URL.split("://", 1)[-1].split(":")[0]  # e.g. "localhost"
WEBAUTHN_RP_ID: str = os.getenv("WEBAUTHN_RP_ID", _frontend_host)
WEBAUTHN_RP_NAME: str = os.getenv("WEBAUTHN_RP_NAME", "One Password")
WEBAUTHN_ORIGIN: str = os.getenv("WEBAUTHN_ORIGIN", FRONTEND_URL)

# Argon2id parameters (OWASP recommended minimums)
ARGON2_TIME_COST = 3
ARGON2_MEMORY_COST = 65536  # 64 MB
ARGON2_PARALLELISM = 4
ARGON2_HASH_LEN = 32

# Vault key TTL in seconds (30 minutes sliding window)
VAULT_KEY_TTL = 1800
