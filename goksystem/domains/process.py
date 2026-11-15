"""Chemical buffer tank (10,000 L): Torricelli drain (Cd = 0.62), booster pump, equal-percentage valve with PID (Kp=18, Ki=1.2, Kd=0.5) and neutralization heat."""

import math
from typing import Dict, Any
from goksystem.core.models import DomainType
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine, Severity


class ProcessDomain:
    """Continuous fluid process and chemical plant domain."""

    def __init__(self, state_engine: StateEngine, alarm_engine: AlarmEngine):
        self.state_engine = state_engine
        self.alarm_engine = alarm_engine
        
        # Tank physical dimensions: 10,000 L cylinder, Height = 4.0 m, Radius = 0.892 m
        # Volume V = pi * r^2 * h = 2.5 m^2 * h -> 10,000 L = 10.0 m^3
        self.tank_max_volume_l = 10000.0
        self.tank_volume_l = 6800.0
        self.tank_temp_c = 34.5
        self.ph_value = 7.15
        
        self.pump_running = True
        self.pump_rpm = 1750.0
        
        # Valve & PID Controller state
        self.valve_position_pct = 45.0  # 0 to 100%
        self.pid_enabled = True
        self.ph_setpoint = 7.0
        self.pid_integral = 0.0
        self.pid_prev_error = 0.0
        self.kp = 18.0
        self.ki = 1.2
        self.kd = 0.5

        # Pump condition model (temperature, vibration, current)
        self.pump_temp_c = 38.0
        self.pump_defect_severity = 0.03
        self.pump_current_a = 0.0
        self.pump_power_kw = 0.0

    def step(self, dt: float, sim_time: float):
        # Torricelli Drain Calculation
        # Tank liquid height: h = (V / 1000) / 2.5 m
        h_meters = max(0.0, (self.tank_volume_l / 1000.0) / 2.5)
        g = 9.81
        c_d = 0.62
        orifice_area_m2 = 0.0035  # ~6.7 cm diameter drain pipe
        
        # Flow velocity v = sqrt(2 * g * h)
        if h_meters > 0.001:
            drain_velocity = math.sqrt(2.0 * g * h_meters)
            q_drain_m3s = c_d * orifice_area_m2 * drain_velocity
            q_drain_l_per_sec = q_drain_m3s * 1000.0
        else:
            q_drain_l_per_sec = 0.0

        # Inflow from booster pump
        if self.pump_running and self.pump_rpm > 100:
            # Pump curve: Q_in proportional to RPM
            q_in_l_per_sec = 25.0 * (self.pump_rpm / 1750.0) * (self.valve_position_pct / 100.0)
        else:
            q_in_l_per_sec = 0.0

        # Mass Balance: dV = (Q_in - Q_drain) * dt
        self.tank_volume_l = max(0.0, min(self.tank_max_volume_l, self.tank_volume_l + (q_in_l_per_sec - q_drain_l_per_sec) * dt))
        level_pct = (self.tank_volume_l / self.tank_max_volume_l) * 100.0

        # Auto-PID Controller for Neutralization Valve
        error = self.ph_value - self.ph_setpoint
        if self.pid_enabled:
            # Anti-windup clamping on integral
            self.pid_integral = max(-50.0, min(50.0, self.pid_integral + error * dt))
            d_term = (error - self.pid_prev_error) / dt if dt > 0 else 0.0
            
            p_val = self.kp * error
            i_val = self.ki * self.pid_integral
            d_val = self.kd * d_term
            
            output = 50.0 + (p_val + i_val + d_val)
            self.valve_position_pct = max(0.0, min(100.0, output))
            self.pid_prev_error = error

        # pH dynamics (acid reagent added drives pH down)
        ph_drift = 0.015 * dt  # slight alkaline drift
        reagent_effect = 0.04 * (self.valve_position_pct / 100.0) * dt
        self.ph_value = max(2.0, min(12.0, self.ph_value + ph_drift - reagent_effect))

        # Temperature dynamics (reaction mild exotherm + ambient cooling)
        temp_rise = 0.08 * (self.valve_position_pct / 100.0) * dt
        self.tank_temp_c += temp_rise - (self.tank_temp_c - 24.0) * (dt / 180.0)

        # Pump condition: thermal lag, cavitation-driven vibration, electrical draw (7.5 kW class)
        rpm_ratio = (self.pump_rpm / 1750.0) if self.pump_running else 0.0
        low_suction = max(0.0, (20.0 - level_pct) / 20.0) if self.pump_running else 0.0
        self.pump_power_kw = (0.35 + 6.6 * rpm_ratio ** 2.6 * (1.0 + 0.4 * self.pump_defect_severity)) if self.pump_running else 0.0
        self.pump_current_a = (self.pump_power_kw * 1000.0 / (math.sqrt(3.0) * 400.0 * 0.84)) if self.pump_running else 0.0
        pump_target = 24.0 + 30.0 * rpm_ratio + 22.0 * self.pump_defect_severity + 8.0 * low_suction
        self.pump_temp_c += (pump_target - self.pump_temp_c) * (dt / 90.0)
        pump_vibration = (0.9 + 1.4 * rpm_ratio + 5.5 * self.pump_defect_severity + 3.0 * low_suction) if self.pump_running else 0.2
        discharge_bar = (1.2 + 3.1 * rpm_ratio ** 2) if self.pump_running else 0.0

        self.state_engine.update_telemetry("PROC_TANK_01", "level_pct", round(level_pct, 2), "%", sim_time)
        self.state_engine.update_telemetry("PROC_TANK_01", "volume_liters", round(self.tank_volume_l, 1), "L", sim_time)
        self.state_engine.update_telemetry("PROC_TANK_01", "temp_c", round(self.tank_temp_c, 2), "°C", sim_time)
        self.state_engine.update_telemetry("PROC_TANK_01", "ph_value", round(self.ph_value, 2), "pH", sim_time)

        self.state_engine.update_telemetry("PROC_PUMP_01", "rpm", round(self.pump_rpm if self.pump_running else 0.0, 1), "RPM", sim_time)
        self.state_engine.update_telemetry("PROC_PUMP_01", "flow_m3h", round(q_in_l_per_sec * 3.6, 2), "m³/h", sim_time)

        self.state_engine.update_telemetry("PROC_PUMP_01", "temperature_c", round(self.pump_temp_c, 2), "°C", sim_time)
        self.state_engine.update_telemetry("PROC_PUMP_01", "vibration_rms", round(pump_vibration, 2), "mm/s", sim_time)
        self.state_engine.update_telemetry("PROC_PUMP_01", "current_a", round(self.pump_current_a, 2), "A", sim_time)
        self.state_engine.update_telemetry("PROC_PUMP_01", "power_kw", round(self.pump_power_kw, 3), "kW", sim_time)
        self.state_engine.update_telemetry("PROC_PUMP_01", "discharge_press_bar", round(discharge_bar, 2), "bar", sim_time)
        self.state_engine.update_telemetry("PROC_PUMP_01", "cavitation_risk", round(low_suction, 2), "idx", sim_time)
        self.state_engine.update_telemetry("PROC_TANK_01", "ph_setpoint", round(self.ph_setpoint, 2), "pH", sim_time)
        self.state_engine.update_telemetry("PROC_VALVE_01", "position_pct", round(self.valve_position_pct, 1), "%", sim_time)

        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_PROC_PUMP_VIBRATION",
            source_device="PROC_PUMP_01",
            tag_id="vibration_rms",
            domain=DomainType.PROCESS,
            current_val=pump_vibration,
            limit_val=4.5,
            is_high_alarm=True,
            severity=Severity.HIGH,
            message="Pump vibration RMS above 4.5 mm/s",
            sim_time=sim_time
        )
        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_PROC_LEVEL_HIGH",
            source_device="PROC_TANK_01",
            tag_id="level_pct",
            domain=DomainType.PROCESS,
            current_val=level_pct,
            limit_val=90.0,
            is_high_alarm=True,
            severity=Severity.HIGH,
            message="Buffer tank level high alarm (> 90%)",
            sim_time=sim_time
        )
        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_PROC_LEVEL_LOW",
            source_device="PROC_TANK_01",
            tag_id="level_pct",
            domain=DomainType.PROCESS,
            current_val=level_pct,
            limit_val=15.0,
            is_high_alarm=False,
            severity=Severity.MEDIUM,
            message="Buffer tank level low - Cavitation risk for transfer pump (< 15%)",
            sim_time=sim_time
        )
        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_PROC_PH_HIGH",
            source_device="PROC_TANK_01",
            tag_id="ph_value",
            domain=DomainType.PROCESS,
            current_val=self.ph_value,
            limit_val=8.5,
            is_high_alarm=True,
            severity=Severity.MEDIUM,
            message="Effluent pH out of neutralization range (> 8.5)",
            sim_time=sim_time
        )

    def handle_command(self, operation: str, parameters: Dict[str, Any]) -> bool:
        op = operation.upper()
        if op == "START":
            self.pump_running = True
            return True
        elif op == "STOP":
            self.pump_running = False
            return True
        elif op == "SET_POSITION":
            self.valve_position_pct = max(0.0, min(100.0, float(parameters.get("position", 50.0))))
            return True
        elif op == "ENABLE_PID":
            self.pid_enabled = bool(parameters.get("enabled", True))
            return True
        return False
