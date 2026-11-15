"""Protocol Simulator: a real Modbus TCP server (loopback only) exposing live plant data.

Function codes: 01, 02, 03, 04, 05, 06, 15, 16. Exception codes: 01 illegal function,
02 illegal data address, 03 illegal data value, 04 slave device failure (also used when a write is
rejected: writes are DISABLED by default, like the Factory I/O command interlock).

Register map (addresses are 0-based protocol addresses):

  Discrete inputs (FC02)           Coils (FC01/05/15, writable when enabled)
   0 motor running                  0 conveyor run   (1=START, 0=STOP)
   1 any active alarm               1 emergency stop (1=E_STOP, 0=RESET_TRIP)
   2 breaker closed                 2 pump run       (1=START, 0=STOP)
   3 pull-cord tripped              3 acknowledge all alarms (write 1)
   4-15 unmapped (read 0, writes rejected)
   4 pump running
   5 critical alarm active
   6 PLC running
   7 simulation running

  Input registers (FC04)                       Holding registers (FC03/06/16)
   0 conveyor speed  x100 m/s                   0 conveyor speed setpoint x100 m/s
   1 motor rpm                                  1 valve position setpoint x10 %
   2 motor temp x10 degC                        2 HVAC temperature setpoint x10 degC
   3 motor current x10 A
   4 motor vibration x100 mm/s
   5 tank level x10 %
   6 pH x100
   7 transformer load kVA
   8 site active power x10 kW
   9 pump temp x10 degC
  10 pump current x10 A
  11 solar output x10 kW
  12 battery SOC x10 %
  13 active alarm count
  14 unacknowledged alarm count
  15 simulation time (s, mod 65536)
"""
import ipaddress
import logging
import socket
import struct
import threading
import time
import uuid
from typing import Callable, Dict, List, Optional

from goksystem.core.models import CommandRequest

logger = logging.getLogger("goksystem.protocols.modbus_server")

N_BITS = 16
N_COILS = 16     # addresses 0-3 are mapped; 4-15 read as 0 and reject writes
N_IREG = 16
N_HREG = 3


def _u16(x: float) -> int:
    return max(0, min(65535, int(round(x))))


