"""Tests for the model contracts, device registry, state engine and security gate."""

import pytest
import os
from goksystem.core.models import (
    DeviceDefinition, DeviceType, DomainType, Severity, AlarmState, CommandRequest
)
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.scada.security import SecurityManager
from goksystem.historian.storage import HistorianStorage


def test_device_registry_prepopulated():
    reg = DeviceRegistry()
    devices = reg.list_all()
    assert len(devices) >= 12, "Must contain all pre-configured domain devices"
    
    fac_devs = reg.list_by_domain(DomainType.FACTORY)
    grid_devs = reg.list_by_domain(DomainType.GRID)
    proc_devs = reg.list_by_domain(DomainType.PROCESS)
    bld_devs = reg.list_by_domain(DomainType.BUILDING)
    
    assert len(fac_devs) >= 3
    assert len(grid_devs) >= 3
    assert len(proc_devs) >= 3
    assert len(bld_devs) >= 3


def test_state_engine_delta_tracking():
    reg = DeviceRegistry()
    engine = StateEngine(reg)
    
    # Initially dirty on startup
    dirty1 = engine.pop_dirty_snapshot()
    assert len(dirty1) >= 12
    
    # Second pop should be empty (no changes)
    dirty2 = engine.pop_dirty_snapshot()
    assert len(dirty2) == 0
    
    # Update single point
    engine.update_telemetry("FAC_CONVEYOR_01", "speed", 2.4, "m/s", sim_time=1.0)
    dirty3 = engine.pop_dirty_snapshot()
    assert len(dirty3) == 1
    assert "FAC_CONVEYOR_01" in dirty3
    assert dirty3["FAC_CONVEYOR_01"].telemetry["speed"].value == 2.4


def test_security_rbac_and_safety_gates():
    sec = SecurityManager()
    
    # 1. Viewer trying to execute control command -> Rejected
    cmd_viewer = CommandRequest(
        command_id="cmd_01",
        target_device="FAC_CONVEYOR_01",
        operation="START",
        user_role="VIEWER"
    )
    valid, reason = sec.validate_command(cmd_viewer)
    assert not valid
    assert "Forbidden" in reason
    
    # 2. Operator executing valid control -> Accepted
    cmd_op = CommandRequest(
        command_id="cmd_02",
        target_device="FAC_CONVEYOR_01",
        operation="START",
        user_role="OPERATOR"
    )
    valid, reason = sec.validate_command(cmd_op)
    assert valid
    
    # 3. Excessive speed parameter safety gate (> 3.5 m/s) -> Rejected
    cmd_unsafe = CommandRequest(
        command_id="cmd_03",
        target_device="FAC_CONVEYOR_01",
        operation="SET_SPEED",
        parameters={"speed": 8.0},
        user_role="OPERATOR"
    )
    valid, reason = sec.validate_command(cmd_unsafe)
    assert not valid
    assert "Safety Gate Rejection" in reason


def test_historian_strict_isolation_guard(tmp_path):
    # Allowed isolated path
    db_file = str(tmp_path / "test_isolated.db")
    h = HistorianStorage(db_file)
    assert os.path.exists(db_file)
    
    # Forbidden legacy paths must raise ValueError
    with pytest.raises(ValueError, match="SECURITY VIOLATION"):
        HistorianStorage(r"C:raclar\PROJELER\projelerim\iot simulation project	est.db")
        
    with pytest.raises(ValueError, match="SECURITY VIOLATION"):
        HistorianStorage(r"C:	est\digital_twin.db")
