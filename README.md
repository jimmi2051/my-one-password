# one-password 🔐

A local password manager that runs entirely on your machine.

**Backend:** Python 3.11+ / FastAPI · SQLAlchemy 2.x · Pydantic v2 · Argon2-cffi · SQLite  
**Frontend:** React 19 / TypeScript · Vite · TanStack Query · React Router v7 · Tailwind CSS · Axios  
**Security:** AES-256-GCM per-field encryption · Argon2id key derivation · macOS Touch ID via Keychain  
**Auth:** Google OAuth (identity check only) → master password → Touch ID on subsequent logins

---

## Quick Start

### 1. Prerequisites

- Python 3.11+  
- Node.js 18+  
- macOS (Touch ID support requires macOS Keychain)

### 2. Google OAuth credentials

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorized redirect URI: `http://localhost:8000/auth/callback`
4. Copy the **Client ID** and **Client Secret**

### 3. Configure environment

```bash
cp .env.example backend/.env
# Edit backend/.env and fill in:
#   GOOGLE_CLIENT_ID
#   GOOGLE_CLIENT_SECRET
#   JWT_SECRET  (generate: python3 -c "import secrets; print(secrets.token_hex(32))")
```

### 4. Install backend dependencies

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Launch

```bash
chmod +x start.sh
./start.sh
```

The app opens automatically at **http://localhost:5173**.

---

## First-time setup

1. Click **Sign in with Google** — identity check only, no data leaves your machine
2. Set a **master password** — used to derive your vault encryption key
3. Subsequent logins use **Touch ID** (macOS Keychain); master password is the fallback

---

## Features

| Feature | Details |
|---|---|
| CRUD entries | Title, username, password, URL, notes, category |
| Password generator | Length, uppercase, numbers, symbols |
| Categories | Sidebar filter with custom labels |
| Search | Full-text search across all fields |
| Copy to clipboard | Auto-clears after 30 seconds |
| Export | JSON or CSV (plaintext — warned before download) |
| Import | JSON or CSV |
| Change master password | Re-encrypts vault key only; entries unchanged |

---

## Security model

```
vault_key (32 random bytes)
  ↓ Argon2id(master_password, salt)   → vault_key_enc  [stored in DB]
  ↓ AES-256-GCM per-field             → encrypted passwords/notes/title/username/url

macOS Keychain stores vault_key.hex() → unlocked by Touch ID
Vault key lives in memory only (30-min sliding TTL, wiped on logout)
```

- **No plaintext ever stored** — verified: `sqlite3 vault.db "SELECT password FROM vault_entries LIMIT 1"` returns ciphertext
- **Core dumps disabled** at startup (`ulimit -c 0`)
- **Rate limiting** on `/auth/unlock`: 5/min · 10/hr per IP
- **`PRAGMA journal_mode=DELETE`** — no WAL files with transaction data

---

## Project structure

```
one-password/
├── backend/
│   ├── main.py            # FastAPI app, CORS, lifespan
│   ├── crypto.py          # AES-256-GCM + Argon2id
│   ├── vault_store.py     # In-memory vault key store (sliding TTL)
│   ├── models.py          # SQLAlchemy 2.x models
│   ├── schemas.py         # Pydantic v2 schemas
│   ├── dependencies.py    # FastAPI deps (auth, vault key)
│   ├── config.py          # All config from env
│   ├── database.py        # SQLite engine + init_db
│   ├── auth/              # Google OAuth, JWT, macOS Keychain
│   ├── routers/           # auth, entries, categories, generator, vault
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/         # LoginPage, UnlockPage, VaultPage
│       ├── components/    # EntryCard, EntryForm, PasswordGenerator, …
│       ├── hooks/         # useVault, useClipboard
│       └── api/client.ts  # Axios + typed API calls
├── .env.example
├── docker-compose.yml
├── start.sh
└── README.md
```

---

## 🐳 Docker

> **Note:** Touch ID / macOS Keychain is unavailable inside Docker. The null keyring backend is used automatically.

```bash
docker compose up --build
```

Set `PYTHON_KEYRING_BACKEND=keyring.backends.null.Keyring` in your environment if you encounter keyring errors outside of Docker on a non-macOS host.

---

## 🛠 Development

```bash
# Start both servers + open browser (recommended)
./start.sh

# Backend only (activate venv first)
cd backend && source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Frontend only
cd frontend && npm run dev        # http://localhost:5173

# Lint frontend
cd frontend && npm run lint
```

---

## 🤖 AI coding assistants

`.github/copilot-instructions.md` contains project-specific instructions for GitHub Copilot and other AI coding assistants. It is picked up automatically by editors that support the Copilot instructions file spec.

---

## Troubleshooting

**Touch ID doesn't appear** — macOS Keychain item must be created once with master password. Log in with master password first; Touch ID activates on the next login.

**`GOOGLE_CLIENT_ID` missing** — make sure `backend/.env` exists (not just `.env.example`).

**Port already in use** — change `PORT` in `backend/.env` and update `GOOGLE_REDIRECT_URI` accordingly.
