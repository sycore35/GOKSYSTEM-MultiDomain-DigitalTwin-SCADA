"""FastAPI app: wires the engine, protocol adapters and routes together, streams state deltas over /ws and serves the built frontend if present."""

import os
import sys
import asyncio
from types import SimpleNamespace
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

# The 10 Hz sim thread shares the GIL with uvicorn, WebSocket and protocol threads. With the default 5 ms
# switch interval a waking sim thread can wait up to 5 ms (often several hand-offs) for the GIL, which showed
# up as 5-60 ms period error under UI load. A 0.5 ms interval bounds that wait. Override: GOKSYSTEM_GIL_SWITCH_S.
sys.setswitchinterval(float(os.environ.get("GOKSYSTEM_GIL_SWITCH_S", "0.0005")))

from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.core.engine import SimulationEngine
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.historian.storage import HistorianStorage
from goksystem.protocols.mqtt_adapter import MQTTAdapter
from goksystem.protocols.modbus_adapter import ModbusTCPAdapter
from goksystem.protocols.opcua_adapter import VirtualOPCUAServer
from goksystem.api.websocket_hub import WebSocketHub
from goksystem.api.routes import register_routes
from goksystem.api.platform_routes import build_router
from goksystem.protocols.modbus_server import ModbusSimServer
from goksystem.modules.store import PlatformStore
from goksystem.modules.tsdb import TimeSeriesDB
from goksystem.modules.operators import OperatorManager
from goksystem.modules.energy import EnergyManager
from goksystem.modules.runtime import RuntimeTracker
from goksystem.modules.hardware import FieldNodes
from goksystem.modules.plc import PLCRuntime

DATA_DIR = os.environ.get("GOKSYSTEM_DATA_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
DB_PATH = os.path.join(DATA_DIR, "goksystem3.db")
PLATFORM_DB_PATH = os.path.join(DATA_DIR, "goksystem3_platform.db")
registry = DeviceRegistry()
state_engine = StateEngine(registry)
alarm_engine = AlarmEngine()
security_mgr = SecurityManager()
historian = HistorianStorage(DB_PATH)

engine = SimulationEngine(registry, state_engine, alarm_engine, security_mgr, historian,
                          seed=int(os.environ.get("GOKSYSTEM_SEED", "42")),
                          noise_pct=float(os.environ.get("GOKSYSTEM_NOISE_PCT", "0")))
ws_hub = WebSocketHub()

# Platform modules (persistent store, ms time-series DB, energy, PLC, operators, protocol simulator)
store = PlatformStore(PLATFORM_DB_PATH)
store.seed_assets(registry.list_all())
tsdb = TimeSeriesDB(PLATFORM_DB_PATH)
ops = OperatorManager(PLATFORM_DB_PATH)
engine.tsdb = tsdb
engine.energy = EnergyManager()
engine.runtime = RuntimeTracker()
engine.field_nodes = FieldNodes()
engine.plc = PLCRuntime()
engine.plc.command_sink = lambda dev, op_, params: engine.execute_command(__import__("goksystem.core.models", fromlist=["CommandRequest"]).CommandRequest(
    command_id=f"plc-{engine.step_count}", target_device=dev, operation=op_, parameters=params,
    operator_id="plc:PLC-MAIN-01", user_role="ENGINEER")).success
alarm_engine.event_sink = lambda ev: engine._persist(lambda: store.add_alarm_event(ev))
modbus_sim = ModbusSimServer(engine, port=int(os.environ.get("GOKSYSTEM_MODBUS_SIM_PORT", "5020")))
ctx = SimpleNamespace(engine=engine, store=store, tsdb=tsdb, ops=ops, energy=engine.energy, plc=engine.plc,
                      modbus_server=modbus_sim)

mqtt_gateway = MQTTAdapter(engine)
modbus_server = ModbusTCPAdapter(state_engine)   # legacy in-memory register map (kept for compatibility)
opcua_server = VirtualOPCUAServer(state_engine)


async def streaming_task():
    """Streams dirty state deltas to connected WebSockets at 10 Hz."""
    while True:
        try:
            if ws_hub.active_connections:
                deltas = state_engine.pop_dirty_snapshot()
                summary = engine.get_summary()
                payload = {
                    "type": "DELTA_UPDATE",
                    "sim_time": engine.sim_time,
                    "summary": summary.model_dump(),
                    "alarms": [a.model_dump() for a in engine.alarm_engine.get_active_alarms()],
                    "devices": {d_id: st.model_dump() for d_id, st in deltas.items()}
                }
                await ws_hub.broadcast_delta(payload)
        except Exception:
            pass
        await asyncio.sleep(0.1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.start()
    mqtt_gateway.start()
    if getattr(engine, "factoryio_mode", "mock") != "off":
        engine.factoryio_adapter.start()
    store.audit("system", "-", "SERVER_START", "goksystem", "OK", {"auth_required": ops.auth_required})
    task = asyncio.create_task(streaming_task())
    # Move startup objects to the permanent GC generation: measured gen2 pauses dropped from 14-122 ms to 2-4 ms
    # under load (scripts/measure_tick_under_load.py), removing the largest 10 Hz tick outliers.
    import gc
    gc.collect(); gc.freeze()
    yield
    task.cancel()
    engine.factoryio_adapter.stop()
    modbus_sim.stop()
    engine.stop()
    historian.flush()
    tsdb.close()
    store.audit("system", "-", "SERVER_STOP", "goksystem", "OK")


app = FastAPI(
    title="GÖKSYSTEM 3.0 Industrial Platform",
    description="Full-Scale SCADA, Simulation, Historian & Digital Twin Platform",
    version="3.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(build_router(ctx))     # platform router first so its /alarms/* paths take precedence
register_routes(app, engine, ws_hub, ctx)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_hub.connect(websocket)
    try:
        full_states = state_engine.get_all_states()
        summary = engine.get_summary()
        await websocket.send_json({
            "type": "INITIAL_STATE",
            "sim_time": engine.sim_time,
            "summary": summary.model_dump(),
            "alarms": [a.model_dump() for a in engine.alarm_engine.get_active_alarms()],
            "devices": {d_id: st.model_dump() for d_id, st in full_states.items()}
        })
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_hub.disconnect(websocket)
    except Exception:
        await ws_hub.disconnect(websocket)


FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/", include_in_schema=False)
    async def serve_root_spa():
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        return FileResponse(index_file)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_catchall(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws") or full_path in ("docs", "redoc", "openapi.json"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
