"""Asset inspector: assembles REAL simulation data for one device (used by the 3D click-to-inspect panel)."""
from typing import Any, Dict, List, Optional

from goksystem.modules import maintenance

METRICS = [
    ("temperature", ["temperature_c", "temp_c", "winding_hotspot_c", "oil_temp_c", "cell_temp_c", "inverter_temp_c", "current_temp_c"]),
    ("rpm", ["rpm"]),
    ("current", ["current_a", "current_l1_a"]),
    ("vibration", ["vibration_rms"]),
    ("power", ["power_kw", "fan_power_kw", "output_kw", "total_p_mw", "load_kva"]),
    ("primary", ["level_pct", "position_pct", "speed", "soc_pct", "voltage_kv", "joint1_deg", "ph_value", "state"]),
]


def build_inspection(engine, store, tsdb, device_id: str, window_s: float = 120.0) -> Optional[Dict[str, Any]]:
    dfn = engine.registry.get(device_id)
    state = engine.state_engine.get_device_state(device_id)
    if not dfn or not state:
        return None
    tel = state.telemetry
    alarms_all = engine.alarm_engine.get_all_alarms()
    dev_alarms = [a for a in alarms_all if a.source_device == device_id and a.state.value != "NORMAL"]
    by_tag = {a.tag_id: a for a in dev_alarms}

    key_metrics: Dict[str, Any] = {}
    trend_points: List[str] = []
    for label, cands in METRICS:
        for pt in cands:
            if pt in tel:
                al = by_tag.get(pt)
                key_metrics[label] = {
                    "point": pt, "value": tel[pt].value, "unit": tel[pt].unit, "quality": tel[pt].quality.value,
                    "limit": al.setpoint_or_limit if al else None,
                    "alarm_state": al.state.value if al else "NORMAL",
                }
                trend_points.append(pt)
                break
    for pt in tel:
        if len(trend_points) >= 4:
            break
        if pt not in trend_points and tel[pt].unit not in ("bool", "state", "ansi"):
            trend_points.append(pt)

    trend = {pt: tsdb.window(f"{device_id}:{pt}", window_s, 300) if tsdb else [] for pt in trend_points}
    units = {pt: tel[pt].unit for pt in trend_points}

    health = None
    if device_id in maintenance.MACHINES:
        cur = {f["point"]: tel[f["point"]].value for f in maintenance.MACHINES[device_id] if f["point"] in tel}
        win = {f["point"]: tsdb.window(f"{device_id}:{f['point']}", 300, 200) if tsdb else [] for f in maintenance.MACHINES[device_id]}
        health = maintenance.assess(device_id, cur, win)

    events = engine.alarm_engine.get_event_history(limit=400)
    return {
        "device": dfn.model_dump(),
        "asset": store.get_asset(device_id) if store else None,
        "status": state.status,
        "interlocks_engaged": state.interlocks_engaged,
        "last_update_sim_time": state.last_update_sim_time,
        "sim_time": engine.sim_time,
        "key_metrics": key_metrics,
        "telemetry": {k: {"value": v.value, "unit": v.unit, "quality": v.quality.value} for k, v in tel.items()},
        "alarms": [a.model_dump() for a in dev_alarms],
        "alarm_history": [e for e in events if e["source_device"] == device_id][:12],
        "runtime": engine.runtime.history(device_id) if getattr(engine, "runtime", None) else None,
        "trend": trend,
        "trend_units": units,
        "trend_window_s": window_s,
        "health": health,
        "data_source": "SimulationEngine (live); trend from in-memory ms ring buffer",
    }
