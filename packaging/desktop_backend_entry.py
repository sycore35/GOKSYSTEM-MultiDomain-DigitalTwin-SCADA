"""Entry point for the PyInstaller backend bundle used by the desktop app."""
import os
import sys
import uvicorn
import multiprocessing

# Configure application data directory for SQLite persistence
app_data = os.environ.get("GOKSYSTEM_DATA_DIR")
if not app_data:
    if sys.platform == "win32":
        app_data = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "GOKSYSTEM3")
    elif sys.platform == "darwin":
        app_data = os.path.join(os.path.expanduser("~/Library/Application Support"), "GOKSYSTEM3")
    else:
        app_data = os.path.join(os.path.expanduser("~/.config"), "GOKSYSTEM3")

os.makedirs(app_data, exist_ok=True)
db_path = os.path.join(app_data, "historian.db")
os.environ["GOKSYSTEM_HISTORIAN_DB"] = db_path

print(f"[GÖKSYSTEM CORE] Initialized. Data Directory: {app_data}")
print(f"[GÖKSYSTEM CORE] Historian DB: {db_path}")

from goksystem.main import app

def run():
    multiprocessing.freeze_support()
    port = int(os.environ.get("GOKSYSTEM_PORT", 8000))
    host = os.environ.get("GOKSYSTEM_HOST", "127.0.0.1")
    print(f"[GÖKSYSTEM CORE] Launching API Gateway on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")

if __name__ == "__main__":
    run()
