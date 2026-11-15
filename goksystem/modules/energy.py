"""Energy management: active/reactive power, energy integration (kWh/kvarh), efficiency report.

Power values come from the simulation's published telemetry. Transformer loss figures and the tariff
are configurable engineering assumptions (labelled as such in reports).
"""
import csv
import io
import math
import threading
from typing import Dict, List, Optional

# channel -> (device, active-power point, unit scale to kW, kind)
CONSUMERS = {
    "factory_motor": ("FAC_VFD_MOTOR_01", "power_kw", 1.0),
    "process_pump": ("PROC_PUMP_01", "power_kw", 1.0),
    "building_hvac": ("BLD_HVAC_ZONE1", "fan_power_kw", 1.0),
}
TRAFO_RATED_KVA = 2500.0
TRAFO_NO_LOAD_KW = 2.2     # assumed typical value for a 2.5 MVA ONAN unit
TRAFO_LOAD_LOSS_KW = 22.0  # assumed typical value at rated load


class EnergyManager:
    def __init__(self, tariff_per_kwh: float = 3.0, currency: str = "TRY"):
        self._lock = threading.RLock()
        self.tariff = tariff_per_kwh
        self.currency = currency
        self.reset()

    def reset(self):
        with self._lock:
            self.elapsed_s = 0.0
            self.kwh: Dict[str, float] = {k: 0.0 for k in CONSUMERS}
            self.kvarh: Dict[str, float] = {k: 0.0 for k in CONSUMERS}
            self.site_kwh = 0.0
            self.site_kvarh = 0.0
            self.solar_kwh = 0.0
            self.loss_kwh = 0.0
            self.pf_min = 1.0
            self.pf_sum = 0.0
            self.pf_n = 0
            self.peak_kw = 0.0
            self.parts_start: Optional[float] = None
            self.parts_now: Optional[float] = None
            self.last: Dict[str, float] = {}

    def update(self, state_engine, dt_s: float):
        """Called every simulation tick with the sim-time step."""
        with self._lock:
            h = dt_s / 3600.0
            rd = state_engine.read_point_value
            pf_motor = max(0.2, rd("FAC_VFD_MOTOR_01", "power_factor", 0.85))
            for ch, (dev, pt, scale) in CONSUMERS.items():
                p = rd(dev, pt, 0.0) * scale
                pf = pf_motor if ch == "factory_motor" else (0.84 if ch == "process_pump" else 0.95)
                q = p * math.tan(math.acos(min(1.0, pf)))
                self.kwh[ch] += p * h
                self.kvarh[ch] += q * h
                self.last[f"{ch}_kw"] = p
                self.last[f"{ch}_kvar"] = q
            p_site = rd("GRID_BUSBAR_11KV", "total_p_mw", 0.0) * 1000.0
            q_site = rd("GRID_BUSBAR_11KV", "total_q_mvar", 0.0) * 1000.0
            s_kva = rd("GRID_TRAFO_01", "load_kva", 0.0)
            k = s_kva / TRAFO_RATED_KVA
            loss = (TRAFO_NO_LOAD_KW + TRAFO_LOAD_LOSS_KW * k * k) if s_kva > 0 else 0.0
            self.site_kwh += p_site * h
            self.site_kvarh += q_site * h
            self.loss_kwh += loss * h
            self.solar_kwh += rd("BLD_SOLAR_PV_01", "output_kw", 0.0) * h
            pf_site = rd("GRID_TRAFO_01", "power_factor", 0.0)
            if pf_site > 0:
                self.pf_min = min(self.pf_min, pf_site)
                self.pf_sum += pf_site
                self.pf_n += 1
            self.peak_kw = max(self.peak_kw, p_site)
            parts = rd("FAC_CONVEYOR_01", "part_count", 0.0)
            if self.parts_start is None:
                self.parts_start = parts
            self.parts_now = parts
            self.elapsed_s += dt_s
            self.last.update({"site_kw": p_site, "site_kvar": q_site, "site_kva": s_kva, "trafo_loss_kw": loss,
                              "trafo_loading_pct": k * 100.0, "site_pf": pf_site})

    def report(self) -> dict:
        with self._lock:
            parts = (self.parts_now or 0) - (self.parts_start or 0)
            useful = self.site_kwh
            eff = (useful / (useful + self.loss_kwh) * 100.0) if (useful + self.loss_kwh) > 0 else None
            consumers = []
            tot = sum(self.kwh.values()) or 1e-9
            for ch in CONSUMERS:
                consumers.append({"channel": ch, "device": CONSUMERS[ch][0], "kwh": round(self.kwh[ch], 5),
                                  "kvarh": round(self.kvarh[ch], 5), "share_pct": round(self.kwh[ch] / tot * 100, 1),
                                  "now_kw": round(self.last.get(f"{ch}_kw", 0.0), 3),
                                  "now_kvar": round(self.last.get(f"{ch}_kvar", 0.0), 3)})
            return {
                "elapsed_sim_s": round(self.elapsed_s, 1),
                "now": {k: round(v, 3) for k, v in self.last.items()},
                "site": {"active_kwh": round(self.site_kwh, 4), "reactive_kvarh": round(self.site_kvarh, 4),
                         "peak_kw": round(self.peak_kw, 1),
                         "avg_power_factor": round(self.pf_sum / self.pf_n, 3) if self.pf_n else None,
                         "min_power_factor": round(self.pf_min, 3) if self.pf_n else None},
                "consumers": consumers,
                "efficiency": {
                    "transformer_loss_kwh": round(self.loss_kwh, 4),
                    "distribution_efficiency_pct": None if eff is None else round(eff, 2),
                    "kwh_per_part_factory_motor": round(self.kwh["factory_motor"] / parts, 5) if parts > 0 else None,
                    "parts_produced": int(parts),
                    "solar_kwh": round(self.solar_kwh, 4),
                    "solar_share_pct": round(self.solar_kwh / (self.site_kwh + self.solar_kwh) * 100, 1) if (self.site_kwh + self.solar_kwh) > 0 else None,
                },
                "cost_estimate": {"tariff_per_kwh": self.tariff, "currency": self.currency,
                                  "cost": round(self.site_kwh * self.tariff, 4)},
                "assumptions": [f"Transformer no-load loss {TRAFO_NO_LOAD_KW} kW and load loss {TRAFO_LOAD_LOSS_KW} kW at {TRAFO_RATED_KVA:.0f} kVA are assumed typical values.",
                                "Reactive power of consumers derived from the modelled power factor; tariff is a configurable estimate.",
                                "Energy integrates simulation time (speed-factor aware), not wall-clock time."],
            }

    def csv(self) -> str:
        r = self.report()
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["section", "name", "active_kwh", "reactive_kvarh", "extra"])
        w.writerow(["site", "grid_busbar", r["site"]["active_kwh"], r["site"]["reactive_kvarh"], f"peak_kw={r['site']['peak_kw']}"])
        for c in r["consumers"]:
            w.writerow(["consumer", c["channel"], c["kwh"], c["kvarh"], f"share_pct={c['share_pct']}"])
        e = r["efficiency"]
        w.writerow(["efficiency", "distribution_efficiency_pct", e["distribution_efficiency_pct"], "", ""])
        w.writerow(["efficiency", "kwh_per_part", e["kwh_per_part_factory_motor"], "", f"parts={e['parts_produced']}"])
        return out.getvalue()
