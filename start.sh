#!/usr/bin/env bash
# Backend (8000) + Vite dev server (3000). Ctrl+C stops both.
cd "$(dirname "$0")" || exit 1

[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
[ -d frontend/node_modules ] || (cd frontend && npm install)

.venv/bin/python -m uvicorn goksystem.main:app --host 127.0.0.1 --port 8000 &
BACKEND=$!
trap 'kill $BACKEND 2>/dev/null' EXIT

cd frontend && npm run dev
