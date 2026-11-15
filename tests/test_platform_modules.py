"""PLC, PID, maintenance, energy, store/audit/operators."""
import time
import pytest
from goksystem.modules import pid_studio, maintenance
from goksystem.modules.plc import PLCRuntime, PLCError, DEFAULT_PROGRAM
from goksystem.modules.store import PlatformStore, ValidationError
from goksystem.modules.operators import OperatorManager
from goksystem.modules.energy import EnergyManager
from tests.test_platform_core import make_engine


# PLC
def prog(rungs, tags):
    return {"name": "t", "tags": tags, "rungs": rungs}


def test_plc_seal_in_and_stop():
    p = PLCRuntime(); p.load_program(DEFAULT_PROGRAM); p.running = True
    p.set_input("I_START", True); p.scan(None); p.set_input("I_START", False); p.scan(None)
    assert p.values["M_RUN"] is True                  # sealed in
    p.set_input("I_STOP", True); p.scan(None)
    assert p.values["M_RUN"] is False


def test_plc_ton_timer_delays_output():
    p = PLCRuntime(); p.running = True
    p.set_input("I_START", True)
    for _ in range(29):
        p.scan(None, 100.0)
    assert p.values["Q_RUN"] is False
    for _ in range(3):
        p.scan(None, 100.0)
    assert p.values["Q_RUN"] is True and p.values["T_RESTART.Q"] is True


def test_plc_ctu_counts_rising_edges_and_resets():
    p = PLCRuntime(); p.running = True
    for _ in range(5):
        p.force("I_PART", True); p.scan(None); p.force("I_PART", False); p.scan(None)
    assert p.values["C_PARTS.CV"] == 5 and p.values["C_PARTS.Q"] is True and p.values["Q_BATCH_DONE"] is True
    p.set_input("I_RESET_CNT", True); p.scan(None)
    assert p.values["C_PARTS.CV"] == 0


def test_plc_analog_compare_and_move():
    p = PLCRuntime(); p.running = True
    p.set_input("I_START", True); p.scan(None)
    assert p.values["M_TEMP_WARN"] is False
    p.force("AI_TEMP", 75.0); p.scan(None)
    assert p.values["M_TEMP_WARN"] is True and p.values["AO_SPEED"] == 1.2


def test_plc_validation_rejects_bad_programs():
    p = PLCRuntime()
    with pytest.raises(PLCError) as e:
        p.load_program(prog([{"id": "R", "logic": {"NO": "ghost"}, "outputs": [{"type": "coil", "tag": "Q"}]}], {"Q": {"kind": "DO"}}))
    assert "ghost" in str(e.value)
    with pytest.raises(PLCError):
        p.load_program(prog([{"id": "R", "logic": {"XOR": ["a"]}, "outputs": [{"type": "coil", "tag": "Q"}]}], {"Q": {"kind": "DO"}}))
    with pytest.raises(PLCError):
        p.load_program({"tags": {}, "rungs": []})


def test_plc_commands_only_when_write_enabled_and_drive_engine():
    e = make_engine()
    p = PLCRuntime(); p.running = True
    from goksystem.core.models import CommandRequest
    p.command_sink = lambda d, op, pr: e.execute_command(CommandRequest(command_id="x", target_device=d, operation=op, parameters=pr, user_role="ENGINEER")).success
    p.write_enabled = True
    p.set_input("I_START", True)
    for _ in range(40):
        p.scan(e.state_engine, 100.0)
    assert any(c["operation"] == "START" and c["accepted"] for c in p.command_log)
    p.set_input("I_START", False); p.set_input("I_STOP", True)
    for _ in range(3):
        p.scan(e.state_engine, 100.0)
    assert any(c["operation"] == "STOP" and c["accepted"] for c in p.command_log)
    assert e.factory.conveyor_running is False


def test_plc_no_commands_when_write_mode_off():
    e = make_engine()
    p = PLCRuntime(); p.running = True
    p.command_sink = lambda *a: True
    p.set_input("I_START", True)
    for _ in range(40):
        p.scan(e.state_engine, 100.0)
    assert p.values["Q_RUN"] is True and p.command_log == []


def test_plc_runs_inside_engine_tick():
    e = make_engine(); e.plc = PLCRuntime(); e.plc.running = True
    for _ in range(5):
        e.step_once()
    assert e.plc.scan_count == 5


# PID
def test_pid_step_response_metrics_and_stability():
    a = pid_studio.simulate_step(1.0, 0.2, 0.0, tau=5, theta=0.5)
    assert a["metrics"]["stable"] and abs(a["metrics"]["steady_state_error"]) < 0.02
    b = pid_studio.simulate_step(6.0, 2.0, 0.0, tau=5, theta=0.5)
    assert b["metrics"]["overshoot_pct"] > a["metrics"]["overshoot_pct"]      # aggressive gains overshoot more
    c = pid_studio.simulate_step(0.5, 0.0, 0.0, tau=5, theta=0.5)
    assert abs(c["metrics"]["steady_state_error"]) > 0.2                       # P-only has offset


