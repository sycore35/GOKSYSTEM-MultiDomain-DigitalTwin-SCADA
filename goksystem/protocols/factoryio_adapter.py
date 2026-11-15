"""Factory I/O adapter over Modbus TCP: polls scene tags into the state engine and can write actuator commands back.

Command writes are blocked unless command mode is switched on. The poller reconnects with backoff, flags stale data, and a mock mode is used for tests and headless runs.
"""

import socket
import struct
import threading
import time
import logging
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple, Callable
from pydantic import BaseModel, Field

from goksystem.core.state_engine import StateEngine
from goksystem.core.models import Quality

logger = logging.getLogger("goksystem.protocols.factoryio")


class ConnectionState(str, Enum):
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    STALE = "STALE"
    ERROR = "ERROR"
    MOCK_SIMULATION = "MOCK_SIMULATION"


class TagDataType(str, Enum):
    BOOL = "BOOL"
    INT16 = "INT16"
    UINT16 = "UINT16"
    FLOAT32 = "FLOAT32"


class TagDirection(str, Enum):
    READ = "READ"      # Sensor from Factory I/O -> SCADA
    WRITE = "WRITE"    # Command from SCADA -> Factory I/O Actuator


class TagDefinition(BaseModel):
    tag_id: str
    modbus_type: str  # 'coil', 'discrete_input', 'holding_register', 'input_register'
    address: int
    data_type: TagDataType = TagDataType.BOOL
    direction: TagDirection = TagDirection.READ
    raw_min: float = 0.0
    raw_max: float = 1.0
    eng_min: float = 0.0
    eng_max: float = 1.0
    unit: str = ""
    target_device: str = "FAC_CONVEYOR_01"
    target_point: str = ""
    description: str = ""


class FactoryIOConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 502
    unit_id: int = 1
    scene_name: str = "Sorting by Height"
    poll_interval_sec: float = 0.1
    timeout_sec: float = 1.0
    stale_timeout_sec: float = 2.5
    command_mode_enabled: bool = False  # Safety interlock: disabled by default
    max_reconnect_delay: float = 10.0


