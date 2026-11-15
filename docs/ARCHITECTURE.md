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
