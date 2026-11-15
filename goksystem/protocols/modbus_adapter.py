"""In-memory Modbus register map (40001-40009: conveyor speed, motor rpm, trafo load, breaker state, tank level, valve position, zone temperature, solar power, battery SOC).

The network server is in modbus_server.py.
"""

import threading
import logging
from typing import Dict, Any, List
from goksystem.core.state_engine import StateEngine

logger = logging.getLogger("goksystem.protocols.modbus")


class ModbusRegisterMap:
    """Canonical holding register memory table."""

    def __init__(self, state_engine: StateEngine):
        self.state_engine = state_engine
        self._lock = threading.Lock()
        self.registers: Dict[int, int] = {
            1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0
        }

    def sync_from_state(self):
        """Read latest telemetry from StateEngine and scale into 16-bit unsigned ints."""
        with self._lock:
            spd = self.state_engine.read_point_value("FAC_CONVEYOR_01", "speed", 0.0)
            self.registers[1] = max(0, min(65535, int(spd * 100)))

            rpm = self.state_engine.read_point_value("FAC_VFD_MOTOR_01", "rpm", 0.0)
            self.registers[2] = max(0, min(65535, int(rpm)))

            load_kva = self.state_engine.read_point_value("GRID_TRAFO_01", "load_kva", 0.0)
            self.registers[3] = max(0, min(65535, int(load_kva)))

            brk = self.state_engine.read_point_value("GRID_BREAKER_01", "state", 1.0)
            self.registers[4] = int(brk)

            lvl = self.state_engine.read_point_value("PROC_TANK_01", "level_pct", 0.0)
            self.registers[5] = max(0, min(65535, int(lvl * 10)))

            v_pos = self.state_engine.read_point_value("PROC_VALVE_01", "position_pct", 0.0)
            self.registers[6] = max(0, min(65535, int(v_pos * 10)))

            temp = self.state_engine.read_point_value("BLD_HVAC_ZONE1", "current_temp_c", 0.0)
            self.registers[7] = max(0, min(65535, int(temp * 10)))

            solar = self.state_engine.read_point_value("BLD_SOLAR_PV_01", "output_kw", 0.0)
            self.registers[8] = max(0, min(65535, int(solar * 10)))

            soc = self.state_engine.read_point_value("BLD_BMS_BATTERY_01", "soc_pct", 0.0)
            self.registers[9] = max(0, min(65535, int(soc * 10)))

    def read_holding_registers(self, address: int, count: int) -> List[int]:
        with self._lock:
            result = []
            for i in range(address, address + count):
                result.append(self.registers.get(i, 0))
            return result

    def write_holding_register(self, address: int, value: int) -> bool:
        with self._lock:
            self.registers[address] = value & 0xFFFF
            return True


class ModbusTCPAdapter:
    """Virtual Modbus TCP adapter."""

    def __init__(self, state_engine: StateEngine, port: int = 5020):
        self.state_engine = state_engine
        self.port = port
        self.reg_map = ModbusRegisterMap(state_engine)
        self.running = False

    def update(self):
        """Periodic sync."""
        self.reg_map.sync_from_state()

    def read_registers(self, start_addr: int, count: int) -> List[int]:
        self.update()
        return self.reg_map.read_holding_registers(start_addr, count)

    def write_register(self, addr: int, val: int) -> bool:
        return self.reg_map.write_holding_register(addr, val)