# Standard Factory I/O Scene: Sorting by Height Canonical Tag Map
SORTING_BY_HEIGHT_TAGS: List[TagDefinition] = [
    # Discrete Inputs (Sensors -> SCADA)
    TagDefinition(
        tag_id="AtEntry", modbus_type="discrete_input", address=0,
        data_type=TagDataType.BOOL, direction=TagDirection.READ,
        target_device="FAC_CONVEYOR_01", target_point="sensor_entry", unit="bool",
        description="Entry photoelectric beam"
    ),
    TagDefinition(
        tag_id="AtExit", modbus_type="discrete_input", address=1,
        data_type=TagDataType.BOOL, direction=TagDirection.READ,
        target_device="FAC_CONVEYOR_01", target_point="sensor_exit", unit="bool",
        description="Exit diffuse sensor"
    ),
    TagDefinition(
        tag_id="HeightLow", modbus_type="discrete_input", address=2,
        data_type=TagDataType.BOOL, direction=TagDirection.READ,
        target_device="FAC_CONVEYOR_01", target_point="sensor_height_low", unit="bool",
        description="Low optical sensor for pallet detection"
    ),
    TagDefinition(
        tag_id="HeightHigh", modbus_type="discrete_input", address=3,
        data_type=TagDataType.BOOL, direction=TagDirection.READ,
        target_device="FAC_CONVEYOR_01", target_point="sensor_height_high", unit="bool",
        description="High optical sensor for tall box classification"
    ),
    TagDefinition(
        tag_id="PalletSensor", modbus_type="discrete_input", address=4,
        data_type=TagDataType.BOOL, direction=TagDirection.READ,
        target_device="FAC_CONVEYOR_01", target_point="pallet_detected", unit="bool",
        description="Inductive sensor for pallet presence"
    ),

    # Analog Input Registers (Sensors -> SCADA)
    TagDefinition(
        tag_id="OpticalHeightGauge", modbus_type="input_register", address=0,
        data_type=TagDataType.UINT16, direction=TagDirection.READ,
        raw_min=0.0, raw_max=1000.0, eng_min=0.0, eng_max=100.0, unit="mm",
        target_device="FAC_CONVEYOR_01", target_point="optical_height_mm",
        description="Continuous laser height gauge"
    ),
    TagDefinition(
        tag_id="WeightScale", modbus_type="input_register", address=1,
        data_type=TagDataType.UINT16, direction=TagDirection.READ,
        raw_min=0.0, raw_max=5000.0, eng_min=0.0, eng_max=50.0, unit="kg",
        target_device="FAC_CONVEYOR_01", target_point="measured_weight_kg",
        description="Conveyor belt integrated scale"
    ),

    # Coils (Actuators: SCADA -> Factory I/O)
    TagDefinition(
        tag_id="ConveyorEntry", modbus_type="coil", address=0,
        data_type=TagDataType.BOOL, direction=TagDirection.WRITE,
        target_device="FAC_CONVEYOR_01", target_point="conveyor_entry_cmd", unit="bool",
        description="Entry conveyor motor contactor"
    ),
    TagDefinition(
        tag_id="ConveyorExit", modbus_type="coil", address=1,
        data_type=TagDataType.BOOL, direction=TagDirection.WRITE,
        target_device="FAC_CONVEYOR_01", target_point="conveyor_exit_cmd", unit="bool",
        description="Exit conveyor motor contactor"
    ),
    TagDefinition(
        tag_id="SorterLeft", modbus_type="coil", address=2,
        data_type=TagDataType.BOOL, direction=TagDirection.WRITE,
        target_device="FAC_CONVEYOR_01", target_point="sorter_left_cmd", unit="bool",
        description="Left sorting arm pneumatic pusher"
    ),
    TagDefinition(
        tag_id="SorterRight", modbus_type="coil", address=3,
        data_type=TagDataType.BOOL, direction=TagDirection.WRITE,
        target_device="FAC_CONVEYOR_01", target_point="sorter_right_cmd", unit="bool",
        description="Right sorting arm pneumatic pusher"
    ),
    TagDefinition(
        tag_id="WarningBeacon", modbus_type="coil", address=4,
        data_type=TagDataType.BOOL, direction=TagDirection.WRITE,
        target_device="FAC_CONVEYOR_01", target_point="warning_beacon_cmd", unit="bool",
        description="Tower stack yellow warning light"
    ),

    # Holding Registers (Actuators: SCADA -> Factory I/O)
    TagDefinition(
        tag_id="ConveyorSpeedSetpoint", modbus_type="holding_register", address=0,
        data_type=TagDataType.UINT16, direction=TagDirection.WRITE,
        raw_min=0.0, raw_max=300.0, eng_min=0.0, eng_max=3.0, unit="m/s",
        target_device="FAC_CONVEYOR_01", target_point="speed_setpoint_mps",
        description="VFD target frequency scaled speed"
    )
]


class ModbusException(Exception):
    """Device answered with a Modbus exception response (connection is still in sync)."""
    NAMES = {1: "ILLEGAL_FUNCTION", 2: "ILLEGAL_DATA_ADDRESS", 3: "ILLEGAL_DATA_VALUE", 4: "SLAVE_DEVICE_FAILURE"}

    def __init__(self, function_code: int, code: int):
        self.function_code, self.code = function_code, code
        super().__init__(f"Modbus exception FC={function_code:#04x} code={code} ({self.NAMES.get(code, 'UNKNOWN')})")


class ModbusProtocolError(ValueError):
    """Framing / transaction violation: the connection must be re-established."""


