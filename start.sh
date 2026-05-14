#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Security: disable core dumps to prevent vault key leakage ──────────────────
ulimit -c 0

# ── Verify .env exists ─────────────────────────────────────────────────────────
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "❌  backend/.env not found."
  echo "    Copy .env.example → backend/.env and fill in your credentials:"
  echo "    cp .env.example backend/.env"
  exit 1
fi

# ── Activate Python venv ───────────────────────────────────────────────────────
if [ -d "$ROOT/backend/venv" ]; then
  source "$ROOT/backend/venv/bin/activate"
elif command -v python3 &>/dev/null; then
  echo "ℹ️  No venv found. Using system Python."
else
  echo "❌  Python 3 not found. Install it and run: pip install -r backend/requirements.txt"
  exit 1
fi

# ── Check frontend deps ────────────────────────────────────────────────────────
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "📦  Installing frontend dependencies..."
  cd "$ROOT/frontend" && npm install
fi

# ── Start backend ──────────────────────────────────────────────────────────────
echo "🚀  Starting backend at http://localhost:8000 ..."
cd "$ROOT/backend"
uvicorn main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

# ── Start frontend ─────────────────────────────────────────────────────────────
echo "🚀  Starting frontend at http://localhost:5173 ..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

# ── Open browser after brief startup delay ────────────────────────────────────
sleep 2
if command -v open &>/dev/null; then
  open "http://localhost:5173"
fi

echo ""
echo "✅  one-password is running."
echo "    Frontend : http://localhost:5173"
echo "    Backend  : http://localhost:8000"
echo "    Press Ctrl+C to stop."

# ── Wait and clean up on exit ─────────────────────────────────────────────────
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT INT TERM
wait
