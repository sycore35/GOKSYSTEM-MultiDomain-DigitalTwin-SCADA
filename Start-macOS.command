#!/bin/bash
# Double-click launcher: one process serves the API and the built UI.
# GOKSYSTEM_PORT changes the port (default 8000).
cd "$(dirname "$0")" || exit 1
PORT="${GOKSYSTEM_PORT:-8000}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
mkdir -p logs

fail() { echo "$1"; read -n 1 -s -r -p "Press any key to close..."; exit 1; }

[ -x .venv/bin/python ] || python3 -m venv .venv || fail "python3 not found"
.venv/bin/pip install -q -r requirements.txt || fail "pip install failed"

if [ ! -f frontend/dist/index.html ]; then
  (cd frontend && npm install && npm run build) || fail "frontend build failed"
fi

lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && fail "Port $PORT is already in use"

.venv/bin/python -m uvicorn goksystem.main:app --host 127.0.0.1 --port "$PORT" >> logs/server.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT INT TERM

for _ in $(seq 1 40); do
  curl -fs "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1 && break
  kill -0 $PID 2>/dev/null || fail "Server exited, see logs/server.log"
  sleep 0.5
done

echo "http://127.0.0.1:$PORT (Ctrl+C to stop)"
open "http://127.0.0.1:$PORT"
wait $PID
