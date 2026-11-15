# GÖKSYSTEM 3.0

A SCADA and 3D digital-twin simulator for four small plants: a manufacturing line, an 11 kV substation, a chemical process tank and a smart building with solar and battery storage. The backend is a FastAPI service running a 10 Hz physics loop; the frontend is a React/TypeScript HMI with a Three.js twin view.

## Features

- Physics models for the four domains (conveyor with VFD and emergency braking, transformer thermal model with ANSI 49/50 trips, tank level and pH control with PID, building HVAC and PV/battery). Equations are listed in `docs/ENGINEERING_MODELS.md`.
- Time scaling, fixed random seed and scheduled fault scenarios, so a run can be reproduced.
- ISA-18.2 style alarm state machine (unacknowledged / acknowledged / return-to-normal) with deadband.
- SQLite historian with CSV export, plus a time-series store, audit log, operator roles, energy accounting and a small PLC runtime.
- Protocol side: Modbus TCP server on port 5020, MQTT topics (in-memory bus when no broker is available), OPC UA node model and a Factory I/O adapter. See `docs/PROTOCOLS.md`.
- Web UI with domain screens, alarm panel, historian trends and a 3D twin with click-to-select equipment.

## Setup and run

Requires Python 3.10+ and Node.js 18+.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn goksystem.main:app --host 127.0.0.1 --port 8000

# in a second terminal
cd frontend
npm install
npm run dev
```

The UI is at http://localhost:3000 (Vite proxies `/api` and `/ws` to port 8000). API docs are at http://127.0.0.1:8000/docs.

Launch scripts that do the same thing:

- Windows: `start.bat`
- Linux: `./start.sh`
- macOS: double-click `Start-macOS.command`. It builds the frontend once and serves everything from port 8000 (change with `GOKSYSTEM_PORT`).

Environment variables: `GOKSYSTEM_DATA_DIR`, `GOKSYSTEM_SEED`, `GOKSYSTEM_NOISE_PCT`, `GOKSYSTEM_AUTH_REQUIRED`, `GOKSYSTEM_MODBUS_SIM_PORT`, `GOKSYSTEM_FACTORYIO_MODE` (`mock`, `live` or `off`).

## Tests

```bash
.venv/bin/python -m pytest tests
```

The tests cover the physics models, alarm engine, protocols, API endpoints and the platform modules. They write their databases to a temp directory.

## Project structure

```
goksystem/
  core/        engine, state container, device registry
  domains/     factory, grid, process, building models
  scada/       alarm engine, security
  historian/   SQLite storage
  protocols/   Modbus, MQTT, OPC UA, Factory I/O
  modules/     store, tsdb, PLC, energy, operators, scenarios, ...
  api/         REST routes and WebSocket hub
frontend/      React + Vite + Three.js UI
desktop/       Electron wrapper
packaging/     PyInstaller entry point for the desktop build
tests/
docs/
```

## Notes

- The commands above bind to localhost only, and authentication is off unless `GOKSYSTEM_AUTH_REQUIRED=1`.
- Data is written to `data/` (created on first start).
- `.github/workflows/desktop-packaging.yml` builds the Electron installers with PyInstaller on version tags.
- 3D asset credits are in `ASSET_CREDITS.md`.
