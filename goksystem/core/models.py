"""Pydantic models for devices, telemetry, commands, alarms, events and scenarios."""

from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import time


class DomainType(str, Enum):
    FACTORY = "FACTORY"
    GRID = "GRID"
    PROCESS = "PROCESS"
    BUILDING = "BUILDING"
    SYSTEM = "SYSTEM"


class DeviceType(str, Enum):
    # Factory
    CONVEYOR = "CONVEYOR"
    VFD_MOTOR = "VFD_MOTOR"
    ROBOT_ARM = "ROBOT_ARM"
    PHOTO_SENSOR = "PHOTO_SENSOR"
    E_STOP = "E_STOP"
    
    # Grid
    TRANSFORMER = "TRANSFORMER"
    CIRCUIT_BREAKER = "CIRCUIT_BREAKER"
    BUSBAR_11KV = "BUSBAR_11KV"
    PROTECTION_RELAY = "PROTECTION_RELAY"
    
    # Process
    TANK = "TANK"
    PUMP = "PUMP"
    CONTROL_VALVE = "CONTROL_VALVE"
    PID_CONTROLLER = "PID_CONTROLLER"
    FLOW_SENSOR = "FLOW_SENSOR"
    
    # Building
    HVAC_ZONE = "HVAC_ZONE"
    SOLAR_INVERTER = "SOLAR_INVERTER"
    BMS_BATTERY = "BMS_BATTERY"
    ENERGY_METER = "ENERGY_METER"


class Severity(str, Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AlarmState(str, Enum):
    NORMAL = "NORMAL"
    UNACK_ALARM = "UNACK_ALARM"
    ACK_ALARM = "ACK_ALARM"
    RTN_UNACK = "RTN_UNACK"
    SHELVED = "SHELVED"


class Quality(str, Enum):
    GOOD = "GOOD"
    UNCERTAIN = "UNCERTAIN"
    BAD = "BAD"
    STALE = "STALE"


class TelemetryPoint(BaseModel):
    point_id: str
    value: float
    unit: str
    quality: Quality = Quality.GOOD
    sim_time: float
    wall_time: float = Field(default_factory=time.time)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DeviceDefinition(BaseModel):
    device_id: str
    domain: DomainType
    type: DeviceType
    name: str
    description: str = ""
    capabilities: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    position_3d: Dict[str, float] = Field(default_factory=lambda: {"x": 0.0, "y": 0.0, "z": 0.0})


class DeviceRuntimeState(BaseModel):
    device_id: str
    domain: DomainType
    status: str = "ONLINE"
    telemetry: Dict[str, TelemetryPoint] = Field(default_factory=dict)
    active_alarms: List[str] = Field(default_factory=list)
    interlocks_engaged: bool = False
    last_update_sim_time: float = 0.0


class CommandRequest(BaseModel):
    command_id: str
    target_device: str
    operation: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    operator_id: str = "operator_scada"
    user_role: str = "OPERATOR"
    timestamp: float = Field(default_factory=time.time)


class CommandResult(BaseModel):
    command_id: str
    target_device: str
    success: bool
    message: str
    execution_sim_time: float
    details: Dict[str, Any] = Field(default_factory=dict)


class AlarmRecord(BaseModel):
    alarm_id: str
    source_device: str
    tag_id: str
    domain: DomainType
    severity: Severity
    message: str
    current_value: float
    setpoint_or_limit: float
    state: AlarmState = AlarmState.UNACK_ALARM
    trigger_sim_time: float
    ack_by: Optional[str] = None
    ack_timestamp: Optional[float] = None
    clear_sim_time: Optional[float] = None
    # Alarm Management Center extensions (all optional / backward compatible)
    priority: int = 3                      # 1 = critical ... 4 = advisory (derived from severity)
    trigger_wall_time: float = Field(default_factory=time.time)
    condition_active: bool = True          # process condition still beyond limit?
    occurrences: int = 1                   # how many times this alarm has tripped
    deadband: float = 0.0                  # absolute hysteresis applied to this alarm
    shelved_until: Optional[float] = None  # wall-clock epoch when shelving expires
    shelved_by: Optional[str] = None
    shelve_reason: Optional[str] = None


class EventRecord(BaseModel):
    event_id: str
    timestamp_sim: float
    timestamp_wall: float = Field(default_factory=time.time)
    domain: DomainType
    source: str
    category: str
    severity: Severity = Severity.INFO
    message: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ScenarioDefinition(BaseModel):
    scenario_id: str
    name: str
    domain: DomainType
    description: str
    duration_sec: float = 60.0
    seed: int = 42
    initial_conditions: Dict[str, Any] = Field(default_factory=dict)
    scheduled_faults: List[Dict[str, Any]] = Field(default_factory=list)


class SystemStateSummary(BaseModel):
    sim_time: float
    wall_time: float
    running: bool
    speed_factor: float
    total_devices: int
    active_alarms_count: int
    unack_alarms_count: int
    kpis: Dict[str, Any] = Field(default_factory=dict)
