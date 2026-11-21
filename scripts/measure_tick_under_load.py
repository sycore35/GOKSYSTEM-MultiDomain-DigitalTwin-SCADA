"""Measure 10 Hz tick timing of the full server (FastAPI + all adapters) under a fixed, repeatable UI-like load.

Usage: .venv/bin/python scripts/measure_tick_under_load.py [seconds=30] [--rps=20] [--port=8765] [--no-gc-freeze]
       GOKSYSTEM_GIL_SWITCH_S=0.005 .venv/bin/python scripts/measure_tick_under_load.py   # Python default, for comparison

Load: --rps HTTP GETs per second spread over /states, /summary, /alarms, /perf/tick and /inspector/<motor>,
plus one WebSocket client draining the delta stream. Prints a JSON summary of the engine's TickProfiler.
"""
import asyncio
import json
import os
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("GOKSYSTEM_DATA_DIR", tempfile.mkdtemp(prefix="goksystem_load_"))

import httpx      # noqa: E402
import uvicorn    # noqa: E402
import websockets  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
opts = dict(a[2:].split("=", 1) for a in sys.argv[1:] if a.startswith("--") and "=" in a)
SECS = float(args[0]) if args else 30.0
RPS = float(opts.get("rps", 20))
PORT = int(opts.get("port", 8765))
BASE = f"http://127.0.0.1:{PORT}/api/v1"
PATHS = ["/states", "/summary", "/alarms", "/perf/tick", "/inspector/FAC_VFD_MOTOR_01?window_s=120"]

from goksystem import main  # noqa: E402  (applies the GIL switch interval at import)

server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=PORT, log_level="warning"))
threading.Thread(target=server.run, daemon=True).start()
while not server.started:
    time.sleep(0.05)
time.sleep(2.0)   # let adapters settle
# main.lifespan already runs gc.freeze(); --no-gc-freeze undoes it to compare against the old behaviour.
if "--no-gc-freeze" in sys.argv:
    import gc as _gc
    _gc.unfreeze()

stop = threading.Event()
counts = {"http": 0, "http_err": 0, "ws_msgs": 0}


def http_load():
    with httpx.Client(timeout=5) as c:
        i, period, nxt = 0, 1.0 / RPS, time.perf_counter()
        while not stop.is_set():
            try:
                r = c.get(BASE + PATHS[i % len(PATHS)])
                counts["http" if r.status_code == 200 else "http_err"] += 1
            except Exception:
                counts["http_err"] += 1
            i += 1
            nxt += period
            time.sleep(max(0.0, nxt - time.perf_counter()))


async def ws_load():
    async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws") as ws:
        while not stop.is_set():
            try:
                await asyncio.wait_for(ws.recv(), 0.5)
                counts["ws_msgs"] += 1
            except asyncio.TimeoutError:
                pass


import gc  # noqa: E402
gc_pauses = {0: [], 1: [], 2: []}
_gc_t0 = [0.0]


def _gc_cb(phase, info):
    if phase == "start":
        _gc_t0[0] = time.perf_counter()
    else:
        gc_pauses[info["generation"]].append((time.perf_counter() - _gc_t0[0]) * 1000.0)


gc.callbacks.append(_gc_cb)
threading.Thread(target=http_load, daemon=True).start()
threading.Thread(target=lambda: asyncio.run(ws_load()), daemon=True).start()
main.engine.profiler.reset()
time.sleep(SECS)
s = main.engine.profiler.snapshot()
stop.set()
server.should_exit = True
s.pop("definitions", None)
s.update({"measured_seconds": SECS, "load": {"rps_target": RPS, **counts},
          "gil_switch_interval_s": sys.getswitchinterval(),
          "gc_pauses_ms": {f"gen{g}": {"count": len(v), "max": round(max(v), 3) if v else 0.0,
                                       "total": round(sum(v), 1)} for g, v in gc_pauses.items()}})
print(json.dumps(s, indent=2), flush=True)
os._exit(0)
