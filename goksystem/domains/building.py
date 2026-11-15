"""Smart building and microgrid: HVAC zone (tau = 180 s), 150 kW PV array and a 250 kWh battery."""

import math
from typing import Dict, Any
from goksystem.core.models import DomainType
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine, Severity


class BuildingDomain:
    """Smart building thermal management & microgrid domain."""

    def __init__(self, state_engine: StateEngine, alarm_engine: AlarmEngine):
        self.state_engine = state_engine
        self.alarm_engine = alarm_engine
        
        # HVAC Zone 1 (Cleanroom)
        self.zone_temp_c = 21.8
        self.target_temp_c = 21.5
        self.ambient_temp_c = 31.0
        self.humidity_pct = 46.5
        self.co2_ppm = 520.0
        self.hvac_cooling_kw = 24.0
        
        # Solar PV Array (150 kW peak)
        self.solar_irradiance_wm2 = 780.0
        self.solar_output_kw = 110.5
        self.daily_solar_kwh = 430.0
        
        # 250 kWh BESS Storage
        self.battery_soc_pct = 78.5
        self.battery_power_kw = -25.0  # negative = discharging, positive = charging
        self.cell_max_v = 3.385
        self.cell_min_v = 3.372
        self.battery_temp_c = 27.8
        self.balancing_active = True

    def step(self, dt: float, sim_time: float):
        # HVAC Zone 1 Thermal Dynamics
        # Heat gain from ambient + internal loads:
        q_gain = (self.ambient_temp_c - self.zone_temp_c) * 1.8
        # Cooling removal:
        cooling_capacity_kw = 35.0
        temp_error = self.zone_temp_c - self.target_temp_c
        if temp_error > 0.1:
            q_cool = min(cooling_capacity_kw, temp_error * 14.0)
        else:
            q_cool = 4.0  # base ventilation
            
        self.hvac_cooling_kw = q_cool
        # Thermal mass dt / tau (tau = 180 s)
        self.zone_temp_c += ((q_gain - q_cool) / 10.0) * (dt / 180.0)
        
        # CO2 respiration accumulation
        self.co2_ppm = max(400.0, min(1400.0, self.co2_ppm + 0.15 * dt - (q_cool / 10.0) * 0.2 * dt))

        # Solar PV Inverter
        # Diurnal irradiance model
        day_progress = (sim_time % 86400.0) / 86400.0
        # Peak at noon
        solar_elevation = max(0.0, math.sin(day_progress * 2.0 * math.pi))
        self.solar_irradiance_wm2 = 950.0 * solar_elevation
        # 150 kW rated * (irradiance / 1000) * inverter efficiency (0.96)
        self.solar_output_kw = 150.0 * (self.solar_irradiance_wm2 / 1000.0) * 0.96
        self.daily_solar_kwh += (self.solar_output_kw * (dt / 3600.0))

        # BMS 250 kWh LiFePO4 Battery Storage
        # Capacity = 250 kWh
        # dSOC/dt = (P_battery_kw / 250 kWh) * (100% / 3600s)
        self.battery_soc_pct = max(5.0, min(98.0, self.battery_soc_pct + (self.battery_power_kw / 250.0) * (dt / 36.0)))
        
        # Active Cell Balancing (16 cells in series)
        delta_v = abs(self.cell_max_v - self.cell_min_v)
        if delta_v > 0.015:
            self.balancing_active = True
            self.cell_min_v += 0.0001 * dt
            self.cell_max_v -= 0.0001 * dt
        else:
            self.balancing_active = False

        self.state_engine.update_telemetry("BLD_HVAC_ZONE1", "current_temp_c", round(self.zone_temp_c, 2), "°C", sim_time)
        self.state_engine.update_telemetry("BLD_HVAC_ZONE1", "target_temp_c", round(self.target_temp_c, 2), "°C", sim_time)
        self.state_engine.update_telemetry("BLD_HVAC_ZONE1", "humidity_pct", round(self.humidity_pct, 1), "%", sim_time)
        self.state_engine.update_telemetry("BLD_HVAC_ZONE1", "co2_ppm", round(self.co2_ppm, 1), "ppm", sim_time)
        self.state_engine.update_telemetry("BLD_HVAC_ZONE1", "fan_power_kw", round(self.hvac_cooling_kw, 2), "kW", sim_time)

        self.state_engine.update_telemetry("BLD_SOLAR_PV_01", "irradiance_wm2", round(self.solar_irradiance_wm2, 1), "W/m²", sim_time)
        self.state_engine.update_telemetry("BLD_SOLAR_PV_01", "output_kw", round(self.solar_output_kw, 2), "kW", sim_time)
        self.state_engine.update_telemetry("BLD_SOLAR_PV_01", "daily_yield_kwh", round(self.daily_solar_kwh, 2), "kWh", sim_time)

        self.state_engine.update_telemetry("BLD_BMS_BATTERY_01", "soc_pct", round(self.battery_soc_pct, 2), "%", sim_time)
        self.state_engine.update_telemetry("BLD_BMS_BATTERY_01", "power_kw", round(self.battery_power_kw, 2), "kW", sim_time)
        self.state_engine.update_telemetry("BLD_BMS_BATTERY_01", "cell_max_v", round(self.cell_max_v, 3), "V", sim_time)
        self.state_engine.update_telemetry("BLD_BMS_BATTERY_01", "cell_min_v", round(self.cell_min_v, 3), "V", sim_time)
        self.state_engine.update_telemetry("BLD_BMS_BATTERY_01", "balancing_active", 1.0 if self.balancing_active else 0.0, "bool", sim_time)

        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_BLD_CO2_HIGH",
            source_device="BLD_HVAC_ZONE1",
            tag_id="co2_ppm",
            domain=DomainType.BUILDING,
            current_val=self.co2_ppm,
            limit_val=1000.0,
            is_high_alarm=True,
            severity=Severity.LOW,
            message="Cleanroom Zone 1 CO2 concentration exceeded 1,000 ppm",
            sim_time=sim_time
        )
        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_BLD_BMS_LOW_SOC",
            source_device="BLD_BMS_BATTERY_01",
            tag_id="soc_pct",
            domain=DomainType.BUILDING,
            current_val=self.battery_soc_pct,
            limit_val=15.0,
            is_high_alarm=False,
            severity=Severity.HIGH,
            message="BESS State of Charge critical low (< 15%) - Inhibit discharge",
            sim_time=sim_time
        )

    def handle_command(self, operation: str, parameters: Dict[str, Any]) -> bool:
        op = operation.upper()
        if op == "SET_TEMPERATURE_SP":
            self.target_temp_c = float(parameters.get("temperature", 21.5))
            return True
        elif op == "CHARGE":
            kw = float(parameters.get("power_kw", 40.0))
            self.battery_power_kw = abs(kw)
            return True
        elif op == "DISCHARGE":
            kw = float(parameters.get("power_kw", 40.0))
            self.battery_power_kw = -abs(kw)
            return True
        elif op == "IDLE":
            self.battery_power_kw = 0.0
            return True
        return False
