"""Factory I/O adapter tests: tag mapping and scaling, command interlock, stale-data watchdog, malformed frames."""

import pytest
import time
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.core.models import Quality
from goksystem.protocols.factoryio_adapter import (
    FactoryIOAdapter, FactoryIOConfig, ConnectionState,
    TagDefinition, TagDataType, TagDirection, SORTING_BY_HEIGHT_TAGS
)


@pytest.fixture
def state_engine():
    reg = DeviceRegistry()
    return StateEngine(reg)


@pytest.fixture
def mock_adapter(state_engine):
    cfg = FactoryIOConfig(
        host="127.0.0.1",
        port=5020,
        scene_name="Sorting by Height",
        stale_timeout_sec=0.25,
        command_mode_enabled=False
    )
    adapter = FactoryIOAdapter(state_engine, config=cfg)
    adapter.enable_mock_mode(True)
    return adapter


def test_factoryio_initial_state(mock_adapter):
    """Adapter begins in MOCK_SIMULATION mode when mock enabled, with command safety interlock."""
    status = mock_adapter.get_status()
    assert status["connected"] is True
    assert status["state"] == ConnectionState.MOCK_SIMULATION.value
    assert status["command_mode_enabled"] is False
    assert status["scene_name"] == "Sorting by Height"
    assert status["is_stale"] is False
    assert "hardware_status" in status
    assert "NOT VERIFIED" in status["hardware_status"]


def test_factoryio_discrete_sensor_ingestion(mock_adapter, state_engine):
    """Discrete sensors (photo-eyes, inductive switches) map to StateEngine boolean telemetry."""
    # Set mock discrete input 0 (AtEntry) and 3 (HeightHigh) to True
    mock_adapter._mock_discrete[0] = True
    mock_adapter._mock_discrete[3] = True
    
    success = mock_adapter.poll_once()
    assert success is True
    
    # Verify in adapter current values
    assert mock_adapter.current_values["AtEntry"] is True
    assert mock_adapter.current_values["HeightHigh"] is True
    assert mock_adapter.current_values["AtExit"] is False
    
    # Verify in StateEngine
    dev_state = state_engine.get_device_state("FAC_CONVEYOR_01")
    assert dev_state is not None
    entry_pt = dev_state.telemetry.get("sensor_entry")
    assert entry_pt is not None
    assert entry_pt.value == 1.0
    assert entry_pt.quality == Quality.GOOD


def test_factoryio_analog_scaling(mock_adapter, state_engine):
    """Analog registers scale correctly from raw 0..1000 to engineering units 0..100 mm."""
    # OpticalHeightGauge raw_min=0, raw_max=1000, eng_min=0, eng_max=100 mm
    # Set raw value 450 -> should scale to 45.0 mm
    mock_adapter._mock_input_regs[0] = 450
    # WeightScale raw_min=0, raw_max=5000, eng_min=0, eng_max=50 kg
    # Set raw value 2500 -> should scale to 25.0 kg
    mock_adapter._mock_input_regs[1] = 2500
    
    mock_adapter.poll_once()
    
    assert mock_adapter.current_values["OpticalHeightGauge"] == 45.0
    assert mock_adapter.current_values["WeightScale"] == 25.0
    
    dev_state = state_engine.get_device_state("FAC_CONVEYOR_01")
    assert dev_state is not None
    height_pt = dev_state.telemetry.get("optical_height_mm")
    assert height_pt is not None
    assert height_pt.value == 45.0
    assert height_pt.unit == "mm"
    assert height_pt.quality == Quality.GOOD


def test_factoryio_safety_interlock_blocks_actuator_writes(mock_adapter):
    """Safety Interlock: Writes to actuators must be blocked when command mode is disabled."""
    assert mock_adapter.command_mode_enabled is False
    
    res = mock_adapter.send_actuator_command("ConveyorEntry", True)
    assert res["success"] is False
    assert "Safety Interlock Active" in res["error"]
    
    # Verify actuator was not modified
    assert mock_adapter._mock_coils[0] is False


def test_factoryio_actuator_command_when_enabled(mock_adapter):
    """When command mode is enabled, discrete and analog actuator writes succeed."""
    mock_adapter.set_command_mode(True)
    assert mock_adapter.command_mode_enabled is True
    
    # Write coil
    res_coil = mock_adapter.send_actuator_command("ConveyorEntry", True)
    assert res_coil["success"] is True
    assert mock_adapter._mock_coils[0] is True
    
    # Write analog holding register (ConveyorSpeedSetpoint: 0..3 m/s)
    res_reg = mock_adapter.send_actuator_command("ConveyorSpeedSetpoint", 2.1)
    assert res_reg["success"] is True
    # Verify unscaled holding register: (2.1 / 3.0) * 300 = 210
    assert mock_adapter._mock_holding[0] == 210


def test_factoryio_stale_data_watchdog(mock_adapter, state_engine):
    """Telemetry watchdog detects frozen/lost updates and marks quality as STALE."""
    mock_adapter._mock_discrete[0] = True
    mock_adapter.poll_once()
    
    dev_state = state_engine.get_device_state("FAC_CONVEYOR_01")
    pt = dev_state.telemetry.get("sensor_entry")
    assert pt.quality == Quality.GOOD
    
    # Simulate time passing past stale_timeout_sec (0.25s)
    future_time = time.time() + 1.0
    mock_adapter._check_stale_watchdog(future_time)
    
    assert mock_adapter.is_stale is True
    assert mock_adapter.state == ConnectionState.STALE
    
    dev_state_after = state_engine.get_device_state("FAC_CONVEYOR_01")
    stale_pt = dev_state_after.telemetry.get("sensor_entry")
    assert stale_pt.quality == Quality.STALE


def test_factoryio_error_isolation_on_unreachable_host(state_engine):
    """Socket connect failure to closed port is isolated and does not raise unhandled exception."""
    cfg = FactoryIOConfig(
        host="127.0.0.1",
        port=59999,  # closed local port
        timeout_sec=0.2,
        command_mode_enabled=False
    )
    real_client_adapter = FactoryIOAdapter(state_engine, config=cfg)
    # Ensure mock mode is OFF
    real_client_adapter.enable_mock_mode(False)
    
    success = real_client_adapter.connect()
    assert success is False
    assert real_client_adapter.state == ConnectionState.ERROR
    assert real_client_adapter.error_count >= 1
    
    # Polling also fails gracefully without crashing
    poll_success = real_client_adapter.poll_once()
    assert poll_success is False
