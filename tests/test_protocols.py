"""MQTT, Modbus and OPC UA adapter tests."""

import pytest
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.core.engine import SimulationEngine
from goksystem.protocols.mqtt_adapter import MQTTAdapter
from goksystem.protocols.modbus_adapter import ModbusTCPAdapter
from goksystem.protocols.opcua_adapter import VirtualOPCUAServer
from goksystem.core.models import TelemetryPoint, Quality


def test_mqtt_telemetry_and_command_exchange():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)
    
    mqtt = MQTTAdapter(sim)
    mqtt.start()
    
    # Test publish telemetry
    pt = TelemetryPoint(point_id="speed", value=2.1, unit="m/s", quality=Quality.GOOD, sim_time=1.0)
    mqtt.publish_telemetry("FAC_CONVEYOR_01", pt, "FACTORY")
    assert mqtt.published_messages_count == 1
    
    # Test command reception via MQTT synthetic bus
    cmd_payload = '{"command_id": "c1", "operation": "STOP", "operator_id": "mqtt_user", "user_role": "OPERATOR"}'
    mqtt.fallback_broker.publish("goksystem/command/FAC_CONVEYOR_01", cmd_payload)
    
    assert sim.factory.conveyor_running is False


def test_modbus_tcp_holding_registers():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    
    st.update_telemetry("FAC_CONVEYOR_01", "speed", 1.85, "m/s", 1.0)
    st.update_telemetry("GRID_TRAFO_01", "load_kva", 1650.0, "kVA", 1.0)
    st.update_telemetry("PROC_TANK_01", "level_pct", 72.4, "%", 1.0)
    
    mb = ModbusTCPAdapter(st)
    
    # Read registers (1-indexed address 1..3)
    regs = mb.read_registers(1, 6)
    # Register 1: Conveyor speed x100 -> 185
    assert regs[0] == 185
    # Register 3: Trafo load kVA -> 1650
    assert regs[2] == 1650
    # Register 5: Tank level x10 -> 724
    assert regs[4] == 724
    
    # Test writing register
    mb.write_register(6, 500)
    assert mb.reg_map.registers[6] == 500


def test_opcua_virtual_server_nodes():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    st.update_telemetry("FAC_CONVEYOR_01", "speed", 2.2, "m/s", 1.0)
    
    opc = VirtualOPCUAServer(st)
    val = opc.read_node_value("GOKSYSTEM.Factory.ConveyorSpeed")
    assert val == 2.2
