"""Maintenance prediction: simple, explainable health-index model. ALL OUTPUTS ARE ESTIMATES.

For each monitored machine a handful of condition features (vibration, temperature, current...) is
scored 0..1 as the distance from a nominal value toward its alarm limit. The health index is
100 * (1 - weighted sum of scores). The time-to-limit estimate extrapolates the recent linear trend
(least squares over the live window) of the worst feature. No machine-learning, no failure statistics:
the nominal/limit values are engineering assumptions and must be calibrated per asset.
"""
from typing import Dict, List, Optional
import numpy as np

DISCLAIMER = ("TAHMİN / ESTIMATE: açıklanabilir basit model; kalibre edilmemiş mühendislik varsayımlarına dayanır, "
              "arıza garantisi veya sertifikalı bir teşhis değildir.")

MACHINES: Dict[str, List[dict]] = {
    "FAC_VFD_MOTOR_01": [
        {"point": "vibration_rms", "label": "Vibration RMS", "unit": "mm/s", "nominal": 1.8, "limit": 4.5, "weight": 0.45},
        {"point": "temperature_c", "label": "Winding temperature", "unit": "°C", "nominal": 50.0, "limit": 75.0, "weight": 0.30},
        {"point": "current_a", "label": "Motor current", "unit": "A", "nominal": 16.0, "limit": 28.0, "weight": 0.25},
    ],
    "PROC_PUMP_01": [
        {"point": "vibration_rms", "label": "Vibration RMS", "unit": "mm/s", "nominal": 2.3, "limit": 4.5, "weight": 0.45},
        {"point": "temperature_c", "label": "Casing/motor temperature", "unit": "°C", "nominal": 55.0, "limit": 85.0, "weight": 0.30},
        {"point": "current_a", "label": "Pump motor current", "unit": "A", "nominal": 12.0, "limit": 16.0, "weight": 0.25},
    ],
    "GRID_TRAFO_01": [
        {"point": "winding_hotspot_c", "label": "Winding hot-spot", "unit": "°C", "nominal": 70.0, "limit": 130.0, "weight": 0.55},
        {"point": "oil_temp_c", "label": "Top-oil temperature", "unit": "°C", "nominal": 55.0, "limit": 95.0, "weight": 0.30},
        {"point": "load_kva", "label": "Loading", "unit": "kVA", "nominal": 1500.0, "limit": 2500.0, "weight": 0.15},
    ],
}


def _slope_per_s(series: List[dict]) -> Optional[float]:
    if len(series) < 20:
        return None
    t = np.array([p["t"] for p in series], dtype=float) / 1000.0
    v = np.array([p["v"] for p in series], dtype=float)
    if t[-1] - t[0] < 5.0:
        return None
    return float(np.polyfit(t - t[0], v, 1)[0])


def status_from_index(hi: float) -> str:
    return "GOOD" if hi >= 80 else "WATCH" if hi >= 60 else "SERVICE_SOON" if hi >= 40 else "CRITICAL"


def assess(device_id: str, current: Dict[str, float], windows: Dict[str, List[dict]]) -> dict:
    feats = MACHINES.get(device_id)
    if not feats:
        raise KeyError(device_id)
    contribs, penalty = [], 0.0
    worst = None
    for f in feats:
        x = current.get(f["point"])
        if x is None:
            continue
        span = f["limit"] - f["nominal"]
        score = min(1.0, max(0.0, (x - f["nominal"]) / span)) if span > 0 else 0.0
        part = f["weight"] * score
        penalty += part
        slope = _slope_per_s(windows.get(f["point"], []))
        ttl = None
        if slope and slope > 1e-6 and x < f["limit"]:
            ttl = (f["limit"] - x) / slope
        c = {"feature": f["point"], "label": f["label"], "value": round(x, 2), "unit": f["unit"],
             "nominal": f["nominal"], "limit": f["limit"], "score": round(score, 3),
             "weight": f["weight"], "penalty_points": round(part * 100, 1),
             "trend_per_min": None if slope is None else round(slope * 60, 4),
             "est_seconds_to_limit": None if ttl is None else round(ttl, 0)}
        contribs.append(c)
        if worst is None or part > worst["penalty_points"] / 100:
            worst = c
    hi = round(100.0 * (1.0 - penalty), 1)
    contribs.sort(key=lambda c: -c["penalty_points"])
    ttls = [c["est_seconds_to_limit"] for c in contribs if c["est_seconds_to_limit"] is not None]
    explanation = []
    for c in contribs[:3]:
        if c["penalty_points"] >= 1:
            explanation.append(f"{c['label']} = {c['value']} {c['unit']} (nominal {c['nominal']}, limit {c['limit']}) -> -{c['penalty_points']} puan")
    if not explanation:
        explanation.append("Tüm ölçümler nominal değerlere yakın.")
    status = status_from_index(hi)
    action = {"GOOD": "Rutin bakım takvimine devam.", "WATCH": "Trendi izle; bir sonraki bakım penceresinde kontrol et.",
              "SERVICE_SOON": "Yakın zamanda planlı bakım öner (yatak/sıcaklık kontrolü).",
              "CRITICAL": "Hemen inceleme; yük azaltma veya durdurma değerlendirilmeli."}[status]
    return {"device_id": device_id, "health_index": hi, "status": status, "contributions": contribs,
            "explanation": explanation, "recommended_action": action,
            "est_seconds_to_limit": min(ttls) if ttls else None, "is_estimate": True, "disclaimer": DISCLAIMER}