class ModbusSimServer:
    def __init__(self, engine, host: str = "127.0.0.1", port: int = 5020, write_enabled: bool = False, max_clients: int = 8):
        if not ipaddress.ip_address(host).is_loopback:
            raise ValueError("Protocol simulator binds to loopback addresses only")
        self.engine = engine
        self.host, self.port = host, port
        self.write_enabled = write_enabled
        self.max_clients = max_clients
        self._srv: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._clients: List[socket.socket] = []
        self._lock = threading.Lock()
        self.stats = {"connections": 0, "requests": 0, "exceptions": 0, "writes_accepted": 0, "writes_rejected": 0, "by_function": {}}

    # data model
    def _rd(self, dev, pt, default=0.0):
        return self.engine.state_engine.read_point_value(dev, pt, default)

    def discrete_inputs(self) -> List[bool]:
        e = self.engine
        alarms = e.alarm_engine.get_active_alarms()
        plc = getattr(e, "plc", None)
        return [self._rd("FAC_VFD_MOTOR_01", "rpm") > 50, bool(alarms), self._rd("GRID_BREAKER_01", "state", 1.0) >= 0.5,
                self._rd("FAC_CONVEYOR_01", "pull_cord_tripped") >= 0.5, self._rd("PROC_PUMP_01", "rpm") > 100,
                any(a.severity.value == "CRITICAL" for a in alarms), bool(plc and plc.running), bool(e.running)] + [False] * (N_BITS - 8)

    def coils(self) -> List[bool]:
        e = self.engine
        return [bool(e.factory.conveyor_running), bool(e.factory.pull_cord_tripped), bool(e.process.pump_running), False] + [False] * (N_COILS - 4)

    def input_registers(self) -> List[int]:
        e = self.engine
        r = self._rd
        alarms = e.alarm_engine.get_active_alarms()
        return [_u16(r("FAC_CONVEYOR_01", "speed") * 100), _u16(r("FAC_VFD_MOTOR_01", "rpm")), _u16(r("FAC_VFD_MOTOR_01", "temperature_c") * 10),
                _u16(r("FAC_VFD_MOTOR_01", "current_a") * 10), _u16(r("FAC_VFD_MOTOR_01", "vibration_rms") * 100),
                _u16(r("PROC_TANK_01", "level_pct") * 10), _u16(r("PROC_TANK_01", "ph_value") * 100), _u16(r("GRID_TRAFO_01", "load_kva")),
                _u16(r("GRID_BUSBAR_11KV", "total_p_mw") * 1e4), _u16(r("PROC_PUMP_01", "temperature_c") * 10),
                _u16(r("PROC_PUMP_01", "current_a") * 10), _u16(r("BLD_SOLAR_PV_01", "output_kw") * 10),
                _u16(r("BLD_BMS_BATTERY_01", "soc_pct") * 10), len(alarms),
                sum(1 for a in alarms if a.state.value in ("UNACK_ALARM", "RTN_UNACK")), int(e.sim_time) % 65536]

    def holding_registers(self) -> List[int]:
        e = self.engine
        return [_u16(e.factory.conveyor_target_speed * 100), _u16(e.process.valve_position_pct * 10), _u16(e.building.target_temp_c * 10)]

    # writes
    def _command(self, peer: str, device: str, op: str, params: Optional[dict] = None) -> bool:
        res = self.engine.execute_command(CommandRequest(
            command_id=f"modbus-{uuid.uuid4().hex[:8]}", target_device=device, operation=op, parameters=params or {},
            operator_id=f"modbus:{peer}", user_role="ENGINEER"))
        return res.success

    def _write_coil(self, peer: str, addr: int, val: bool) -> bool:
        if addr == 0:
            return self._command(peer, "FAC_CONVEYOR_01", "START" if val else "STOP")
        if addr == 1:
            return self._command(peer, "FAC_CONVEYOR_01", "E_STOP" if val else "RESET_TRIP")
        if addr == 2:
            return self._command(peer, "PROC_PUMP_01", "START" if val else "STOP")
        if addr == 3:
            if val:
                self.engine.alarm_engine.acknowledge_all(f"modbus:{peer}")
            return True
        return False

    def _write_hreg(self, peer: str, addr: int, val: int) -> bool:
        if addr == 0:
            return self._command(peer, "FAC_CONVEYOR_01", "SET_SPEED", {"speed": val / 100.0})
        if addr == 1:
            return self._command(peer, "PROC_VALVE_01", "SET_POSITION", {"position": val / 10.0})
        if addr == 2:
            return self._command(peer, "BLD_HVAC_ZONE1", "SET_TEMPERATURE_SP", {"temperature": val / 10.0})
        return False

    # protocol
    def handle_pdu(self, fc: int, data: bytes, peer: str = "local") -> bytes:
        """Return response PDU (function code + data) or an exception PDU."""
        def exc(code):
            self.stats["exceptions"] += 1
            return bytes([fc | 0x80, code])
        try:
            if fc in (0x01, 0x02):
                addr, qty = struct.unpack(">HH", data[:4]) if len(data) == 4 else (None, None)
                if addr is None or not (1 <= qty <= 2000):
                    return exc(3)
                table = self.coils() if fc == 0x01 else self.discrete_inputs()
                size = N_COILS if fc == 0x01 else N_BITS
                if addr + qty > size:
                    return exc(2)
                bits = table[addr:addr + qty]
                out = bytearray((qty + 7) // 8)
                for i, b in enumerate(bits):
                    if b:
                        out[i // 8] |= 1 << (i % 8)
                return bytes([fc, len(out)]) + bytes(out)
            if fc in (0x03, 0x04):
                if len(data) != 4:
                    return exc(3)
                addr, qty = struct.unpack(">HH", data)
                if not (1 <= qty <= 125):
                    return exc(3)
                table = self.holding_registers() if fc == 0x03 else self.input_registers()
                if addr + qty > len(table):
                    return exc(2)
                return bytes([fc, qty * 2]) + struct.pack(f">{qty}H", *table[addr:addr + qty])
            if fc == 0x05:
                if len(data) != 4:
                    return exc(3)
                addr, val = struct.unpack(">HH", data)
                if val not in (0x0000, 0xFF00):
                    return exc(3)
                if addr >= N_COILS:
                    return exc(2)
                if not self._allow_write(self._write_coil, peer, addr, val == 0xFF00):
                    return exc(4)
                return bytes([fc]) + data
            if fc == 0x06:
                if len(data) != 4:
                    return exc(3)
                addr, val = struct.unpack(">HH", data)
                if addr >= N_HREG:
                    return exc(2)
                if not self._allow_write(self._write_hreg, peer, addr, val):
                    return exc(4)
                return bytes([fc]) + data
            if fc == 0x0F:
                if len(data) < 5:
                    return exc(3)
                addr, qty, bc = struct.unpack(">HHB", data[:5])
                if not (1 <= qty <= 1968) or bc != (qty + 7) // 8 or len(data) != 5 + bc:
                    return exc(3)
                if addr + qty > N_COILS:
                    return exc(2)
                vals = [bool((data[5 + i // 8] >> (i % 8)) & 1) for i in range(qty)]
                for i, v in enumerate(vals):
                    if not self._allow_write(self._write_coil, peer, addr + i, v):
                        return exc(4)
                return bytes([fc]) + struct.pack(">HH", addr, qty)
            if fc == 0x10:
                if len(data) < 5:
                    return exc(3)
                addr, qty, bc = struct.unpack(">HHB", data[:5])
                if not (1 <= qty <= 123) or bc != qty * 2 or len(data) != 5 + bc:
                    return exc(3)
                if addr + qty > N_HREG:
                    return exc(2)
                vals = struct.unpack(f">{qty}H", data[5:])
                for i, v in enumerate(vals):
                    if not self._allow_write(self._write_hreg, peer, addr + i, v):
                        return exc(4)
                return bytes([fc]) + struct.pack(">HH", addr, qty)
            return exc(1)
        except struct.error:
            return exc(3)

    def _allow_write(self, fn: Callable, peer: str, addr: int, val) -> bool:
        if not self.write_enabled:
            self.stats["writes_rejected"] += 1
            return False
        ok = fn(peer, addr, val)
        self.stats["writes_accepted" if ok else "writes_rejected"] += 1
        return ok

    @staticmethod
    def _recv_exact(conn: socket.socket, n: int) -> Optional[bytes]:
        buf = bytearray()
        while len(buf) < n:
            chunk = conn.recv(n - len(buf))
            if not chunk:
                return None
            buf.extend(chunk)
        return bytes(buf)

    def _serve(self, conn: socket.socket, peer: str):
        conn.settimeout(30.0)
        try:
            while not self._stop.is_set():
                hdr = self._recv_exact(conn, 7)
                if hdr is None:
                    break
                tx, proto, length, unit = struct.unpack(">HHHB", hdr)
                if proto != 0 or not (2 <= length <= 254):
                    break       # framing violation: drop the connection
                pdu = self._recv_exact(conn, length - 1)
                if pdu is None:
                    break
                fc = pdu[0]
                self.stats["requests"] += 1
                self.stats["by_function"][fc] = self.stats["by_function"].get(fc, 0) + 1
                try:
                    resp = self.handle_pdu(fc, pdu[1:], peer)
                except Exception:       # model glitch must not kill the server
                    logger.exception("Modbus handler error")
                    resp = bytes([fc | 0x80, 4])
                conn.sendall(struct.pack(">HHHB", tx, 0, len(resp) + 1, unit) + resp)
        except (socket.timeout, OSError):
            pass
        finally:
            with self._lock:
                if conn in self._clients:
                    self._clients.remove(conn)
            try:
                conn.close()
            except OSError:
                pass

    def _accept_loop(self):
        while not self._stop.is_set():
            try:
                conn, addr = self._srv.accept()
            except OSError:
                break
            with self._lock:
                if len(self._clients) >= self.max_clients:
                    conn.close()
                    continue
                self._clients.append(conn)
            self.stats["connections"] += 1
            threading.Thread(target=self._serve, args=(conn, f"{addr[0]}:{addr[1]}"), daemon=True).start()

    # lifecycle
    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self) -> int:
        if self.running:
            return self.port
        s = socket.socket(socket.AF_INET if ":" not in self.host else socket.AF_INET6, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((self.host, self.port))     # OSError propagates when the port is busy
        s.listen(8)
        self.port = s.getsockname()[1]
        self._srv = s
        self._stop.clear()
        self._thread = threading.Thread(target=self._accept_loop, daemon=True, name="ModbusSimServer")
        self._thread.start()
        return self.port

    def stop(self):
        self._stop.set()
        if self._srv:
            try:
                self._srv.close()
            except OSError:
                pass
        with self._lock:
            for c in self._clients:
                try:
                    c.close()
                except OSError:
                    pass
            self._clients.clear()
        if self._thread:
            self._thread.join(timeout=1.0)
        self._thread = None
        self._srv = None

    def status(self) -> dict:
        return {"running": self.running, "host": self.host, "port": self.port, "write_enabled": self.write_enabled,
                "clients": len(self._clients), "stats": dict(self.stats),
                "opc_ua": "NOT IMPLEMENTED (documented future work); see goksystem/protocols/opcua_adapter.py"}
