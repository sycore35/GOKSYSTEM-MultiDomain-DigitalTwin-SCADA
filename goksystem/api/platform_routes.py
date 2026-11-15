"""REST API for the platform modules (inspector, perf, alarm center, assets, tsdb, trends, PID, scenarios,
maintenance, energy, PLC, digital-twin editor, operators, protocol simulator)."""
import hashlib
import json
import time
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Response

from goksystem.core.models import ScenarioDefinition
from goksystem.modules import inspector, maintenance, pid_studio, scenarios as scn
from goksystem.modules.operators import ROLE_PERMISSIONS, Operator
from goksystem.modules.plc import DEFAULT_PROGRAM, PLCError
from goksystem.modules.store import ASSET_STATUS, ASSET_TYPES, TWIN_KINDS, ValidationError


def build_router(ctx) -> APIRouter:
    r = APIRouter(prefix="/api/v1")
    engine, store, tsdb, ops = ctx.engine, ctx.store, ctx.tsdb, ctx.ops

    # auth / audit
    def current_operator(x_operator_token: Optional[str] = Header(None)) -> Operator:
        op = ops.resolve(x_operator_token)
        if op is None:
            if x_operator_token or ops.auth_required:
                raise HTTPException(401, "Valid operator token required (POST /api/v1/auth/login)")
            op = ops.anonymous()
        return op

    def need(perm: str):
        def dep(op: Operator = Depends(current_operator)) -> Operator:
            if not op.can(perm):
                store.audit(op.username, op.role, "PERMISSION_DENIED", perm, "DENIED")
                raise HTTPException(403, f"Role '{op.role}' lacks permission '{perm}'")
            return op
        return dep

    def audit(op: Operator, action: str, target: str = "", details: Optional[dict] = None, status: str = "OK"):
        store.audit(op.username, op.role, action, target, status, details)

    ctx.need, ctx.audit_fn, ctx.current_operator = need, audit, current_operator

    @r.get("/auth/mode")
    def auth_mode():
        return {"auth_required": ops.auth_required, "default_role": ops.default_role,
                "anonymous": ops.anonymous().to_dict(), "roles": ROLE_PERMISSIONS,
                "note": "Open mode = local demo; unauthenticated requests act as the default role."}

    @r.post("/auth/login")
    def login(body: Dict[str, Any] = Body(...)):
        res = ops.login(str(body.get("username", "")), str(body.get("pin", "")))
        if not res:
            store.audit(str(body.get("username", ""))[:40], "-", "LOGIN", "", "FAILED")
            raise HTTPException(401, "Invalid credentials")
        store.audit(res["operator"]["username"], res["operator"]["role"], "LOGIN", "", "OK")
        return res

    @r.post("/auth/logout")
    def logout(x_operator_token: Optional[str] = Header(None), op: Operator = Depends(current_operator)):
        if x_operator_token:
            ops.logout(x_operator_token)
        audit(op, "LOGOUT")
        return {"status": "OK"}

    @r.get("/auth/me")
    def me(op: Operator = Depends(current_operator)):
        return op.to_dict()

    @r.get("/operators")
    def list_operators(op: Operator = Depends(need("MANAGE_USERS"))):
        return ops.list_users()

    @r.post("/operators")
    def upsert_operator(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("MANAGE_USERS"))):
        try:
            res = ops.upsert_user(str(body.get("username", "")), str(body.get("display", "")), str(body.get("role", "VIEWER")),
                                  body.get("pin"), bool(body.get("active", True)))
        except ValueError as e:
            raise HTTPException(400, str(e))
        audit(op, "USER_UPSERT", res["username"], {"role": res["role"], "active": res["active"]})
        return res

    @r.get("/audit/log")
    def audit_log(limit: int = 100, actor: Optional[str] = None, action: Optional[str] = None):
        return store.query_audit(min(limit, 1000), actor, action)

    @r.get("/audit/verify")
    def audit_verify():
        return store.verify_audit_chain()

    # inspector
    @r.get("/inspector/{device_id}")
    def inspect(device_id: str, window_s: float = Query(120.0, ge=10, le=600)):
        res = inspector.build_inspection(engine, store, tsdb, device_id, window_s)
        if res is None:
            raise HTTPException(404, f"Device '{device_id}' not found")
        return res

    # perf
    @r.get("/perf/tick")
    def perf_tick():
        snap = engine.profiler.snapshot()
        snap["engine"] = {"running": engine.running, "speed_factor": engine.speed_factor, "step_count": engine.step_count,
                          "persist_queue": engine._persist_q.qsize(), "persist_dropped": engine.persist_dropped,
                          "model_fault_flags": dict(engine._model_errors)}
        return snap

    @r.post("/perf/reset")
    def perf_reset(op: Operator = Depends(need("SIM_PAUSE"))):
        engine.profiler.reset()
        return {"status": "OK"}

    def _fresh_engine(seed=42, noise=0.0):
        from goksystem.core.device_registry import DeviceRegistry
        from goksystem.core.state_engine import StateEngine
        from goksystem.core.engine import SimulationEngine
        from goksystem.scada.alarm_engine import AlarmEngine
        from goksystem.scada.security import SecurityManager
        reg = DeviceRegistry()
        return SimulationEngine(reg, StateEngine(reg), AlarmEngine(), SecurityManager(), None, seed=seed, noise_pct=noise)

    def _trajectory_hash(seed: int, steps: int, noise: float) -> str:
        e = _fresh_engine(seed, noise)
        h = hashlib.sha256()
        for _ in range(steps):
            e.step_once()
            for d, p, v, _u in e.state_engine.iter_points():
                h.update(f"{d}:{p}:{v!r};".encode())
        return h.hexdigest()

    @r.post("/perf/determinism")
    def perf_determinism(steps: int = Query(600, ge=10, le=3000), seed: int = 42):
        a, b = _trajectory_hash(seed, steps, 0.01), _trajectory_hash(seed, steps, 0.01)
        c = _trajectory_hash(seed + 1, steps, 0.01)
        return {"steps": steps, "seed": seed, "hash_run_a": a, "hash_run_b": b, "identical_same_seed": a == b,
                "hash_other_seed": c, "differs_other_seed": a != c, "noise_pct": 0.01}

    @r.post("/perf/fault-tolerance")
    def perf_fault_tolerance(steps: int = Query(100, ge=10, le=1000)):
        e = _fresh_engine()
        calls = {"n": 0}

        def broken(dt, st):
            calls["n"] += 1
            raise RuntimeError("injected model failure")
        e.register_model("injected_failure", broken)
        for _ in range(steps):
            e.step_once()
        snap = e.profiler.snapshot()
        return {"steps_requested": steps, "steps_completed": e.step_count, "faulty_model_calls": calls["n"],
                "errors_counted": snap["model_errors"], "other_models_alive": e.state_engine.read_point_value("FAC_CONVEYOR_01", "speed", 0) > 0,
                "sim_time": round(e.sim_time, 2), "passed": e.step_count == steps and snap["model_errors"].get("injected_failure") == steps}

    @r.post("/perf/benchmark")
    def perf_benchmark(seconds: float = Query(10.0, ge=2, le=30)):
        """Run an isolated real-time engine for N seconds and report its tick timing (competes with the live engine for the CPU)."""
        e = _fresh_engine()
        e.start()
        time.sleep(seconds)
        e.stop()
        snap = e.profiler.snapshot()
        snap["benchmark_seconds"] = seconds
        return snap

    # alarm center
    al = engine.alarm_engine

    @r.get("/alarms/center")
    def alarm_center(window_s: float = 600.0):
        return {"active": [a.model_dump() for a in al.get_active_alarms()],
                "shelved": [a.model_dump() for a in al.get_shelved_alarms()],
                "all": [a.model_dump() for a in al.get_all_alarms()],
                "stats": al.get_statistics(window_s), "config": al.get_config(),
                "default_deadband_pct": al.deadband_pct}

    @r.post("/alarms/ack-all")
    def ack_all(op: Operator = Depends(need("ACK_ALARM"))):
        n = al.acknowledge_all(op.username)
        audit(op, "ALARM_ACK_ALL", "", {"count": n})
        return {"acknowledged": n}

    @r.post("/alarms/{alarm_id}/ack")
    def ack(alarm_id: str, operator_id: Optional[str] = None, op: Operator = Depends(need("ACK_ALARM"))):
        ok = al.acknowledge_alarm(alarm_id, op.username if op.username != "local_operator" or not operator_id else operator_id)
        if not ok:
            raise HTTPException(400, "Alarm not found or already acknowledged.")
        audit(op, "ALARM_ACK", alarm_id)
        return {"status": "SUCCESS", "alarm_id": alarm_id, "ack_by": op.username}

    @r.post("/alarms/{alarm_id}/shelve")
    def shelve(alarm_id: str, body: Dict[str, Any] = Body(...), op: Operator = Depends(need("SHELVE_ALARM"))):
        ok, msg = al.shelve_alarm(alarm_id, op.username, float(body.get("duration_s", 600)), str(body.get("reason", "")))
        if not ok:
            raise HTTPException(400, msg)
        audit(op, "ALARM_SHELVE", alarm_id, {"duration_s": body.get("duration_s"), "reason": body.get("reason")})
        return {"status": "SHELVED", "alarm_id": alarm_id}

    @r.post("/alarms/{alarm_id}/unshelve")
    def unshelve(alarm_id: str, op: Operator = Depends(need("SHELVE_ALARM"))):
        if not al.unshelve_alarm(alarm_id, op.username):
            raise HTTPException(400, "Alarm is not shelved")
        audit(op, "ALARM_UNSHELVE", alarm_id)
        return {"status": "UNSHELVED", "alarm_id": alarm_id}

    @r.put("/alarms/{alarm_id}/config")
    def alarm_config(alarm_id: str, body: Dict[str, Any] = Body(...), op: Operator = Depends(need("ALARM_CONFIG"))):
        cfg = al.configure_alarm(alarm_id, body.get("deadband"), body.get("on_delay_s"))
        audit(op, "ALARM_CONFIG", alarm_id, cfg)
        return cfg

    @r.get("/alarms/history")
    def alarm_history(limit: int = 200, alarm_id: Optional[str] = None, persisted: bool = False):
        if persisted:
            return store.query_alarm_events(min(limit, 2000), alarm_id)
        return al.get_event_history(min(limit, 2000), alarm_id)

    # assets
    @r.get("/assets/meta")
    def assets_meta():
        return {"types": ASSET_TYPES, "statuses": ASSET_STATUS}

    @r.get("/assets")
    def assets_list(type: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None):
        rows = store.list_assets(type.upper() if type else None, status.upper() if status else None, q)
        for a in rows:
            st = engine.state_engine.get_device_state(a["device_id"]) if a["device_id"] else None
            a["live_status"] = st.status if st else None
            a["active_alarms"] = len(st.active_alarms) if st else 0
        return rows

    @r.get("/assets/summary")
    def assets_summary():
        rows = store.list_assets()
        by_type: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        for a in rows:
            by_type[a["type"]] = by_type.get(a["type"], 0) + 1
            by_status[a["status"]] = by_status.get(a["status"], 0) + 1
        return {"total": len(rows), "by_type": by_type, "by_status": by_status}

    @r.get("/assets/{asset_id}")
    def asset_get(asset_id: str):
        a = store.get_asset(asset_id)
        if not a:
            raise HTTPException(404, "Asset not found")
        if a["device_id"]:
            st = engine.state_engine.get_device_state(a["device_id"])
            a["live"] = st.model_dump() if st else None
        return a

    @r.post("/assets")
    def asset_create(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("EDIT_ASSETS"))):
        try:
            a = store.upsert_asset(body)
        except ValidationError as e:
            raise HTTPException(400, str(e))
        audit(op, "ASSET_CREATE", a["asset_id"], {"tag": a["tag"]})
        return a

    @r.put("/assets/{asset_id}")
    def asset_update(asset_id: str, body: Dict[str, Any] = Body(...), op: Operator = Depends(need("EDIT_ASSETS"))):
        try:
            a = store.upsert_asset(body, asset_id)
        except KeyError:
            raise HTTPException(404, "Asset not found")
        except ValidationError as e:
            raise HTTPException(400, str(e))
        audit(op, "ASSET_UPDATE", asset_id, {k: body[k] for k in body if k != "attrs"})
        return a

    @r.delete("/assets/{asset_id}")
    def asset_delete(asset_id: str, op: Operator = Depends(need("EDIT_ASSETS"))):
        if not store.delete_asset(asset_id):
            raise HTTPException(404, "Asset not found")
        audit(op, "ASSET_DELETE", asset_id)
        return {"status": "DELETED"}

    # tsdb
    @r.get("/tsdb/series")
    def tsdb_series():
        return tsdb.series_list()

    @r.get("/tsdb/query")
    def tsdb_query(series: str, t0_ms: Optional[int] = None, t1_ms: Optional[int] = None, seconds: Optional[float] = None,
                   bucket_ms: Optional[int] = None, agg: str = "avg", limit: int = 2000):
        if seconds is not None and t0_ms is None:
            t1 = t1_ms or int(time.time() * 1000)
            t0_ms, t1_ms = int(t1 - seconds * 1000), t1
        try:
            return tsdb.query(series, t0_ms, t1_ms, bucket_ms, agg, limit)
        except ValueError as e:
            raise HTTPException(400, str(e))

    @r.get("/tsdb/stats")
    def tsdb_stats():
        tsdb.flush()
        with tsdb._conn() as c:
            n, t0, t1, ns = c.execute("SELECT COUNT(*), MIN(ts_ms), MAX(ts_ms), COUNT(DISTINCT series) FROM ts_samples").fetchone()
        return {"rows": n, "series": ns, "oldest_ms": t0, "newest_ms": t1, "retention_s": tsdb.retention_ms / 1000,
                "resolution": "millisecond timestamps; samples written every simulation tick (100 ms at 1x)"}

    # trends
    @r.get("/trends/compare")
    def trends_compare(series: str, seconds: float = 120.0, bucket_ms: Optional[int] = None, normalize: bool = False,
                       shift_s: float = 0.0, max_points: int = 400):
        names = [s for s in series.split(",") if s][:8]
        if not names:
            raise HTTPException(400, "series required")
        t1 = int(time.time() * 1000)
        t0 = int(t1 - seconds * 1000)
        bucket = bucket_ms or max(100, int(seconds * 1000 / max_points))
        out, grids = [], []
        for nm in names:
            q = tsdb.query(nm, t0, t1, bucket, "avg", max_points + 5)
            pts = q["points"]
            prev = tsdb.query(nm, t0 - int(shift_s * 1000), t1 - int(shift_s * 1000), bucket, "avg", max_points + 5)["points"] if shift_s > 0 else []
            vals = np.array([p["v"] for p in pts], dtype=float)
            stats = ({"min": float(vals.min()), "max": float(vals.max()), "mean": float(vals.mean()), "std": float(vals.std()),
                      "last": float(vals[-1]), "n": int(len(vals)),
                      "slope_per_min": float(np.polyfit(np.arange(len(vals)) * bucket / 60000.0, vals, 1)[0]) if len(vals) > 3 else 0.0}
                     if len(vals) else None)
            lo, hi = (stats["min"], stats["max"]) if stats else (0, 1)
            scale = (hi - lo) or 1.0
            if normalize and stats:
                for p in pts:
                    p["v"] = (p["v"] - lo) / scale
                for p in prev:
                    p["v"] = (p["v"] - lo) / scale
            out.append({"series": nm, "unit": q["unit"], "points": [{"t": p["t"], "v": p["v"]} for p in pts],
                        "previous": [{"t": p["t"] + int(shift_s * 1000), "v": p["v"]} for p in prev], "stats": stats})
            grids.append({p["t"]: p["v"] for p in pts})
        corr = []
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                common = sorted(set(grids[i]) & set(grids[j]))
                if len(common) > 5:
                    a = np.array([grids[i][t] for t in common]); b = np.array([grids[j][t] for t in common])
                    c = float(np.corrcoef(a, b)[0, 1]) if a.std() > 1e-12 and b.std() > 1e-12 else None
                    corr.append({"a": names[i], "b": names[j], "pearson": None if c is None else round(c, 3), "n": len(common)})
        return {"t0": t0, "t1": t1, "bucket_ms": bucket, "normalized": normalize, "shift_s": shift_s, "series": out, "correlations": corr}

    # PID
    @r.post("/pid/simulate")
    def pid_simulate(body: Dict[str, Any] = Body(...)):
        try:
            return pid_studio.simulate_step(float(body.get("kp", 1)), float(body.get("ki", 0)), float(body.get("kd", 0)),
                                            **_plant(body), setpoint=float(body.get("setpoint", 1)), duration=float(body.get("duration", 40)))
        except (ValueError, TypeError) as e:
            raise HTTPException(400, str(e))

    def _plant(body):
        return {"plant_k": float(body.get("plant_k", 1.0)), "tau": float(body.get("tau", 5.0)), "theta": float(body.get("theta", 0.5))}

    @r.post("/pid/compare")
    def pid_compare(body: Dict[str, Any] = Body(...)):
        try:
            return pid_studio.compare(body.get("runs", []), _plant(body), float(body.get("setpoint", 1)), float(body.get("duration", 40)))
        except (ValueError, TypeError) as e:
            raise HTTPException(400, str(e))

    @r.get("/pid/suggest")
    def pid_suggest(k: float = 1.0, tau: float = 5.0, theta: float = 0.5):
        return pid_studio.suggest(k, tau, theta)

    @r.get("/pid/live")
    def pid_live(seconds: float = 120.0):
        p = engine.process
        return {"loop": "PROC_VALVE_01 pH neutralization", "kp": p.kp, "ki": p.ki, "kd": p.kd, "setpoint": p.ph_setpoint,
                "enabled": p.pid_enabled, "pv": tsdb.window("PROC_TANK_01:ph_value", seconds, 300),
                "out": tsdb.window("PROC_VALVE_01:position_pct", seconds, 300),
                "note": "Gains apply to the running process model immediately. Scenario reset restores defaults (18 / 1.2 / 0.5)."}

    @r.post("/pid/live")
    def pid_live_set(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("PID_TUNE"))):
        p = engine.process
        new = {}
        for k in ("kp", "ki", "kd"):
            if k in body:
                v = float(body[k])
                if not (0.0 <= v <= 200.0):
                    raise HTTPException(400, f"{k} must be within [0, 200]")
                new[k] = v
        if "setpoint" in body:
            sp = float(body["setpoint"])
            if not (5.0 <= sp <= 9.0):
                raise HTTPException(400, "pH setpoint must be within [5, 9]")
            new["ph_setpoint"] = sp
        old = {"kp": p.kp, "ki": p.ki, "kd": p.kd, "ph_setpoint": p.ph_setpoint}
        for k, v in new.items():
            setattr(p, k, v)
        if new.get("ki") is not None or new.get("kp") is not None:
            p.pid_integral = 0.0     # bumpless-ish: clear the integrator when gains change
        audit(op, "PID_LIVE_TUNE", "PROC_VALVE_01", {"old": old, "new": new})
        return {"status": "APPLIED", "old": old, "new": new}

    @r.post("/pid/live/disturb")
    def pid_disturb(delta: float = 0.8, op: Operator = Depends(need("PID_TUNE"))):
        engine.inject_fault("PROC_TANK_01", "PH_EXCURSION", {"delta": max(-2.0, min(2.0, delta))})
        audit(op, "PID_DISTURBANCE", "PROC_TANK_01", {"delta": delta})
        return {"status": "DISTURBANCE_APPLIED", "delta": delta, "ph": engine.process.ph_value}

    # scenarios
    @r.get("/scenarios")
    def scenarios_list():
        return scn.catalog()

    @r.get("/scenarios/status")
    def scenario_status():
        return engine.scenario_status()

    @r.post("/scenarios/{scenario_id}/run")
    def scenario_run(scenario_id: str, op: Operator = Depends(need("SCENARIO_RUN"))):
        sc = scn.SCENARIOS.get(scenario_id)
        if not sc:
            raise HTTPException(404, "Unknown scenario")
        engine.load_scenario(sc.model_copy(deep=True))
        audit(op, "SCENARIO_RUN", scenario_id)
        return engine.scenario_status()

    @r.post("/scenarios/stop")
    def scenario_stop(op: Operator = Depends(need("SCENARIO_RUN"))):
        engine.reset()
        audit(op, "SCENARIO_STOP")
        return engine.scenario_status()

    # maintenance
    def _assess(dev: str):
        tel = engine.state_engine.get_device_state(dev).telemetry
        cur = {f["point"]: tel[f["point"]].value for f in maintenance.MACHINES[dev] if f["point"] in tel}
        win = {f["point"]: tsdb.window(f"{dev}:{f['point']}", 300, 200) for f in maintenance.MACHINES[dev]}
        return maintenance.assess(dev, cur, win)

    @r.get("/maintenance")
    def maintenance_all():
        return {"machines": [_assess(d) for d in maintenance.MACHINES], "is_estimate": True, "disclaimer": maintenance.DISCLAIMER}

    @r.get("/maintenance/{device_id}")
    def maintenance_one(device_id: str):
        if device_id not in maintenance.MACHINES:
            raise HTTPException(404, "No maintenance model for this device")
        return _assess(device_id)

    # energy
    @r.get("/energy/report")
    def energy_report():
        return ctx.energy.report()

    @r.get("/energy/report.csv")
    def energy_csv():
        return Response(content=ctx.energy.csv(), media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=goksystem_energy_report.csv"})

    @r.post("/energy/reset")
    def energy_reset(op: Operator = Depends(need("SIM_PAUSE"))):
        ctx.energy.reset()
        audit(op, "ENERGY_RESET")
        return {"status": "OK"}

    # PLC
    plc = ctx.plc

    @r.get("/plc")
    def plc_state():
        return plc.snapshot()

    @r.put("/plc/program")
    def plc_load(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("PLC_EDIT"))):
        try:
            plc.load_program(body)
        except PLCError as e:
            raise HTTPException(400, {"errors": e.errors})
        audit(op, "PLC_PROGRAM_LOAD", body.get("name", ""), {"rungs": len(body.get("rungs", []))})
        return plc.snapshot()

    @r.post("/plc/default-program")
    def plc_default(op: Operator = Depends(need("PLC_EDIT"))):
        plc.load_program(DEFAULT_PROGRAM)
        audit(op, "PLC_PROGRAM_DEFAULT")
        return plc.snapshot()

    @r.post("/plc/run")
    def plc_run(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("PLC_EDIT"))):
        plc.running = bool(body.get("run", True))
        audit(op, "PLC_RUN" if plc.running else "PLC_STOP")
        return plc.snapshot()

    @r.post("/plc/write-mode")
    def plc_write_mode(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("PLC_EDIT"))):
        plc.write_enabled = bool(body.get("enabled", False))
        audit(op, "PLC_WRITE_MODE", "", {"enabled": plc.write_enabled})
        return plc.snapshot()

    @r.post("/plc/input")
    def plc_input(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("COMMAND"))):
        try:
            plc.set_input(str(body.get("tag")), body.get("value"))
        except PLCError as e:
            raise HTTPException(400, e.errors[0])
        return plc.snapshot()

    @r.post("/plc/force")
    def plc_force(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("PLC_EDIT"))):
        try:
            plc.force(str(body.get("tag")), body.get("value"))
        except PLCError as e:
            raise HTTPException(400, e.errors[0])
        audit(op, "PLC_FORCE", str(body.get("tag")), {"value": body.get("value")})
        return plc.snapshot()

    # twin editor
    @r.get("/twin/layout")
    def twin_layout():
        return {"items": store.list_twin(), "kinds": TWIN_KINDS,
                "devices": [{"device_id": d.device_id, "name": d.name, "domain": d.domain.value} for d in engine.registry.list_all()]}

    @r.post("/twin/items")
    def twin_add(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("EDIT_TWIN"))):
        try:
            if body.get("device_id") and not engine.registry.get(body["device_id"]):
                raise ValidationError("unknown device_id")
            it = store.upsert_twin(body, body.get("item_id"))
        except (ValidationError, ValueError) as e:
            raise HTTPException(400, str(e))
        audit(op, "TWIN_ITEM_SAVE", it["item_id"], {"kind": it["kind"], "x": it["x"], "y": it["y"], "z": it["z"]})
        return it

    @r.put("/twin/items/{item_id}")
    def twin_update(item_id: str, body: Dict[str, Any] = Body(...), op: Operator = Depends(need("EDIT_TWIN"))):
        try:
            if item_id.startswith("DEV:"):
                body = {**body, "device_id": item_id[4:], "kind": body.get("kind", "BOX"), "custom": False}
                body.setdefault("label", item_id[4:])
            it = store.upsert_twin(body, item_id)
        except (ValidationError, ValueError) as e:
            raise HTTPException(400, str(e))
        audit(op, "TWIN_ITEM_SAVE", item_id, {k: body.get(k) for k in ("x", "y", "z", "rot_y", "label")})
        return it

    @r.delete("/twin/items/{item_id}")
    def twin_delete(item_id: str, op: Operator = Depends(need("EDIT_TWIN"))):
        if not store.delete_twin(item_id):
            raise HTTPException(404, "Item not found")
        audit(op, "TWIN_ITEM_DELETE", item_id)
        return {"status": "DELETED"}

    @r.post("/twin/reset")
    def twin_reset(op: Operator = Depends(need("EDIT_TWIN"))):
        store.reset_twin()
        audit(op, "TWIN_RESET")
        return {"status": "RESET"}

    # protocol sim
    @r.get("/protocol-sim")
    def proto_status():
        return ctx.modbus_server.status()

    @r.post("/protocol-sim/start")
    def proto_start(body: Dict[str, Any] = Body(default={}), op: Operator = Depends(need("PROTOCOL_CONTROL"))):
        srv = ctx.modbus_server
        if "port" in body:
            srv.port = int(body["port"])
        if "write_enabled" in body:
            srv.write_enabled = bool(body["write_enabled"])
        try:
            srv.start()
        except OSError as e:
            raise HTTPException(409, f"Cannot bind 127.0.0.1:{srv.port}: {e}")
        audit(op, "PROTOCOL_SIM_START", f"127.0.0.1:{srv.port}", {"write_enabled": srv.write_enabled})
        return srv.status()

    @r.post("/protocol-sim/stop")
    def proto_stop(op: Operator = Depends(need("PROTOCOL_CONTROL"))):
        ctx.modbus_server.stop()
        audit(op, "PROTOCOL_SIM_STOP")
        return ctx.modbus_server.status()

    @r.post("/protocol-sim/write-mode")
    def proto_write(body: Dict[str, Any] = Body(...), op: Operator = Depends(need("PROTOCOL_CONTROL"))):
        ctx.modbus_server.write_enabled = bool(body.get("enabled", False))
        audit(op, "PROTOCOL_SIM_WRITE_MODE", "", {"enabled": ctx.modbus_server.write_enabled})
        return ctx.modbus_server.status()

    return r
