"""Measure 10 Hz tick timing of the real SimulationEngine loop.

Usage: .venv/bin/python scripts/measure_tick.py [seconds=60] [--with-tsdb]
Prints a JSON summary (jitter, overruns, p50/p95/p99).
"""
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.core.engine import SimulationEngine
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.modules.tsdb import TimeSeriesDB
from goksystem.modules.energy import EnergyManager
from goksystem.modules.plc import PLCRuntime
from goksystem.modules.runtime import RuntimeTracker
from goksystem.modules.hardware import FieldNodes

secs = float(next((a for a in sys.argv[1:] if not a.startswith("--")), 60))
reg = DeviceRegistry()
e = SimulationEngine(reg, StateEngine(reg), AlarmEngine(), SecurityManager(), None)
if "--full" in sys.argv:       # same extras as the server: ms TSDB recording, energy, PLC
    e.tsdb = TimeSeriesDB(os.path.join(tempfile.mkdtemp(), "m.db"))
    e.energy = EnergyManager(); e.plc = PLCRuntime(); e.plc.running = True
    e.runtime = RuntimeTracker(); e.field_nodes = FieldNodes()
e.start()
time.sleep(secs)
e.stop()
s = e.profiler.snapshot()
s["measured_seconds"] = secs
s["configuration"] = "full (tsdb+energy+plc+runtime+12 field nodes)" if "--full" in sys.argv else "engine only"
print(json.dumps(s, indent=2))
