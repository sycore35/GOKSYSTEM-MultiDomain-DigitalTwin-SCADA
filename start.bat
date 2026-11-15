@echo off
cd /d "%~dp0"
if not exist .venv python -m venv .venv
.venv\Scripts\python -m pip install -q -r requirements.txt
if not exist frontend\node_modules (cd frontend && call npm install && cd ..)
start "goksystem backend" cmd /k ".venv\Scripts\python -m uvicorn goksystem.main:app --host 127.0.0.1 --port 8000"
start "goksystem frontend" cmd /k "cd frontend && npm run dev"
timeout /t 5 >nul
start http://localhost:3000
