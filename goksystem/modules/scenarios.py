"""Multi-scenario catalog. Each scenario is a timeline of faults/commands applied to the live engine."""
from typing import Dict, List
from goksystem.core.models import ScenarioDefinition, DomainType


def _fault(t, dev, ft, **p):
    return {"trigger_at_sec": t, "kind": "fault", "target_device": dev, "fault_type": ft, "parameters": p,
            "label": f"{ft} on {dev}"}


def _cmd(t, dev, op, **p):
    return {"trigger_at_sec": t, "kind": "command", "target_device": dev, "operation": op, "parameters": p,
            "label": f"{op} {dev}"}


SCENARIOS: Dict[str, ScenarioDefinition] = {
    "normal": ScenarioDefinition(
        scenario_id="normal", name="Normal operation", domain=DomainType.SYSTEM, duration_sec=60.0,
        description="Baseline plant behaviour with no injected events.",
        initial_conditions={"factory.conveyor_target_speed": 1.8, "factory.conveyor_load_kg": 125.0},
        scheduled_faults=[]),
    "fault": ScenarioDefinition(
        scenario_id="fault", name="Cascading faults", domain=DomainType.SYSTEM, duration_sec=120.0,
        description="Bearing wear, motor overload, tank drain blockage and an 11 kV overcurrent trip in sequence.",
        initial_conditions={"factory.conveyor_target_speed": 2.0},
        scheduled_faults=[
            _fault(10, "FAC_VFD_MOTOR_01", "BEARING_WEAR", severity=0.85),
            _fault(25, "FAC_VFD_MOTOR_01", "MOTOR_OVERLOAD", load_kg=230.0),
            _fault(45, "PROC_TANK_01", "DRAIN_BLOCKAGE"),
            _fault(70, "PROC_PUMP_01", "PUMP_BEARING_WEAR", severity=0.7),
            _fault(95, "GRID_BREAKER_01", "OVERCURRENT_TRIP"),
        ]),
    "maintenance": ScenarioDefinition(
        scenario_id="maintenance", name="Planned maintenance", domain=DomainType.SYSTEM, duration_sec=90.0,
        description="Conveyor and pump are stopped for maintenance, then restarted.",
        scheduled_faults=[
            _cmd(5, "FAC_CONVEYOR_01", "STOP"),
            _cmd(5, "PROC_PUMP_01", "STOP"),
            _cmd(70, "PROC_PUMP_01", "START"),
            _cmd(75, "FAC_CONVEYOR_01", "START"),
        ]),
    "emergency_stop": ScenarioDefinition(
        scenario_id="emergency_stop", name="Emergency stop", domain=DomainType.SYSTEM, duration_sec=60.0,
        description="Pull-cord emergency stop at t=5 s, trip reset at t=30 s, restart at t=35 s.",
        scheduled_faults=[
            _cmd(5, "FAC_CONVEYOR_01", "E_STOP"),
            _cmd(30, "FAC_CONVEYOR_01", "RESET_TRIP"),
            _cmd(35, "FAC_CONVEYOR_01", "START"),
        ]),
    "production": ScenarioDefinition(
        scenario_id="production", name="High production", domain=DomainType.SYSTEM, duration_sec=90.0,
        description="Conveyor at high speed and heavy load; observe power, temperature and the overload margin.",
        initial_conditions={"factory.conveyor_target_speed": 2.6, "factory.conveyor_load_kg": 175.0},
        scheduled_faults=[_cmd(40, "FAC_CONVEYOR_01", "SET_SPEED", speed=3.0)]),
}


def catalog() -> List[dict]:
    return [{"scenario_id": s.scenario_id, "name": s.name, "description": s.description, "duration_sec": s.duration_sec,
             "events": [{"t": e["trigger_at_sec"], "label": e.get("label", "")} for e in s.scheduled_faults],
             "initial_conditions": s.initial_conditions} for s in SCENARIOS.values()]