class ModbusTCPClientFrame:
    """Pure Python Modbus TCP MBAP frame builder and parser."""

    @staticmethod
    def build_request(transaction_id: int, unit_id: int, function_code: int, data: bytes) -> bytes:
        length = len(data) + 2  # Unit ID (1) + Function Code (1) + data
        mbap_header = struct.pack(">HHHB", transaction_id, 0, length, unit_id)
        return mbap_header + struct.pack("B", function_code) + data

    @staticmethod
    def parse_response(response: bytes) -> Tuple[int, int, int, bytes]:
        """Parses a complete MBAP frame: (tx_id, unit_id, function_code, payload)"""
        if len(response) < 8:
            raise ValueError(f"Response too short: {len(response)} bytes")
        tx_id, proto_id, length, unit_id = struct.unpack(">HHHB", response[:7])
        if proto_id != 0:
            raise ValueError(f"Invalid protocol identifier: {proto_id}")
        fc = response[7]
        payload = response[8:7 + length]
        return tx_id, unit_id, fc, payload

    @staticmethod
    def recv_exact(sock: socket.socket, n: int) -> bytes:
        """Read exactly n bytes, tolerating arbitrary TCP fragmentation."""
        buf = bytearray()
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("Connection closed by peer mid-frame")
            buf.extend(chunk)
        return bytes(buf)

    @classmethod
    def read_frame(cls, sock: socket.socket) -> Tuple[int, int, int, bytes]:
        """Read one response frame using the MBAP length field. Returns (tx_id, unit_id, fc, payload)."""
        header = cls.recv_exact(sock, 7)
        tx_id, proto_id, length, unit_id = struct.unpack(">HHHB", header)
        if proto_id != 0:
            raise ModbusProtocolError(f"Invalid protocol identifier: {proto_id}")
        if not (2 <= length <= 254):
            raise ModbusProtocolError(f"Invalid MBAP length: {length}")
        body = cls.recv_exact(sock, length - 1)
        return tx_id, unit_id, body[0], body[1:]


