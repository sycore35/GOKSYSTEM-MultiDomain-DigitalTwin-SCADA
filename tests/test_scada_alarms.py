"""Alarm state machine tests."""

import pytest
from goksystem.scada.alarm_engine import AlarmEngine, AlarmState, Severity
from goksystem.core.models import DomainType


def test_isa18_2_alarm_lifecycle():
    engine = AlarmEngine()
    
    # 1. Normal condition -> Limit exceeded -> UNACK_ALARM
    rec = engine.evaluate_limit(
        alarm_id="ALM_TEST_01",
        source_device="FAC_MOTOR_01",
        tag_id="temp_c",
        domain=DomainType.FACTORY,
        current_val=82.0,
        limit_val=75.0,
        is_high_alarm=True,
        severity=Severity.HIGH,
        message="High Temperature",
        sim_time=1.0
    )
    assert rec is not None
    assert rec.state == AlarmState.UNACK_ALARM
    
    # 2. Operator acknowledges -> ACK_ALARM
    success = engine.acknowledge_alarm("ALM_TEST_01", operator_id="admin_01")
    assert success is True
    active = engine.get_active_alarms()
    assert len(active) == 1
    assert active[0].state == AlarmState.ACK_ALARM
    assert active[0].ack_by == "admin_01"
    
    # 3. Value returns within limits (considering deadband) -> Cleared to NORMAL
    rec_clear = engine.evaluate_limit(
        alarm_id="ALM_TEST_01",
        source_device="FAC_MOTOR_01",
        tag_id="temp_c",
        domain=DomainType.FACTORY,
        current_val=70.0,
        limit_val=75.0,
        is_high_alarm=True,
        severity=Severity.HIGH,
        message="High Temperature",
        sim_time=2.0
    )
    assert rec_clear is not None
    assert rec_clear.state == AlarmState.NORMAL
    # Should no longer be in active alarms
    assert len(engine.get_active_alarms()) == 0


def test_rtn_unack_transition():
    """Alarm clears before operator acknowledges -> transitions to RTN_UNACK."""
    engine = AlarmEngine()
    
    # Trip
    engine.evaluate_limit("ALM_02", "DEV", "tag", DomainType.PROCESS, 95.0, 90.0, True, Severity.MEDIUM, "msg", 1.0)
    
    # Clears before Ack
    rec = engine.evaluate_limit("ALM_02", "DEV", "tag", DomainType.PROCESS, 80.0, 90.0, True, Severity.MEDIUM, "msg", 2.0)
    assert rec.state == AlarmState.RTN_UNACK
    
    # Operator acknowledges historical trip -> transitions to NORMAL
    success = engine.acknowledge_alarm("ALM_02", "operator_1")
    assert success is True
    assert len(engine.get_active_alarms()) == 0
