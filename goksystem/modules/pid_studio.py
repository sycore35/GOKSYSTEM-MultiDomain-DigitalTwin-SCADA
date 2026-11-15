"""PID Tuning Studio: closed-loop step-response simulation on a first-order-plus-dead-time plant.

Plant:   tau * dy/dt = -y + K * u(t - theta)
Control: parallel-form PID with filtered derivative (N=10) and conditional-integration anti-windup.
All numbers produced here come from the simulation actually run; the tuning suggestions are textbook
rules (IMC/lambda, Ziegler-Nichols open-loop) and are starting points, not guarantees.
"""
import math
from collections import deque
from typing import Dict, List, Optional


def simulate_step(kp: float, ki: float, kd: float, plant_k: float = 1.0, tau: float = 5.0, theta: float = 0.5,
                  setpoint: float = 1.0, duration: float = 40.0, dt: float = 0.02,
                  u_min: float = -10.0, u_max: float = 10.0, max_points: int = 400,
                  disturbance: float = 0.0, disturbance_at: float = 0.0) -> dict:
    if tau <= 0 or dt <= 0 or duration <= 0 or theta < 0:
        raise ValueError("tau, dt, duration must be > 0 and theta >= 0")
    n = int(round(duration / dt))
    if n > 200_000:
        raise ValueError("duration/dt too large")
    delay_n = int(round(theta / dt))
    buf = deque([0.0] * (delay_n + 1), maxlen=delay_n + 1)
    y = 0.0
    integ = 0.0
    d_filt = 0.0
    prev_e = setpoint
    N = 10.0
    ts: List[float] = []
    ys: List[float] = []
    us: List[float] = []
    for i in range(n):
        t = i * dt
        e = setpoint - y
        # derivative on error with first-order filter
        if kd > 0:
            td = kd / kp if kp > 0 else 0.0
            if td > 0:
                alpha = td / (td + N * dt)
                d_raw = (e - prev_e) / dt
                d_filt = alpha * d_filt + (1 - alpha) * d_raw
            d_term = kd * d_filt
        else:
            d_term = 0.0
        u_unsat = kp * e + ki * integ + d_term
        u = max(u_min, min(u_max, u_unsat))
        # conditional integration (anti-windup)
        if u == u_unsat or (u_unsat > u_max and e < 0) or (u_unsat < u_min and e > 0):
            integ += e * dt
        prev_e = e
        buf.append(u)
        u_delayed = buf[0]
        d = disturbance if (disturbance and t >= disturbance_at) else 0.0
        y += dt * (-y + plant_k * u_delayed + d) / tau
        ts.append(t); ys.append(y); us.append(u)
    metrics = step_metrics(ts, ys, setpoint)
    stride = max(1, len(ts) // max_points)
    return {"t": [round(v, 3) for v in ts[::stride]], "y": [round(v, 5) for v in ys[::stride]],
            "u": [round(v, 5) for v in us[::stride]], "setpoint": setpoint, "metrics": metrics,
            "gains": {"kp": kp, "ki": ki, "kd": kd}}


def step_metrics(ts: List[float], ys: List[float], setpoint: float, band: float = 0.02) -> dict:
    """Overshoot %, rise time (10-90 %), settling time (2 % band), IAE, steady-state error."""
    if not ts or setpoint == 0:
        return {"overshoot_pct": 0.0, "rise_time_s": None, "settling_time_s": None, "iae": 0.0, "steady_state_error": 0.0, "stable": False}
    peak = max(ys) if setpoint > 0 else min(ys)
    overshoot = max(0.0, (peak - setpoint) / abs(setpoint) * 100.0) if setpoint > 0 else max(0.0, (setpoint - peak) / abs(setpoint) * 100.0)
    lo, hi = 0.1 * setpoint, 0.9 * setpoint
    t10 = next((t for t, y in zip(ts, ys) if (y >= lo if setpoint > 0 else y <= lo)), None)
    t90 = next((t for t, y in zip(ts, ys) if (y >= hi if setpoint > 0 else y <= hi)), None)
    rise = (t90 - t10) if (t10 is not None and t90 is not None) else None
    tol = band * abs(setpoint)
    settle = None
    for i in range(len(ts) - 1, -1, -1):
        if abs(ys[i] - setpoint) > tol:
            settle = ts[i + 1] if i + 1 < len(ts) else None
            break
    else:
        settle = 0.0
    dt = ts[1] - ts[0] if len(ts) > 1 else 0.0
    iae = sum(abs(setpoint - y) for y in ys) * dt
    tail = ys[-max(1, len(ys) // 20):]
    sse = setpoint - sum(tail) / len(tail)
    stable = bool(math.isfinite(ys[-1]) and abs(ys[-1]) < 50 * abs(setpoint) and settle is not None)
    return {"overshoot_pct": round(overshoot, 2), "rise_time_s": None if rise is None else round(rise, 3),
            "settling_time_s": None if settle is None else round(settle, 3), "iae": round(iae, 4),
            "steady_state_error": round(sse, 5), "stable": stable}


def compare(runs: List[dict], plant: dict, setpoint: float = 1.0, duration: float = 40.0) -> dict:
    out = []
    for i, r in enumerate(runs[:6]):
        sim = simulate_step(float(r.get("kp", 1)), float(r.get("ki", 0)), float(r.get("kd", 0)),
                            setpoint=setpoint, duration=duration, **plant)
        sim["name"] = r.get("name") or f"Run {i + 1}"
        out.append(sim)
    return {"plant": plant, "setpoint": setpoint, "duration": duration, "runs": out}


def suggest(plant_k: float, tau: float, theta: float) -> List[dict]:
    """Textbook starting points for FOPDT. Labeled as suggestions."""
    k, th = max(plant_k, 1e-6), max(theta, 1e-3)
    lam = max(th, 0.3 * tau)
    imc_kp = tau / (k * (lam + th))
    zn_kp = 1.2 * tau / (k * th)
    return [
        {"name": "IMC / lambda (PI, conservative)", "kp": round(imc_kp, 4), "ki": round(imc_kp / tau, 4), "kd": 0.0},
        {"name": "Ziegler-Nichols open-loop (PID, aggressive)", "kp": round(zn_kp, 4),
         "ki": round(zn_kp / (2 * th), 4), "kd": round(zn_kp * 0.5 * th, 4)},
    ]
