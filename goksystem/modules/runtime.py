"""Run-history tracker: per-device operating hours, start/stop/trip counts and status transitions.

Fed once per tick by SimulationEngine with the derived device statuses. Everything is measured in
simulation time, so two runs with the same seed produce identical histories.
"""
import threading
from collections import deque
from typing import Any, Deque, Dict, Optional

RUNNING = "RUNNING"
TRIP_STATES = ("FAULT", "MODEL_FAULT")


class _DeviceHistory:
    __slots__ = ("status", "since", "observed", "run", "status_seconds", "starts", "stops", "trips",
                 "last_start", "last_stop", "transitions")

    def __init__(self, status: str, sim_time: float):
        self.status = status
        self.since = sim_time
        self.observed = 0.0
        self.run = 0.0
        self.status_seconds: Dict[str, float] = {}
        self.starts = self.stops = self.trips = 0
        self.last_start: Optional[float] = None
        self.last_stop: Optional[float] = None
        self.transitions: Deque[Dict[str, Any]] = deque(maxlen=40)


class RuntimeTracker:
    def __init__(self):
        self._lock = threading.Lock()
        self._dev: Dict[str, _DeviceHistory] = {}

    def reset(self):
        with self._lock:
            self._dev.clear()

    def update(self, statuses: Dict[str, str], dt: float, sim_time: float):
        with self._lock:
            for dev_id, status in statuses.items():
                h = self._dev.get(dev_id)
                if h is None:
                    h = self._dev[dev_id] = _DeviceHistory(status, sim_time)
                    if status == RUNNING:
                        h.starts, h.last_start = 1, sim_time
                elif status != h.status:
                    prev = h.status
                    h.transitions.appendleft({"sim_time": round(sim_time, 3), "from": prev, "to": status,
                                              "duration_s": round(sim_time - h.since, 3)})
                    if status == RUNNING:
                        h.starts += 1; h.last_start = sim_time
                    elif prev == RUNNING:
                        h.stops += 1; h.last_stop = sim_time
                    if status in TRIP_STATES and prev not in TRIP_STATES:
                        h.trips += 1
                    h.status, h.since = status, sim_time
                h.observed += dt
                h.status_seconds[status] = h.status_seconds.get(status, 0.0) + dt
                if status == RUNNING:
                    h.run += dt

    def history(self, device_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            h = self._dev.get(device_id)
            if h is None:
                return None
            obs = h.observed
            return {
                "status": h.status,
                "status_since_sim_time": round(h.since, 3),
                "observed_seconds": round(obs, 6),
                "run_seconds": round(h.run, 6),
                "utilization_pct": round(100.0 * h.run / obs, 2) if obs > 0 else 0.0,
                "starts": h.starts,
                "stops": h.stops,
                "trips": h.trips,
                "last_start_sim_time": None if h.last_start is None else round(h.last_start, 3),
                "last_stop_sim_time": None if h.last_stop is None else round(h.last_stop, 3),
                "status_seconds": {k: round(v, 3) for k, v in sorted(h.status_seconds.items())},
                "transitions": list(h.transitions),
                "time_base": "simulation seconds",
            }
