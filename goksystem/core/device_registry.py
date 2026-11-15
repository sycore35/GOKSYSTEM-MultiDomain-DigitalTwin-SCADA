"""Static device topology for the four domains (factory, grid, process, building)."""

from typing import Dict, List, Optional
from goksystem.core.models import DeviceDefinition, DomainType, DeviceType


class DeviceRegistry:
    """Thread-safe registry for device definitions."""
    
    def __init__(self):
        self._devices: Dict[str, DeviceDefinition] = {}
        self._initialize_canonical_devices()

    def _initialize_canonical_devices(self):
        """Pre-populate the standard GÖKSYSTEM 3.0 equipment set."""
        # Domain A - Advanced Manufacturing Facility
        self.register(DeviceDefinition(
            device_id="FAC_CONVEYOR_01",
            domain=DomainType.FACTORY,
            type=DeviceType.CONVEYOR,
            name="Main Assembly Line Conveyor",
            description="Dual-speed 15kW VFD driven pallet transport conveyor with pull-cord safety",
            capabilities=["START", "STOP", "SET_SPEED", "E_STOP", "RESET_TRIP"],
            tags=["speed", "target_speed", "load_kg", "part_count", "motor_temp", "vibration_rms", "pull_cord_tripped"],
            position_3d={"x": -15.0, "y": 0.5, "z": 5.0}
        ))
        self.register(DeviceDefinition(
            device_id="FAC_ROBOT_01",
            domain=DomainType.FACTORY,
            type=DeviceType.ROBOT_ARM,
            name="6-DOF Articulated Assembly Robot",
            description="High precision pick-and-place manipulator with light curtain interlocking",
            capabilities=["EXECUTE_CYCLE", "PAUSE", "HOME", "EMERGENCY_STOP"],
            tags=["joint1_deg", "joint2_deg", "joint3_deg", "payload_kg", "cycle_time_s", "light_curtain_ok"],
            position_3d={"x": -10.0, "y": 0.0, "z": 5.0}
        ))
        self.register(DeviceDefinition(
            device_id="FAC_VFD_MOTOR_01",
            domain=DomainType.FACTORY,
            type=DeviceType.VFD_MOTOR,
            name="Conveyor Drive Induction Motor",
            description="ABB ACS880 VFD motor with bearing vibration monitoring",
            capabilities=["START", "STOP", "SET_FREQUENCY"],
            tags=["frequency_hz", "current_a", "rpm", "temperature_c", "vibration_fft_185hz_amp"],
            position_3d={"x": -18.0, "y": 0.3, "z": 5.0}
        ))

        # Domain B - Electrical Substation and 11 kV Grid
        self.register(DeviceDefinition(
            device_id="GRID_TRAFO_01",
            domain=DomainType.GRID,
            type=DeviceType.TRANSFORMER,
            name="11kV / 400V 2.5 MVA Distribution Transformer",
            description="ONAN cooling oil-immersed transformer with IEEE C57.91 thermal RC model",
            capabilities=["RESET_PROTECTION", "TAP_UP", "TAP_DOWN"],
            tags=["v_primary_kv", "v_secondary_v", "load_kva", "power_factor", "oil_temp_c", "winding_hotspot_c", "trip_flag"],
            position_3d={"x": 15.0, "y": 1.5, "z": -10.0}
        ))
        self.register(DeviceDefinition(
            device_id="GRID_BREAKER_01",
            domain=DomainType.GRID,
            type=DeviceType.CIRCUIT_BREAKER,
            name="11kV Incomer Vacuum Circuit Breaker (VCB)",
            description="ANSI 50/51 overcurrent and ANSI 27/59 under/overvoltage protection breaker",
            capabilities=["OPEN", "CLOSE", "TRIP", "ACK_TRIP"],
            tags=["state", "current_l1_a", "current_l2_a", "current_l3_a", "tripped_ansi_code", "interlock_closed"],
            position_3d={"x": 12.0, "y": 1.0, "z": -10.0}
        ))
        self.register(DeviceDefinition(
            device_id="GRID_BUSBAR_11KV",
            domain=DomainType.GRID,
            type=DeviceType.BUSBAR_11KV,
            name="11 kV Main Switchgear Busbar",
            description="Air-insulated busbar system supplying industrial feeders",
            capabilities=[],
            tags=["voltage_kv", "frequency_hz", "total_p_mw", "total_q_mvar", "total_s_mva"],
            position_3d={"x": 14.0, "y": 3.0, "z": -10.0}
        ))

        # Domain C - Fluid Process and Chemical Plant
        self.register(DeviceDefinition(
            device_id="PROC_TANK_01",
            domain=DomainType.PROCESS,
            type=DeviceType.TANK,
            name="CSTR Chemical Buffer Tank",
            description="10,000L vertical atmospheric vessel with Torricelli bottom discharge and low/high level switches",
            capabilities=["DRAIN", "FILL", "ISOLATE"],
            tags=["level_pct", "volume_liters", "pressure_bar", "temp_c", "ph_value"],
            position_3d={"x": -15.0, "y": 2.0, "z": -15.0}
        ))
        self.register(DeviceDefinition(
            device_id="PROC_PUMP_01",
            domain=DomainType.PROCESS,
            type=DeviceType.PUMP,
            name="Feed Booster Centrifugal Pump",
            description="Variable speed centrifugal transfer pump with cavitation protection",
            capabilities=["START", "STOP", "SET_FLOW_RATE"],
            tags=["rpm", "flow_m3h", "discharge_press_bar", "cavitation_risk", "power_kw"],
            position_3d={"x": -12.0, "y": 0.3, "z": -15.0}
        ))
        self.register(DeviceDefinition(
            device_id="PROC_VALVE_01",
            domain=DomainType.PROCESS,
            type=DeviceType.CONTROL_VALVE,
            name="PID Acid/Base Neutralization Control Valve",
            description="Equal percentage pneumatic control valve with 4-20mA positioner and anti-windup PID",
            capabilities=["OPEN", "CLOSE", "SET_POSITION", "ENABLE_PID"],
            tags=["position_pct", "setpoint_pct", "pid_p_term", "pid_i_term", "pid_d_term"],
            position_3d={"x": -10.0, "y": 0.8, "z": -15.0}
        ))

        # Domain D - Smart Building and Microgrid
        self.register(DeviceDefinition(
            device_id="BLD_HVAC_ZONE1",
            domain=DomainType.BUILDING,
            type=DeviceType.HVAC_ZONE,
            name="Zone 1 Cleanroom AHU & Variable Air Volume",
            description="Multi-zone HVAC unit with 1st-order thermal lag and economizer cycle",
            capabilities=["SET_TEMPERATURE_SP", "SET_MODE", "BOOST"],
            tags=["current_temp_c", "target_temp_c", "humidity_pct", "co2_ppm", "fan_power_kw", "chiller_cop"],
            position_3d={"x": 10.0, "y": 2.5, "z": 10.0}
        ))
        self.register(DeviceDefinition(
            device_id="BLD_SOLAR_PV_01",
            domain=DomainType.BUILDING,
            type=DeviceType.SOLAR_INVERTER,
            name="Rooftop 150 kW Solar PV Array",
            description="Bifacial solar array with MPPT inverter and irradiance tracking",
            capabilities=["CURTAIL", "FULL_EXPORT"],
            tags=["irradiance_wm2", "output_kw", "daily_yield_kwh", "inverter_temp_c", "mppt_efficiency"],
            position_3d={"x": 10.0, "y": 6.0, "z": 12.0}
        ))
        self.register(DeviceDefinition(
            device_id="BLD_BMS_BATTERY_01",
            domain=DomainType.BUILDING,
            type=DeviceType.BMS_BATTERY,
            name="250 kWh LiFePO4 Energy Storage System (BESS)",
            description="16-cell active balancing battery storage with C-rate thermal protection",
            capabilities=["CHARGE", "DISCHARGE", "IDLE", "SET_TARGET_SOC"],
            tags=["soc_pct", "power_kw", "cell_max_v", "cell_min_v", "cell_temp_c", "balancing_active"],
            position_3d={"x": 6.0, "y": 1.0, "z": 10.0}
        ))

    def register(self, device: DeviceDefinition):
        self._devices[device.device_id] = device

    def get(self, device_id: str) -> Optional[DeviceDefinition]:
        return self._devices.get(device_id)

    def list_all(self) -> List[DeviceDefinition]:
        return list(self._devices.values())

    def list_by_domain(self, domain: DomainType) -> List[DeviceDefinition]:
        return [d for d in self._devices.values() if d.domain == domain]
