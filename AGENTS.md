# AGENTS.md — AI Agent Guide for my-one-password

> For Codex, Jules, OpenCode, and similar AI coding agents.

## Stack
- **Backend**: FastAPI (Python 3.x), SQLite, SQLAlchemy 2.x, Argon2id, AES-256-GCM
- **Frontend**: React + TypeScript, TanStack Query, Tailwind CSS, Vite
- **Platform**: macOS only (Touch ID via Keychain)

## Commands

```bash
# Start both servers
./start.sh

# Backend
cd backend && source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Frontend
cd frontend && npm run dev

# Lint frontend
cd frontend && npm run lint

# Build frontend
cd frontend && npm run build
```

## Architecture

### Auth Flow
1. Google OAuth → httponly JWT cookie (HS256)
2. `POST /auth/unlock` → Argon2id key derivation from master password → vault key stored in-memory (`VaultKeyStore`, keyed by JWT `jti`, 30-min sliding TTL)
3. Touch ID unlocks via macOS Keychain (`backend/auth/keychain.py`)

### Encryption
- Every vault entry field (title, username, password, url, notes) is encrypted **individually** with AES-256-GCM via `backend/crypto.py`
- SQLite stores **only ciphertext** — no plaintext ever touches the DB
- Search is post-decryption in Python
- `secure_wipe()` is called on key eviction — do not skip this

### Key Files
| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app, CORS, rate limiter, lifespan cleanup loop |
| `backend/crypto.py` | `encrypt()`, `decrypt()`, `derive_key()`, `encrypt_key()`, `decrypt_key()`, `secure_wipe()` |
| `backend/vault_store.py` | `VaultKeyStore` singleton — thread-safe, sliding TTL |
| `backend/dependencies.py` | `get_current_user()`, `get_jti()`, `get_vault_key()` FastAPI deps |
| `backend/models.py` | SQLAlchemy 2.x `Mapped[]` models: UserProfile, Category, VaultEntry |
| `backend/schemas.py` | Pydantic `*Create` / `*Update` / `*Out` schemas |
| `backend/config.py` | All config from env via dotenv |
| `backend/auth/` | `google_oauth.py`, `session.py` (JWT), `keychain.py` |
| `backend/routers/` | `auth.py`, `entries.py`, `categories.py`, `generator.py`, `vault.py` |
| `frontend/src/api/client.ts` | Axios instance (`withCredentials: true`), all typed API methods |
| `frontend/src/hooks/useVault.ts` | TanStack Query hooks for entries + categories |
| `frontend/src/pages/` | LoginPage, UnlockPage, VaultPage |

## Conventions

### Backend
- All config from `config.py` — **never** call `os.getenv()` directly in routers
- All new routers registered in `main.py` via `app.include_router()`
- Every DB query on `VaultEntry` / `Category` **must** filter by `user_id`
- Encrypted fields: encrypt on write, decrypt inside `_serialize()` before returning
- Rate limiting on sensitive endpoints: 5/min, 10/hr per IP
- Backend `.env` lives at `backend/.env` (not repo root)

### Frontend
- All API calls go through `frontend/src/api/client.ts`
- TanStack Query hooks: always call `invalidateQueries` on mutation success
- API base URL: `VITE_API_BASE_URL` env var

## Security Constraints

- **Never store plaintext passwords or vault keys to disk** — vault keys live only in `VaultKeyStore` (in-memory) and are wiped on eviction or TTL expiry
- Do not change the AES-256-GCM encryption format without writing a migration
- Do not log decrypted field values anywhere
- Do not bypass `get_vault_key()` dependency — it is the auth + key retrieval gate
- No test suite exists — be especially careful with crypto and auth changes
