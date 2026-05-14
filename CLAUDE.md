# CLAUDE.md — Project Guide for Claude

This is a **macOS-only** personal password manager: FastAPI backend + React/TypeScript frontend + SQLite. Touch ID is supported via the macOS Keychain.

## Security Model — Read This First

The core security guarantee is that **plaintext secrets never touch disk**:

- Vault entry fields (title, username, password, url, notes) are encrypted **individually** with AES-256-GCM before being written to SQLite. The DB contains only ciphertext.
- After `POST /auth/unlock`, a per-session vault key is derived via Argon2id and held exclusively in `VaultKeyStore` — an in-memory singleton keyed by JWT `jti` with a 30-minute sliding TTL.
- When a key is evicted (TTL expiry or logout), `secure_wipe()` is called to zero the memory. Do not skip or remove this call.
- **Never store plaintext passwords or vault keys to disk** under any circumstances.
- Do not change the AES-256-GCM encryption format without a corresponding migration.
- Do not log decrypted field values.

## Bash Environment

Always activate the Python virtual environment before running any backend Python commands:

```bash
cd backend && source venv/bin/activate
```

Then you can run `uvicorn`, `python`, `pip`, etc. The venv is not auto-activated.

## Running the Project

```bash
# Both servers at once
./start.sh

# Backend only (after activating venv)
cd backend && source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Frontend only
cd frontend && npm run dev

# Frontend lint / build
cd frontend && npm run lint
cd frontend && npm run build
```

Backend `.env` is at `backend/.env` (not the repo root).

## Architecture

### Auth & Key Flow
1. User authenticates via Google OAuth → receives an httponly JWT cookie (HS256).
2. User posts their master password to `POST /auth/unlock` → Argon2id derives the vault key → key stored in `VaultKeyStore` under the JWT's `jti` claim.
3. Touch ID path stores/retrieves the vault key via macOS Keychain (`backend/auth/keychain.py`).
4. All subsequent vault requests extract the key via the `get_vault_key()` FastAPI dependency — this is the combined auth + key retrieval gate. Never bypass it.

### Encryption (`backend/crypto.py`)
The functions you'll interact with:
- `encrypt(plaintext, key)` / `decrypt(ciphertext, key)` — AES-256-GCM field encryption
- `derive_key(password, salt)` — Argon2id KDF
- `encrypt_key(vault_key, wrapping_key)` / `decrypt_key(...)` — for Keychain storage
- `secure_wipe(data)` — zeroes sensitive bytes; called on key eviction

### Data Layer
- `backend/models.py` — SQLAlchemy 2.x `Mapped[]` typed models: `UserProfile`, `Category`, `VaultEntry`
- `backend/schemas.py` — Pydantic `*Create` / `*Update` / `*Out` schemas
- `backend/vault_store.py` — `VaultKeyStore` singleton (thread-safe, sliding TTL)
- SQLite search is performed post-decryption in Python (no FTS in DB)

## Key Conventions

### Backend
- **Config always from `config.py`** — never call `os.getenv()` directly inside routers.
- All new routers must be registered in `main.py` via `app.include_router()`.
- Every DB query touching `VaultEntry` or `Category` **must** filter by `user_id`.
- Encrypted fields: encrypt on write; decrypt inside the model's `_serialize()` method before returning to the caller.
- Sensitive endpoints are rate-limited at 5/min and 10/hr per IP.

### Frontend
- All HTTP calls go through `frontend/src/api/client.ts` (Axios, `withCredentials: true`).
- Data fetching uses TanStack Query (`frontend/src/hooks/useVault.ts`); always call `invalidateQueries` after a successful mutation.
- API base is controlled by the `VITE_API_BASE_URL` env var.
- Styling is Tailwind CSS — no separate CSS files.

## Important Files at a Glance

```
backend/
  main.py            # App entrypoint, CORS, rate limiter, lifespan cleanup
  crypto.py          # All cryptographic primitives
  vault_store.py     # In-memory key store (VaultKeyStore)
  dependencies.py    # get_current_user, get_jti, get_vault_key
  models.py          # SQLAlchemy models
  schemas.py         # Pydantic schemas
  config.py          # Centralised config (dotenv)
  auth/
    google_oauth.py  # OAuth2 flow
    session.py       # JWT creation/validation
    keychain.py      # macOS Keychain (Touch ID)
  routers/
    auth.py  entries.py  categories.py  generator.py  vault.py

frontend/src/
  api/client.ts      # Axios instance + typed API methods
  hooks/useVault.ts  # TanStack Query hooks
  pages/             # LoginPage, UnlockPage, VaultPage
```

## Notes
- No test suite exists — be conservative with changes to `crypto.py`, `vault_store.py`, and auth code; prefer small, verifiable steps.
- This is macOS-only; Keychain APIs will not work on Linux/Windows.
