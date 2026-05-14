# Copilot Instructions

## Project Overview

A local password manager — FastAPI (Python) backend + React/TypeScript frontend + SQLite. All sensitive vault fields are encrypted at rest with AES-256-GCM; the vault key never touches disk (only macOS Keychain and in-memory store).

## Dev Commands

### Start everything
```bash
./start.sh                        # launches backend (port 8000) + frontend (port 5173)
```

### Backend (from `backend/`)
```bash
source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend (from `frontend/`)
```bash
npm run dev          # dev server
npm run build        # tsc + vite build
npm run lint         # eslint
```

No test suite currently exists.

## Architecture

### Auth + Vault Key Lifecycle
The most important thing to understand: the vault key is **never stored on disk in plaintext**.

```
Google OAuth → JWT session cookie (httponly) → /auth/unlock
  → Argon2id(master_password, salt) derives wrapping key
  → decrypt vault_key_enc (AES-GCM stored in SQLite)
  → vault key held in VaultKeyStore (in-memory, 30-min sliding TTL, keyed by JWT jti)
  → also cached in macOS Keychain for Touch ID on subsequent logins
```

`vault_store.py` holds the singleton `VaultKeyStore`. Every request that needs the vault key calls `get_vault_key()` (in `dependencies.py`), which looks up by `jti` from the JWT. If expired or missing → 401 "Vault locked".

### Encryption
All entry fields (`title`, `username`, `password`, `url`, `notes`) are encrypted individually before DB write. The format stored in SQLite is `base64(12-byte nonce + AES-GCM ciphertext)`. All encrypt/decrypt goes through `crypto.py`.

### Backend Structure
```
backend/
  main.py          # FastAPI app wiring: CORS, rate limiter, routers, background cleanup
  config.py        # All config from env vars (load_dotenv)
  crypto.py        # encrypt(), decrypt(), derive_key(), encrypt_key(), decrypt_key()
  vault_store.py   # VaultKeyStore singleton — in-memory key store with sliding TTL
  dependencies.py  # get_current_user(), get_jti(), get_vault_key() — FastAPI Depends
  models.py        # SQLAlchemy 2.x Mapped[] typed models
  schemas.py       # Pydantic request/response schemas
  database.py      # SQLite engine + init_db()
  auth/            # google_oauth.py, session.py (JWT), keychain.py (macOS keyring)
  routers/         # auth.py, entries.py, categories.py, generator.py, vault.py
```

API routing: auth endpoints at `/auth/*`, all data endpoints at `/api/*`.

### Frontend Structure
```
frontend/src/
  api/client.ts    # Axios instance (withCredentials: true) + all typed API functions
  hooks/           # useVault.ts (TanStack Query hooks), useClipboard.ts
  pages/           # LoginPage, UnlockPage, VaultPage
  components/      # UI components (EntryCard, EntryForm, PasswordGenerator, …)
```

## Key Conventions

### Backend
- **All new routers** must be registered in `main.py` via `app.include_router()`.
- **Encrypted fields**: when adding a new field to `VaultEntry`, always encrypt on write and decrypt on read (see `_serialize()` in `routers/entries.py` as the pattern).
- **Search is post-decryption**: `GET /api/entries?search=` decrypts all entries then filters in Python — avoid adding DB-level text search on encrypted columns.
- **User scoping**: every DB query on `VaultEntry` and `Category` must filter by `user_id`. See `_validate_category()` and all query patterns in `entries.py`.
- **Pydantic schemas**: request bodies have `*Create`/`*Update` schemas; responses use `*Out` schemas. All defined in `schemas.py`.
- **Models** use SQLAlchemy 2.x `Mapped[type]` syntax with `mapped_column()`.
- **Config** is always loaded from environment via `config.py` — never read `os.getenv()` directly in routers.
- **Rate limiting** on sensitive endpoints uses the custom `_check_rate_limit()` pattern in `routers/auth.py` (5/min, 10/hr per IP).
- Backend `.env` lives at `backend/.env`, not at repo root.

### Frontend
- **All API calls** go through `src/api/client.ts`. Never use `fetch` or a separate axios instance.
- **Data fetching/mutation** uses TanStack Query. Add new hooks to `src/hooks/useVault.ts`; always `invalidateQueries` on mutation success.
- **API base URL** is set via `VITE_API_BASE_URL` env var (defaults to `http://localhost:8000`).
- Tailwind CSS for styling; no CSS modules or styled-components.

### Security-sensitive areas
- `crypto.py` — do not change encryption format without migrating existing ciphertext.
- `vault_store.py` — `secure_wipe()` must be called when evicting keys.
- `auth/keychain.py` — in Docker, `PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring` disables Keychain (Touch ID unavailable).