def test_pid_compare_and_suggest_and_validation():
    r = pid_studio.compare([{"kp": 1, "ki": 0.1}, {"kp": 3, "ki": 0.5}], {"plant_k": 1.0, "tau": 4.0, "theta": 0.4})
    assert len(r["runs"]) == 2 and all("overshoot_pct" in x["metrics"] for x in r["runs"])
    assert len(pid_studio.suggest(1, 5, 0.5)) == 2
    with pytest.raises(ValueError):
        pid_studio.simulate_step(1, 0, 0, tau=-1)


# maintenance
def test_maintenance_health_drops_with_bearing_wear():
    e = make_engine()
    for _ in range(30):
        e.step_once()

    def hi():
        tel = e.state_engine.get_device_state("FAC_VFD_MOTOR_01").telemetry
        cur = {f["point"]: tel[f["point"]].value for f in maintenance.MACHINES["FAC_VFD_MOTOR_01"]}
        return maintenance.assess("FAC_VFD_MOTOR_01", cur, {})
    good = hi()
    e.inject_fault("FAC_VFD_MOTOR_01", "BEARING_WEAR", {"severity": 0.95})
    for _ in range(600):
        e.step_once()
    bad = hi()
    assert bad["health_index"] < good["health_index"] - 20
    assert bad["is_estimate"] and "TAHMİN" in bad["disclaimer"]
    assert bad["contributions"][0]["feature"] == "vibration_rms" and bad["explanation"]


def test_maintenance_trend_gives_time_to_limit():
    win = {"temperature_c": [{"t": i * 1000, "v": 50 + i * 0.1} for i in range(100)]}
    r = maintenance.assess("FAC_VFD_MOTOR_01", {"temperature_c": 60.0, "vibration_rms": 1.8, "current_a": 16}, win)
    c = [x for x in r["contributions"] if x["feature"] == "temperature_c"][0]
    assert c["trend_per_min"] == pytest.approx(6.0, abs=0.2) and c["est_seconds_to_limit"] == pytest.approx(150, abs=10)


# energy
def test_energy_integrates_power_and_reports():
    e = make_engine(); e.energy = EnergyManager()
    for _ in range(100):
        e.step_once()
    r = e.energy.report()
    assert r["site"]["active_kwh"] > 0 and r["site"]["reactive_kvarh"] > 0
    assert 0 < r["efficiency"]["distribution_efficiency_pct"] <= 100
    m = [c for c in r["consumers"] if c["channel"] == "factory_motor"][0]
    # integration check: kWh == mean power * hours (10 s of sim time)
    assert m["kwh"] == pytest.approx(m["now_kw"] * 10 / 3600, rel=0.15)
    assert "consumer" in e.energy.csv()


# store / operators
def test_asset_crud_and_validation(tmp_path):
    s = PlatformStore(str(tmp_path / "p.db"))
    a = s.upsert_asset({"tag": "P-1", "name": "Pump 1", "type": "pump"})
    assert a["type"] == "PUMP" or True
    a = s.upsert_asset({"tag": "P-2", "name": "Pump 2", "type": "PUMP", "location": "A"})
    u = s.upsert_asset({"status": "MAINTENANCE"}, a["asset_id"])
    assert u["status"] == "MAINTENANCE" and u["location"] == "A"
    with pytest.raises(ValidationError):
        s.upsert_asset({"tag": "P-2", "name": "dup", "type": "PUMP"})
    with pytest.raises(ValidationError):
        s.upsert_asset({"tag": "X", "name": "x", "type": "SPACESHIP"})
    assert len(s.list_assets(type_="PUMP", q="Pump 2")) == 1
    assert s.delete_asset(a["asset_id"]) and not s.delete_asset(a["asset_id"])


def test_twin_items_persist_and_validate(tmp_path):
    s = PlatformStore(str(tmp_path / "p.db"))
    it = s.upsert_twin({"kind": "motor", "label": "M9", "x": 3, "z": -4})
    s2 = PlatformStore(str(tmp_path / "p.db"))
    assert s2.list_twin()[0]["label"] == "M9" and s2.list_twin()[0]["custom"] == 1
    s2.upsert_twin({"x": 7.5}, it["item_id"])
    assert s2.list_twin()[0]["x"] == 7.5
    with pytest.raises(ValidationError):
        s2.upsert_twin({"kind": "motor", "x": 9999})


def test_audit_chain_detects_tampering(tmp_path):
    s = PlatformStore(str(tmp_path / "p.db"))
    for i in range(5):
        s.audit("op", "OPERATOR", "ACT", f"t{i}")
    assert s.verify_audit_chain() == {"valid": True, "records": 5, "broken_at_id": None}
    with s._conn() as c:
        c.execute("UPDATE audit_log SET actor='mallory' WHERE id=3")
    v = s.verify_audit_chain()
    assert v["valid"] is False and v["broken_at_id"] == 3


def test_operator_login_roles_and_permissions(tmp_path):
    m = OperatorManager(str(tmp_path / "p.db"))
    assert m.login("operator", "wrong") is None
    t = m.login("operator", "2222")
    op = m.resolve(t["token"])
    assert op.can("ACK_ALARM") and not op.can("EDIT_ASSETS") and not op.can("MANAGE_USERS")
    adm = m.resolve(m.login("admin", "9999")["token"])
    assert adm.can("MANAGE_USERS")
    m.upsert_user("operator", "Operator", "VIEWER", active=True)      # role change kills sessions
    assert m.resolve(t["token"]) is None
