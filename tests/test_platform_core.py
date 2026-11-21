"""Engine robustness: determinism, fault isolation, timing profiler, alarm center, TSDB."""
import hashlib
import os
import time
import pytest
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.core.engine import SimulationEngine
from goksystem.core.models import DomainType, AlarmState, Severity
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.modules.tsdb import TimeSeriesDB
from goksystem.modules import scenarios


def make_engine(seed=42, noise=0.0):
    reg = DeviceRegistry()
    return SimulationEngine(reg, StateEngine(reg), AlarmEngine(), SecurityManager(), None, seed=seed, noise_pct=noise)


def traj(seed, steps=400, noise=0.01):
    e = make_engine(seed, noise)
    h = hashlib.sha256()
    for _ in range(steps):
        e.step_once()
        for d, p, v, _u in e.state_engine.iter_points():
            h.update(f"{d}:{p}:{v!r}".encode())
    return h.hexdigest()


def test_determinism_same_seed_identical_trajectory():
    assert traj(7) == traj(7)


def test_different_seed_differs_with_noise():
    assert traj(7) != traj(8)


def test_noise_off_is_seed_independent():
    assert traj(1, noise=0.0) == traj(2, noise=0.0)


def test_exception_in_one_model_does_not_kill_loop():
    e = make_engine()
    def boom(dt, st):
        raise RuntimeError("x")
    e.register_model("boom", boom)
    for _ in range(50):
        e.step_once()
    assert e.step_count == 50
    assert e.profiler.snapshot()["model_errors"]["boom"] == 50
    assert e.state_engine.read_point_value("FAC_CONVEYOR_01", "speed") > 1.0


def test_domain_exception_marks_model_fault_and_others_continue():
    e = make_engine()
    e.step_once()
    e.grid.step = lambda *a, **k: (_ for _ in ()).throw(ValueError("grid broke"))
    t0 = e.state_engine.read_point_value("PROC_TANK_01", "level_pct")
    for _ in range(20):
        e.step_once()
    assert e.state_engine.get_device_state("GRID_TRAFO_01").status == "MODEL_FAULT"
    assert e.state_engine.get_device_state("PROC_TANK_01").status != "MODEL_FAULT"
    assert e.profiler.snapshot()["model_errors"]["grid"] == 20


@pytest.mark.skipif(os.environ.get("CI") == "true", reason="wall-clock timing is not meaningful on shared CI runners")
def test_realtime_loop_timing_stats():
    e = make_engine()
    e.start()
    time.sleep(3.0)
    e.stop()
    s = e.profiler.snapshot()
    assert s["ticks"] >= 25
    assert s["step_duration_ms"]["p99"] < 50
    assert s["period_error_abs_ms"]["p95"] < 20      # generous bound; measured values are reported in the report
    assert set(s["step_duration_ms"]) >= {"p50", "p95", "p99"}


def test_start_after_pause_does_not_spawn_second_thread():
    e = make_engine()
    e.start(); e.pause(); e.start()
    names = [t.name for t in __import__("threading").enumerate() if t.name == "GoksystemSimLoop"]
    e.stop()
    assert len(names) == 1


def test_motor_publishes_current_rpm_temp_vibration():
    e = make_engine()
    for _ in range(30):
        e.step_once()
    tel = e.state_engine.get_device_state("FAC_VFD_MOTOR_01").telemetry
    for k in ("current_a", "rpm", "temperature_c", "vibration_rms", "power_kw"):
        assert k in tel and tel[k].value > 0
    pump = e.state_engine.get_device_state("PROC_PUMP_01").telemetry
    assert pump["current_a"].value > 0 and pump["temperature_c"].value > 0


def test_bearing_fault_raises_vibration_and_alarm_status():
    e = make_engine()
    e.inject_fault("FAC_VFD_MOTOR_01", "BEARING_WEAR", {"severity": 0.95})
    for _ in range(20):
        e.step_once()
    st = e.state_engine.get_device_state("FAC_VFD_MOTOR_01")
    assert "ALM_FAC_VIBRATION" in st.active_alarms
    assert st.status == "FAULT"
    assert e.inject_fault("NOPE", "NOPE", {}) is False


def test_scenario_events_fire_once_in_order():
    e = make_engine()
    e.load_scenario(scenarios.SCENARIOS["emergency_stop"].model_copy(deep=True))
    for _ in range(80):
        e.step_once()
    st = e.scenario_status()
    assert [x["fired"] for x in st["events"]][0] is True
    assert e.factory.pull_cord_tripped is True
    assert len(e.scenario_log) == 1
    for _ in range(650):
        e.step_once()
    assert e.factory.pull_cord_tripped is False and e.factory.conveyor_running is True
    assert len(e.scenario_log) == 3 and e.scenario_status()["finished"]


