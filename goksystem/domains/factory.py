"""Manufacturing line: VFD conveyor (tau = 0.4 s), pull-cord emergency braking (14 m/s^2), assembly robot, part counter and a drive motor with a 185 Hz bearing defect signature."""

import math
import numpy as np
from typing import Dict, Any
from goksystem.core.models import DomainType, Quality
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine, Severity


class FactoryDomain:
    """Manufacturing facility simulation domain."""

    def __init__(self, state_engine: StateEngine, alarm_engine: AlarmEngine):
        self.state_engine = state_engine
        self.alarm_engine = alarm_engine
        
        self.conveyor_running = True
        self.conveyor_target_speed = 1.8  # m/s
        self.conveyor_speed = 1.8         # m/s
        self.conveyor_load_kg = 125.0
        self.pull_cord_tripped = False
        self.part_count = 1420
        self.part_detect_timer = 0.0
        
        self.robot_active = True
        self.robot_cycle_phase = 0.0  # 0 to 2*pi
        self.robot_payload_kg = 4.5
        self.light_curtain_ok = True
        
        # Motor condition & vibration
        self.motor_rpm = 1440.0
        self.motor_temp_c = 48.5
        self.bearing_defect_severity = 0.05  # 0.0 to 1.0
        self.motor_frequency_hz = 48.0
        self.motor_shaft_kw = 0.0
        self.motor_efficiency = 0.9
        self.motor_power_factor = 0.85
        self.motor_input_kw = 0.0
        self.motor_current_a = 0.0
        self.motor_torque_nm = 0.0
        
    def step(self, dt: float, sim_time: float):
        """Execute one simulation timestep (dt = 0.1s at 10 Hz)."""
        # Conveyor VFD & Braking Dynamics
        if self.pull_cord_tripped or not self.conveyor_running:
            target = 0.0
            # Emergency braking deceleration: -14 m/s^2
            decel = 14.0 * dt
            if self.conveyor_speed > decel:
                self.conveyor_speed -= decel
            else:
                self.conveyor_speed = 0.0
        else:
            target = self.conveyor_target_speed
            # 1st order lag: tau = 0.4s -> dV/dt = (V_target - V) / 0.4
            tau = 0.4
            self.conveyor_speed += (target - self.conveyor_speed) * (dt / tau)

        # Optical part detection: part passes every 3 meters travelled
        if self.conveyor_speed > 0.05:
            self.part_detect_timer += self.conveyor_speed * dt
            if self.part_detect_timer >= 3.0:
                self.part_count += 1
                self.part_detect_timer -= 3.0

        # Motor RPM & Temperature
        self.motor_rpm = (self.conveyor_speed / 2.0) * 1500.0
        # Ambient 25°C, thermal rise proportional to load and speed
        target_temp = 25.0 + (self.conveyor_load_kg / 200.0) * 35.0 * (self.motor_rpm / 1500.0)
        target_temp += self.bearing_defect_severity * 18.0   # friction heating from a worn bearing
        self.motor_temp_c += (target_temp - self.motor_temp_c) * (dt / 120.0)

        # Bearing defect vibration: 185 Hz characteristic fault frequency
        # RMS vibration background + defect harmonic
        base_rms = 1.2 + 0.8 * (self.motor_rpm / 1500.0)
        vibration_rms = base_rms + self.bearing_defect_severity * 6.5
        fft_185hz_amp = self.bearing_defect_severity * 4.2 + 0.08 * np.sin(sim_time * 185.0 * 2 * np.pi)

        # Electrical model (15 kW, 400 V induction motor on VFD). Simplified, not a calibrated motor model.
        self.motor_frequency_hz = 50.0 * self.motor_rpm / 1500.0
        load_factor = min(1.2, (self.conveyor_load_kg / 200.0) * (self.motor_rpm / 1500.0))
        if self.motor_rpm > 5.0:
            friction = 0.10 + 0.08 * self.bearing_defect_severity
            self.motor_shaft_kw = 15.0 * min(1.3, friction + 0.80 * load_factor)
        else:
            self.motor_shaft_kw = 0.0
        eta = 0.92 - 0.10 * abs(load_factor - 0.75) if self.motor_shaft_kw > 0 else 0.0
        self.motor_efficiency = max(0.5, eta) if self.motor_shaft_kw > 0 else 0.0
        self.motor_power_factor = 0.62 + 0.26 * min(1.0, load_factor) if self.motor_shaft_kw > 0 else 1.0
        self.motor_input_kw = (self.motor_shaft_kw / self.motor_efficiency) if self.motor_shaft_kw > 0 else 0.25
        self.motor_current_a = (self.motor_input_kw * 1000.0 / (math.sqrt(3.0) * 400.0 * self.motor_power_factor)
                                if self.motor_shaft_kw > 0 else 0.4)
        self.motor_torque_nm = (self.motor_shaft_kw * 1000.0 / (self.motor_rpm * 2 * math.pi / 60.0)
                                if self.motor_rpm > 5.0 else 0.0)

        # 6-DOF Robot Kinematics
        if self.robot_active and self.light_curtain_ok:
            self.robot_cycle_phase = (self.robot_cycle_phase + dt * 1.2) % (2 * math.pi)
            j1 = 45.0 * math.sin(self.robot_cycle_phase)
            j2 = 30.0 * math.cos(self.robot_cycle_phase)
            j3 = -20.0 + 25.0 * math.sin(self.robot_cycle_phase * 2.0)
        else:
            j1, j2, j3 = 0.0, 0.0, 0.0

        self.state_engine.update_telemetry("FAC_CONVEYOR_01", "speed", round(self.conveyor_speed, 3), "m/s", sim_time)
        self.state_engine.update_telemetry("FAC_CONVEYOR_01", "target_speed", round(self.conveyor_target_speed, 3), "m/s", sim_time)
        self.state_engine.update_telemetry("FAC_CONVEYOR_01", "load_kg", round(self.conveyor_load_kg, 1), "kg", sim_time)
        self.state_engine.update_telemetry("FAC_CONVEYOR_01", "part_count", float(self.part_count), "pcs", sim_time)
        self.state_engine.update_telemetry("FAC_CONVEYOR_01", "pull_cord_tripped", 1.0 if self.pull_cord_tripped else 0.0, "bool", sim_time)

        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "rpm", round(self.motor_rpm, 1), "RPM", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "temperature_c", round(self.motor_temp_c, 2), "°C", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "vibration_rms", round(vibration_rms, 2), "mm/s", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "current_a", round(self.motor_current_a, 2), "A", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "frequency_hz", round(self.motor_frequency_hz, 2), "Hz", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "power_kw", round(self.motor_input_kw, 3), "kW", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "power_factor", round(self.motor_power_factor, 3), "cos_phi", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "efficiency_pct", round(self.motor_efficiency * 100.0, 1), "%", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "torque_nm", round(self.motor_torque_nm, 1), "N·m", sim_time)
        self.state_engine.update_telemetry("FAC_VFD_MOTOR_01", "vibration_fft_185hz_amp", round(abs(fft_185hz_amp), 3), "g", sim_time)

        self.state_engine.update_telemetry("FAC_ROBOT_01", "joint1_deg", round(j1, 1), "deg", sim_time)
        self.state_engine.update_telemetry("FAC_ROBOT_01", "joint2_deg", round(j2, 1), "deg", sim_time)
        self.state_engine.update_telemetry("FAC_ROBOT_01", "joint3_deg", round(j3, 1), "deg", sim_time)
        self.state_engine.update_telemetry("FAC_ROBOT_01", "payload_kg", round(self.robot_payload_kg, 2), "kg", sim_time)
        self.state_engine.update_telemetry("FAC_ROBOT_01", "light_curtain_ok", 1.0 if self.light_curtain_ok else 0.0, "bool", sim_time)

        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_FAC_MOTOR_TEMP",
            source_device="FAC_VFD_MOTOR_01",
            tag_id="temperature_c",
            domain=DomainType.FACTORY,
            current_val=self.motor_temp_c,
            limit_val=75.0,
            is_high_alarm=True,
            severity=Severity.HIGH,
            message="Conveyor motor stator temperature exceeded 75°C threshold",
            sim_time=sim_time
        )
        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_FAC_VIBRATION",
            source_device="FAC_VFD_MOTOR_01",
            tag_id="vibration_rms",
            domain=DomainType.FACTORY,
            current_val=vibration_rms,
            limit_val=4.5,
            is_high_alarm=True,
            severity=Severity.CRITICAL,
            message="Bearing vibration RMS in ISO 10816 Zone D (Danger/Trip)",
            sim_time=sim_time
        )
        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_FAC_MOTOR_CURRENT",
            source_device="FAC_VFD_MOTOR_01",
            tag_id="current_a",
            domain=DomainType.FACTORY,
            current_val=self.motor_current_a,
            limit_val=28.0,
            is_high_alarm=True,
            severity=Severity.MEDIUM,
            message="Motor current above 28 A (overload warning)",
            sim_time=sim_time
        )
        if self.pull_cord_tripped:
            self.alarm_engine.evaluate_limit(
                alarm_id="ALM_FAC_PULL_CORD",
                source_device="FAC_CONVEYOR_01",
                tag_id="pull_cord_tripped",
                domain=DomainType.FACTORY,
                current_val=1.0,
                limit_val=0.5,
                is_high_alarm=True,
                severity=Severity.CRITICAL,
                message="Emergency Pull-Cord Tripped - Conveyor Locked",
                sim_time=sim_time
            )

    def handle_command(self, operation: str, parameters: Dict[str, Any]) -> bool:
        op = operation.upper()
        if op == "START":
            if not self.pull_cord_tripped:
                self.conveyor_running = True
                return True
            return False
        elif op == "STOP":
            self.conveyor_running = False
            return True
        elif op == "SET_SPEED":
            self.conveyor_target_speed = float(parameters.get("speed", 1.5))
            return True
        elif op == "E_STOP":
            self.pull_cord_tripped = True
            self.conveyor_running = False
            return True
        elif op == "RESET_TRIP":
            self.pull_cord_tripped = False
            return True
        return False
