"""Tick timing profiler for the 10 Hz simulation loop.

Records, per tick:
  * step duration (compute time of one simulation step)
  * period error (actual start-to-start interval minus the nominal period) -> jitter
  * overruns (step took longer than its period budget)
  * model exceptions caught by the fault-isolation layer
"""
import threading
import time
from collections import deque
from typing import Deque, Dict, List
import numpy as np


def _pct(arr: List[float]) -> Dict[str, float]:
    if not arr:
        return {"p50": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0, "mean": 0.0}
    a = np.asarray(arr, dtype=float)
    return {
        "p50": round(float(np.percentile(a, 50)), 4),
        "p95": round(float(np.percentile(a, 95)), 4),
        "p99": round(float(np.percentile(a, 99)), 4),
        "max": round(float(a.max()), 4),
        "mean": round(float(a.mean()), 4),
    }


class TickProfiler:
    def __init__(self, window: int = 6000):
        self._lock = threading.Lock()
        self._dur: Deque[float] = deque(maxlen=window)        # ms
        self._period_err: Deque[float] = deque(maxlen=window)  # ms (signed)
        self._late: Deque[float] = deque(maxlen=window)        # ms lateness vs absolute schedule
        self.ticks = 0
        self.overruns = 0
        self.missed_deadlines = 0
        self.model_errors: Dict[str, int] = {}
        self.last_error: Dict[str, str] = {}
        self.nominal_period_ms = 100.0
        self.started_wall = time.time()

    def reset(self):
        with self._lock:
            self._dur.clear(); self._period_err.clear(); self._late.clear()
            self.ticks = self.overruns = self.missed_deadlines = 0
            self.model_errors.clear(); self.last_error.clear()
            self.started_wall = time.time()

    def record_step(self, duration_s: float):
        with self._lock:
            self._dur.append(duration_s * 1000.0)
            self.ticks += 1

    def record_period(self, period_s: float, nominal_s: float, lateness_s: float):
        with self._lock:
            self.nominal_period_ms = nominal_s * 1000.0
            self._period_err.append((period_s - nominal_s) * 1000.0)
            self._late.append(max(0.0, lateness_s) * 1000.0)
            if lateness_s > nominal_s:
                self.missed_deadlines += 1

    def record_overrun(self):
        with self._lock:
            self.overruns += 1

    def record_error(self, source: str, exc: BaseException):
        with self._lock:
            self.model_errors[source] = self.model_errors.get(source, 0) + 1
            self.last_error[source] = f"{type(exc).__name__}: {exc}"

    def snapshot(self) -> dict:
        with self._lock:
            err = list(self._period_err)
            abs_err = [abs(e) for e in err]
            jitter_std = float(np.std(err)) if err else 0.0
            return {
                "nominal_period_ms": self.nominal_period_ms,
                "ticks": self.ticks,
                "samples": len(self._dur),
                "step_duration_ms": _pct(list(self._dur)),
                "period_error_abs_ms": _pct(abs_err),
                "start_lateness_ms": _pct(list(self._late)),
                "jitter_std_ms": round(jitter_std, 4),
                "overruns": self.overruns,
                "missed_deadlines": self.missed_deadlines,
                "model_errors": dict(self.model_errors),
                "last_error": dict(self.last_error),
                "definitions": {
                    "jitter": "standard deviation of (actual tick period - nominal period)",
                    "overrun": "a step whose compute time exceeded its period budget",
                    "missed_deadline": "a tick that started more than one full period after its schedule",
                },
            }
