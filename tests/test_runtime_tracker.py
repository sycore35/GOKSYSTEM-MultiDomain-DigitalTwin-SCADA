"""Run-history tracker: operating hours, start count, trips and status transitions, all on simulation time."""
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.core.engine import SimulationEngine
from goksystem.core.models import CommandRequest
from goksystem.modules.runtime import RuntimeTracker
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager


def make_engine():
    reg = DeviceRegistry()
    e = SimulationEngine(reg, StateEngine(reg), AlarmEngine(), SecurityManager(), None, seed=1, noise_pct=0.0)
    e.runtime = RuntimeTracker()
    return e


def test_tracker_counts_starts_stops_and_run_seconds():
    rt = RuntimeTracker()
    seq = ["ONLINE"] * 5 + ["RUNNING"] * 10 + ["ONLINE"] * 3 + ["RUNNING"] * 2 + ["FAULT"]
    for i, s in enumerate(seq):
        rt.update({"M": s}, dt=0.1, sim_time=round((i + 1) * 0.1, 3))
    h = rt.history("M")
    assert h["starts"] == 2
    assert h["stops"] == 2                      # RUNNING->ONLINE and RUNNING->FAULT
    assert h["trips"] == 1
    assert abs(h["run_seconds"] - 1.2) < 1e-9
    assert abs(h["observed_seconds"] - 2.1) < 1e-9
    assert h["status"] == "FAULT"
    assert [t["to"] for t in h["transitions"]] == ["FAULT", "RUNNING", "ONLINE", "RUNNING"]   # newest first
    assert h["transitions"][-1]["sim_time"] == 0.6
    assert h["last_start_sim_time"] == 1.9


def test_unknown_device_returns_none_and_reset_clears():
    rt = RuntimeTracker()
    rt.update({"M": "RUNNING"}, 0.1, 0.1)
    assert rt.history("X") is None
    rt.reset()
    assert rt.history("M") is None


def test_engine_feeds_tracker_and_motor_accumulates_run_time():
    e = make_engine()
    for _ in range(50):
        e.step_once()
    h = e.runtime.history("FAC_VFD_MOTOR_01")
    assert h["observed_seconds"] > 4.9
    assert h["run_seconds"] > 0
    e.execute_command(CommandRequest(command_id="t1", target_device="FAC_CONVEYOR_01", operation="STOP", parameters={}))
    for _ in range(80):
        e.step_once()
    h2 = e.runtime.history("FAC_VFD_MOTOR_01")
    assert h2["stops"] >= 1
    assert h2["transitions"][0]["from"] == "RUNNING"


def test_tracker_is_deterministic():
    def run():
        e = make_engine()
        for _ in range(120):
            e.step_once()
        return {d: e.runtime.history(d) for d in e.state_engine.device_ids()}
    assert run() == run()


def test_inspection_includes_runtime():
    from goksystem.modules import inspector
    e = make_engine()
    for _ in range(20):
        e.step_once()
    res = inspector.build_inspection(e, None, None, "FAC_VFD_MOTOR_01")
    assert res["runtime"]["observed_seconds"] > 1.9