def _pack_bits(bits: List[bool]) -> bytes:
    out = bytearray((len(bits) + 7) // 8)
    for i, b in enumerate(bits):
        if b:
            out[i // 8] |= 1 << (i % 8)
    return bytes(out)


def _unpack_bits(data: bytes, qty: int) -> List[bool]:
    return [bool((data[i // 8] >> (i % 8)) & 1) for i in range(qty)]


class FactoryIOAdapter:
    """Factory I/O Simulator Adapter connecting GÖKSYSTEM 3.0 to external 3D scenes."""

    def __init__(
        self,
        state_engine: StateEngine,
        config: Optional[FactoryIOConfig] = None,
        tag_definitions: Optional[List[TagDefinition]] = None
    ):
        self.state_engine = state_engine
        self.config = config or FactoryIOConfig()
        self.tags = {t.tag_id: t for t in (tag_definitions or SORTING_BY_HEIGHT_TAGS)}

        self.state = ConnectionState.DISCONNECTED
        self.last_successful_poll_time = 0.0
        self.is_stale = False
        self.error_count = 0
        self.last_error = ""
        self.current_values: Dict[str, Any] = {}
        self.command_mode_enabled = self.config.command_mode_enabled
        self.poll_count = 0
        self.reconnect_attempts = 0

        self._tx_id = 0
        self._socket: Optional[socket.socket] = None
        self._lock = threading.RLock()
        self._running = False
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # In-memory mock storage for testing and headless verification
        self._mock_coils: Dict[int, bool] = {i: False for i in range(16)}
        self._mock_discrete: Dict[int, bool] = {i: False for i in range(16)}
        self._mock_holding: Dict[int, int] = {i: 0 for i in range(16)}
        self._mock_input_regs: Dict[int, int] = {i: 0 for i in range(16)}
        self._mock_mode = False

    # mode control
    def enable_mock_mode(self, enabled: bool = True):
        """Enables in-memory simulation for automated tests without physical host daemon."""
        with self._lock:
            self._mock_mode = enabled
            self._close_socket()
            self.state = ConnectionState.MOCK_SIMULATION if enabled else ConnectionState.DISCONNECTED

    def configure(self, host: Optional[str] = None, port: Optional[int] = None, unit_id: Optional[int] = None):
        with self._lock:
            if host is not None:
                self.config.host = host
            if port is not None:
                self.config.port = int(port)
            if unit_id is not None:
                self.config.unit_id = int(unit_id)
            self._close_socket()

    def set_command_mode(self, enabled: bool) -> bool:
        """Controls the write safety interlock."""
        with self._lock:
            self.command_mode_enabled = enabled
            self.config.command_mode_enabled = enabled
            logger.info("Factory I/O command mode set to: %s", enabled)
            return self.command_mode_enabled

    # polling thread
    @property
    def is_polling(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self) -> bool:
        """Start the background polling thread (idempotent)."""
        with self._lock:
            if self.is_polling:
                return False
            self._stop_event.clear()
            self._running = True
            self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="FactoryIOPoll")
            self._thread.start()
            return True

    def stop(self, timeout: float = 2.0):
        """Stop the polling thread and close the connection."""
        self._running = False
        self._stop_event.set()
        t = self._thread
        if t and t.is_alive() and t is not threading.current_thread():
            t.join(timeout=timeout)
        self._thread = None
        with self._lock:
            self._close_socket()
            if not self._mock_mode:
                self.state = ConnectionState.DISCONNECTED

    def _poll_loop(self):
        delay = 0.5
        while not self._stop_event.is_set():
            try:
                ok = self.poll_once()
            except Exception as exc:    # never let the poller die
                self.last_error = f"Poll loop error: {exc}"
                self.error_count += 1
                ok = False
            if ok:
                delay = 0.5
                wait = max(0.01, self.config.poll_interval_sec)
            else:
                self.reconnect_attempts += 1
                wait = delay
                delay = min(self.config.max_reconnect_delay, delay * 2)
            if self._stop_event.wait(wait):
                break

    # connection
    def _close_socket(self):
        if self._socket:
            try:
                self._socket.close()
            except Exception:
                pass
            self._socket = None

    def connect(self) -> bool:
        """Establishes TCP connection to Factory I/O Modbus TCP server."""
        with self._lock:
            if self._mock_mode:
                self.state = ConnectionState.MOCK_SIMULATION
                self.last_successful_poll_time = time.time()
                self.is_stale = False
                return True

            self.state = ConnectionState.CONNECTING
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(self.config.timeout_sec)
                s.connect((self.config.host, self.config.port))
                self._socket = s
                self.state = ConnectionState.CONNECTED
                self.last_successful_poll_time = time.time()
                self.is_stale = False
                self.last_error = ""
                logger.info("Connected to Factory I/O at %s:%d", self.config.host, self.config.port)
                return True
            except (socket.error, OSError) as e:
                self.state = ConnectionState.ERROR
                self.last_error = str(e)
                self.error_count += 1
                self._close_socket()
                return False

    def disconnect(self):
        """Closes connection safely and stops the poller."""
        self.stop()

    def _next_tx_id(self) -> int:
        self._tx_id = (self._tx_id + 1) & 0xFFFF
        return self._tx_id

    # Modbus client
    def _transact(self, fc: int, data: bytes) -> bytes:
        """Send one request and return the response data (after the function code)."""
        if not self._socket:
            raise ConnectionError("Not connected")
        tx = self._next_tx_id()
        self._socket.sendall(ModbusTCPClientFrame.build_request(tx, self.config.unit_id, fc, data))
        rx_tx, unit, rfc, payload = ModbusTCPClientFrame.read_frame(self._socket)
        if rx_tx != tx:
            raise ModbusProtocolError(f"Transaction ID mismatch: sent {tx}, received {rx_tx}")
        if unit != self.config.unit_id:
            raise ModbusProtocolError(f"Unit ID mismatch: expected {self.config.unit_id}, received {unit}")
        if rfc == (fc | 0x80):
            raise ModbusException(fc, payload[0] if payload else 0)
        if rfc != fc:
            raise ModbusProtocolError(f"Unexpected function code {rfc:#04x} for request {fc:#04x}")
        return payload

    def _read_bits(self, fc: int, mock: Dict[int, bool], addr: int, qty: int) -> List[bool]:
        if not (1 <= qty <= 2000) or not (0 <= addr <= 0xFFFF) or addr + qty > 0x10000:
            raise ValueError("Invalid address/quantity for bit read (qty 1..2000)")
        with self._lock:
            if self._mock_mode:
                return [bool(mock.get(addr + i, False)) for i in range(qty)]
            p = self._transact(fc, struct.pack(">HH", addr, qty))
            if len(p) < 1 or p[0] != (qty + 7) // 8 or len(p) != 1 + p[0]:
                raise ModbusProtocolError("Bit read byte-count mismatch")
            return _unpack_bits(p[1:], qty)

    def _read_regs(self, fc: int, mock: Dict[int, int], addr: int, qty: int) -> List[int]:
        if not (1 <= qty <= 125) or not (0 <= addr <= 0xFFFF) or addr + qty > 0x10000:
            raise ValueError("Invalid address/quantity for register read (qty 1..125)")
        with self._lock:
            if self._mock_mode:
                return [int(mock.get(addr + i, 0)) & 0xFFFF for i in range(qty)]
            p = self._transact(fc, struct.pack(">HH", addr, qty))
            if len(p) < 1 or p[0] != qty * 2 or len(p) != 1 + p[0]:
                raise ModbusProtocolError("Register read byte-count mismatch")
            return list(struct.unpack(f">{qty}H", p[1:]))

    def read_coils(self, addr: int, qty: int) -> List[bool]:                    # FC 01
        return self._read_bits(0x01, self._mock_coils, addr, qty)

    def read_discrete_inputs(self, addr: int, qty: int) -> List[bool]:          # FC 02
        return self._read_bits(0x02, self._mock_discrete, addr, qty)

    def read_holding_registers(self, addr: int, qty: int) -> List[int]:         # FC 03
        return self._read_regs(0x03, self._mock_holding, addr, qty)

    def read_input_registers(self, addr: int, qty: int) -> List[int]:           # FC 04
        return self._read_regs(0x04, self._mock_input_regs, addr, qty)

    def write_single_coil(self, addr: int, value: bool):                        # FC 05
        with self._lock:
            if self._mock_mode:
                self._mock_coils[addr] = bool(value)
                return
            p = self._transact(0x05, struct.pack(">HH", addr, 0xFF00 if value else 0x0000))
            if p != struct.pack(">HH", addr, 0xFF00 if value else 0x0000):
                raise ModbusProtocolError("FC05 echo mismatch")

    def write_single_register(self, addr: int, value: int):                     # FC 06
        with self._lock:
            v = int(value) & 0xFFFF
            if self._mock_mode:
                self._mock_holding[addr] = v
                return
            p = self._transact(0x06, struct.pack(">HH", addr, v))
            if p != struct.pack(">HH", addr, v):
                raise ModbusProtocolError("FC06 echo mismatch")

    def write_multiple_coils(self, addr: int, values: List[bool]):              # FC 15
        qty = len(values)
        if not (1 <= qty <= 1968):
            raise ValueError("FC15 quantity must be 1..1968")
        with self._lock:
            if self._mock_mode:
                for i, v in enumerate(values):
                    self._mock_coils[addr + i] = bool(v)
                return
            packed = _pack_bits([bool(v) for v in values])
            p = self._transact(0x0F, struct.pack(">HHB", addr, qty, len(packed)) + packed)
            if p != struct.pack(">HH", addr, qty):
                raise ModbusProtocolError("FC15 response mismatch")

    def write_multiple_registers(self, addr: int, values: List[int]):           # FC 16
        qty = len(values)
        if not (1 <= qty <= 123):
            raise ValueError("FC16 quantity must be 1..123")
        with self._lock:
            regs = [int(v) & 0xFFFF for v in values]
            if self._mock_mode:
                for i, v in enumerate(regs):
                    self._mock_holding[addr + i] = v
                return
            p = self._transact(0x10, struct.pack(">HHB", addr, qty, qty * 2) + struct.pack(f">{qty}H", *regs))
            if p != struct.pack(">HH", addr, qty):
                raise ModbusProtocolError("FC16 response mismatch")

    # polling
    def _span(self, modbus_type: str, direction: TagDirection) -> int:
        addrs = [t.address for t in self.tags.values() if t.modbus_type == modbus_type and t.direction == direction]
        return (max(addrs) + 1) if addrs else 0

    def poll_once(self) -> bool:
        """Executes single poll iteration for all configured tags."""
        with self._lock:
            now = time.time()
            if self._mock_mode:
                self._sync_mock_data(now)
                self.last_successful_poll_time = now
                self.is_stale = False
                self.state = ConnectionState.MOCK_SIMULATION
                self.poll_count += 1
                return True

            if not self._socket:
                if not self.connect():
                    self._check_stale_watchdog(now)
                    return False

            try:
                n = self._span("discrete_input", TagDirection.READ)                      # FC 02
                if n:
                    bits = self.read_discrete_inputs(0, n)
                    for tag in self.tags.values():
                        if tag.direction == TagDirection.READ and tag.modbus_type == "discrete_input":
                            self._apply_tag_value(tag, bits[tag.address], now)
                n = self._span("input_register", TagDirection.READ)                      # FC 04
                if n:
                    regs = self.read_input_registers(0, n)
                    for tag in self.tags.values():
                        if tag.direction == TagDirection.READ and tag.modbus_type == "input_register":
                            self._apply_tag_value(tag, self._scale_analog_value(tag, regs[tag.address]), now)
                n = self._span("coil", TagDirection.WRITE)                               # FC 01 read-back
                if n:
                    bits = self.read_coils(0, n)
                    for tag in self.tags.values():
                        if tag.modbus_type == "coil" and tag.direction == TagDirection.WRITE:
                            self.current_values[tag.tag_id] = bits[tag.address]
                n = self._span("holding_register", TagDirection.WRITE)                   # FC 03 read-back
                if n:
                    regs = self.read_holding_registers(0, n)
                    for tag in self.tags.values():
                        if tag.modbus_type == "holding_register" and tag.direction == TagDirection.WRITE:
                            self.current_values[tag.tag_id] = self._eng_from_raw(tag, regs[tag.address])

                self.last_successful_poll_time = now
                self.is_stale = False
                self.state = ConnectionState.CONNECTED
                self.poll_count += 1
                return True

            except ModbusException as err:      # device alive but refused: stay connected
                self.last_error = f"Poll error: {err}"
                self.error_count += 1
                self._check_stale_watchdog(now)
                return False
            except (socket.error, OSError, ValueError, struct.error, IndexError) as err:
                self.last_error = f"Poll error: {err}"
                self.error_count += 1
                self.state = ConnectionState.ERROR
                self._close_socket()
                self._check_stale_watchdog(now)
                return False

    def _sync_mock_data(self, now: float):
        """Propagates in-memory mock registers to StateEngine."""
        for tag in self.tags.values():
            if tag.direction == TagDirection.READ:
                if tag.modbus_type == "discrete_input":
                    val = self._mock_discrete.get(tag.address, False)
                    self._apply_tag_value(tag, val, now)
                elif tag.modbus_type == "input_register":
                    raw_val = self._mock_input_regs.get(tag.address, 0)
                    scaled_val = self._scale_analog_value(tag, raw_val)
                    self._apply_tag_value(tag, scaled_val, now)

    def _scale_analog_value(self, tag: TagDefinition, raw_value: float) -> float:
        span_raw = max(1e-6, tag.raw_max - tag.raw_min)
        clamped_raw = max(tag.raw_min, min(tag.raw_max, raw_value))
        normalized = (clamped_raw - tag.raw_min) / span_raw
        scaled = tag.eng_min + normalized * (tag.eng_max - tag.eng_min)
        return round(scaled, 2)

    _eng_from_raw = _scale_analog_value

    def _unscale_analog_value(self, tag: TagDefinition, eng_value: float) -> int:
        span_eng = max(1e-6, tag.eng_max - tag.eng_min)
        clamped_eng = max(tag.eng_min, min(tag.eng_max, eng_value))
        normalized = (clamped_eng - tag.eng_min) / span_eng
        raw = tag.raw_min + normalized * (tag.raw_max - tag.raw_min)
        return int(round(raw))

    def _apply_tag_value(self, tag: TagDefinition, value: Any, now: float):
        self.current_values[tag.tag_id] = value
        if tag.target_device and tag.target_point:
            num_val = 1.0 if (isinstance(value, bool) and value) else (0.0 if isinstance(value, bool) else float(value))
            q = Quality.GOOD if not self.is_stale else Quality.STALE
            self.state_engine.update_telemetry(
                device_id=tag.target_device,
                point_id=tag.target_point,
                value=num_val,
                unit=tag.unit,
                sim_time=now,
                quality=q
            )

    def _check_stale_watchdog(self, now: float):
        if self.last_successful_poll_time > 0:
            elapsed = now - self.last_successful_poll_time
            if elapsed > self.config.stale_timeout_sec:
                self.is_stale = True
                self.state = ConnectionState.STALE
                for tag in self.tags.values():
                    if tag.target_device and tag.target_point and tag.direction == TagDirection.READ:
                        cur = self.current_values.get(tag.tag_id, 0.0)
                        num_val = 1.0 if (isinstance(cur, bool) and cur) else (0.0 if isinstance(cur, bool) else float(cur))
                        self.state_engine.update_telemetry(
                            device_id=tag.target_device,
                            point_id=tag.target_point,
                            value=num_val,
                            unit=tag.unit,
                            sim_time=now,
                            quality=Quality.STALE
                        )

    # commands
    def send_actuator_command(self, tag_id: str, value: Any) -> Dict[str, Any]:
        """Sends control command to Factory I/O actuator with safety mode check."""
        with self._lock:
            if not self.command_mode_enabled:
                return {
                    "success": False,
                    "tag_id": tag_id,
                    "error": "Safety Interlock Active: Command mode is disabled on Factory I/O adapter."
                }

            tag = self.tags.get(tag_id)
            if not tag:
                return {"success": False, "tag_id": tag_id, "error": f"Tag '{tag_id}' not found in map."}

            if tag.direction != TagDirection.WRITE:
                return {"success": False, "tag_id": tag_id, "error": f"Tag '{tag_id}' is read-only sensor."}

            if not self._mock_mode and not self._socket:
                return {"success": False, "tag_id": tag_id, "error": "Not connected to Factory I/O server."}

            try:
                if tag.modbus_type == "coil":
                    self.write_single_coil(tag.address, bool(value))
                elif tag.modbus_type == "holding_register":
                    self.write_single_register(tag.address, self._unscale_analog_value(tag, float(value)))
                else:
                    return {"success": False, "tag_id": tag_id, "error": f"Unsupported write type {tag.modbus_type}"}
                self.current_values[tag_id] = value
                res = {"success": True, "tag_id": tag_id, "value": value}
                if self._mock_mode:
                    res["mode"] = "MOCK"
                return res
            except ModbusException as err:
                self.last_error = f"Write error: {err}"
                self.error_count += 1
                return {"success": False, "tag_id": tag_id, "error": str(err)}
            except (socket.error, OSError, ValueError, struct.error) as err:
                self.last_error = f"Write error: {err}"
                self.error_count += 1
                if not isinstance(err, ValueError) or isinstance(err, ModbusProtocolError):
                    self._close_socket()
                    self.state = ConnectionState.ERROR
                return {"success": False, "tag_id": tag_id, "error": str(err)}

    def get_status(self) -> Dict[str, Any]:
        """Produces complete diagnostic telemetry for SCADA UI and health checks."""
        with self._lock:
            return {
                "connected": self.state in (ConnectionState.CONNECTED, ConnectionState.MOCK_SIMULATION),
                "state": self.state.value,
                "mode": "MOCK" if self._mock_mode else "LIVE",
                "polling": self.is_polling,
                "poll_count": self.poll_count,
                "reconnect_attempts": self.reconnect_attempts,
                "host": self.config.host,
                "port": self.config.port,
                "scene_name": self.config.scene_name,
                "command_mode_enabled": self.command_mode_enabled,
                "is_stale": self.is_stale,
                "last_successful_poll_time": self.last_successful_poll_time,
                "error_count": self.error_count,
                "last_error": self.last_error,
                "tags_count": len(self.tags),
                "current_values": dict(self.current_values),
                "hardware_verified": False,
                "hardware_status": "NOT VERIFIED (Host daemon not detected; mock verified)"
            }