# alarm center
def trip(a, v, t=1.0, **kw):
    return a.evaluate_limit("A1", "DEV", "tag", DomainType.FACTORY, v, 100.0, True, Severity.HIGH, "m", t, **kw)


def test_alarm_priority_and_lifecycle_with_retrip():
    a = AlarmEngine()
    r = trip(a, 120)
    assert r.priority == 2 and r.state == AlarmState.UNACK_ALARM
    trip(a, 50, 2)                                   # clears before ack
    assert a.get_all_alarms()[0].state == AlarmState.RTN_UNACK
    trip(a, 130, 3)                                  # re-trip
    assert a.get_all_alarms()[0].state == AlarmState.UNACK_ALARM
    assert a.acknowledge_alarm("A1", "op1")
    trip(a, 10, 4)
    assert a.get_all_alarms()[0].state == AlarmState.NORMAL


def test_deadband_prevents_chatter():
    a = AlarmEngine()
    trip(a, 120); a.acknowledge_alarm("A1", "o")
    trip(a, 99.5, 2)            # below limit but inside 1.5 % deadband -> still active
    assert a.get_all_alarms()[0].state == AlarmState.ACK_ALARM
    trip(a, 90, 3)
    assert a.get_all_alarms()[0].state == AlarmState.NORMAL


def test_custom_deadband_and_on_delay():
    a = AlarmEngine()
    a.configure_alarm("A1", deadband=20.0, on_delay_s=2.0)
    assert trip(a, 120, 1.0) is None and a.get_active_alarms() == []
    assert trip(a, 120, 3.5) is not None
    a.acknowledge_alarm("A1", "o")
    trip(a, 90, 4)              # 90 > 100-20? no: 90 < 80 false -> still active
    assert a.get_all_alarms()[0].state == AlarmState.ACK_ALARM


def test_shelve_requires_reason_hides_and_unshelves():
    a = AlarmEngine()
    trip(a, 120)
    assert a.shelve_alarm("A1", "op", 60, "")[0] is False
    assert a.shelve_alarm("A1", "op", 60, "sensor drifting")[0] is True
    assert a.get_active_alarms() == [] and len(a.get_shelved_alarms()) == 1
    trip(a, 130, 2)             # condition remains while shelved
    assert a.unshelve_alarm("A1", "op")
    assert a.get_active_alarms()[0].state == AlarmState.UNACK_ALARM


def test_shelve_expires_automatically():
    a = AlarmEngine()
    trip(a, 120)
    a.shelve_alarm("A1", "op", 0.05, "test")
    time.sleep(0.1)
    assert a.get_active_alarms()[0].state == AlarmState.UNACK_ALARM


def test_history_and_statistics():
    a = AlarmEngine()
    trip(a, 120); a.acknowledge_alarm("A1", "op1"); trip(a, 10, 2)
    hist = a.get_event_history()
    assert [h["to_state"] for h in hist][::-1] == ["UNACK_ALARM", "ACK_ALARM", "NORMAL"]
    st = a.get_statistics()
    assert st["alarms_in_window"] == 1 and st["by_priority"][2] == 1 and st["bad_actors"][0]["alarm_id"] == "A1"


# tsdb
def test_tsdb_ms_storage_downsampling_and_auto_bucket(tmp_path):
    db = TimeSeriesDB(str(tmp_path / "t.db"), autoflush=False)
    base = 1_000_000
    db.record_many([("S", float(i), "u") for i in range(0)], base)
    for i in range(1000):
        db.record("S", float(i), base + i * 10, "u")        # 10 ms resolution
    raw = db.query("S", base, base + 9990, limit=5000)
    assert raw["raw_count"] == 1000 and len(raw["points"]) == 1000 and raw["bucket_ms"] is None
    ds = db.query("S", base, base + 9990, bucket_ms=1000, agg="avg")
    assert len(ds["points"]) == 10 and ds["points"][0]["n"] == 100
    assert abs(ds["points"][0]["v"] - 49.5) < 1e-9
    auto = db.query("S", base, base + 9990, limit=100)
    assert auto["auto_bucket"] and len(auto["points"]) <= 100
    with pytest.raises(ValueError):
        db.query("S", agg="median")


def test_tsdb_records_from_engine(tmp_path):
    e = make_engine()
    e.tsdb = TimeSeriesDB(str(tmp_path / "t.db"), autoflush=False)
    for _ in range(20):
        e.step_once()
        time.sleep(0.002)      # ms timestamps: steps faster than 1 ms would share a key
    e.tsdb.flush()
    q = e.tsdb.query("FAC_VFD_MOTOR_01:rpm", 0, int(time.time() * 1000) + 1000, limit=100)
    assert q["raw_count"] == 20
