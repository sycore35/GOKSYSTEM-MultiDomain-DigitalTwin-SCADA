# Architecture

Single FastAPI process. The simulation runs in its own thread at 10 Hz, and the API and WebSocket layer read from it through a shared state container.

```
domains (factory, grid, process, building)
        |
   SimulationEngine  --->  StateEngine (double buffer, dirty flags)
        |                        |
   AlarmEngine            WebSocketHub  --->  React UI (/ws)
   Historian (SQLite)
   Modbus / MQTT / OPC UA adapters
        |
   REST routes (/api/v1)
```

Per tick, `SimulationEngine.step_once()`:

1. advances every domain model by dt = 0.1 s and writes the results into `StateEngine`
2. evaluates alarms (with deadband)
3. queues samples for the historian, which writes to SQLite in batches

A separate async task in `main.py` pops the changed points from `StateEngine` every 100 ms and broadcasts them to connected WebSocket clients.

In production the built frontend (`frontend/dist`) is served by the same process. In development Vite runs on port 3000 and proxies `/api` and `/ws` to port 8000.

## Per-tick extras

After the domain models, the same tick also runs:

- **Field cards** (`modules/hardware.py`): one ladder program per asset, on that asset's GK-P1 card. Inputs are
  read from telemetry through the card's wiring (DI thresholds, 4–20 mA scaling, RS-485 / I²C devices); outputs
  only change the card's relay states. Card designs live in `hardware/`.
- **Run history** (`modules/runtime.py`): operating seconds, starts, stops, trips and status transitions per
  device, on simulation time so a seeded run always gives the same history.
- **Main PLC runtime** (`modules/plc.py`): the editable demo program on the PLC page, which may command the
  plant when its write mode is switched on.

## Frontend

The HMI is a single-page React app. Live values arrive over `/ws`; pages poll their own REST endpoints.
The 3D twin (`frontend/src/components/3d/`) builds every machine from procedural meshes with shared materials
(`parts.tsx`) and animates them from telemetry. The communication diagram (`platform/CommDiagram.tsx`) is a
single SVG drawn from the same data.
