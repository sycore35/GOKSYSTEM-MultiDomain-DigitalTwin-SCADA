"""Physics and coupled-domain simulation tests."""

import pytest
from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.core.engine import SimulationEngine
from goksystem.analytics.engine import AnalyticsEngine


def test_factory_conveyor_vfd_and_emergency_braking():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)
    
    # Conveyor starts at 1.8 m/s
    assert sim.factory.conveyor_speed == 1.8
    
    # Trip pull-cord emergency stop
    sim.factory.pull_cord_tripped = True
    # Step at dt = 0.1s -> deceleration = 14.0 m/s^2 * 0.1s = 1.4 m/s loss
    sim.step_once()
    assert sim.factory.conveyor_speed <= 0.45
    # Next step must come to a complete halt (speed = 0.0) in < 0.15s
    sim.step_once()
    assert sim.factory.conveyor_speed == 0.0


def test_factory_bearing_vibration_fft():
    # Generate synthetic 185 Hz defective signal
    import numpy as np
    sr = 1000.0
    t = np.linspace(0, 0.5, 500)
    # Background noise + 185 Hz fault peak
    signal = 0.2 * np.random.randn(len(t)) + 1.2 * np.sin(2 * np.pi * 185.0 * t)
    
    res = AnalyticsEngine.analyze_vibration_fft(signal.tolist(), sample_rate_hz=sr)
    assert res["defect_detected"] is True
    assert res["condition"] == "CRITICAL_DEFECT"
    assert abs(res["overall_peak_freq_hz"] - 185.0) < 5.0


def test_grid_substation_transformer_thermal_and_trips():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)
    
    # Transformer thermal model step
    t_oil_0 = sim.grid.oil_temp_c
    for _ in range(50):
        sim.step_once()
        
    # Transformer temperatures must evolve smoothly without numerical instability
    assert 20.0 < sim.grid.oil_temp_c < 120.0
    assert 20.0 < sim.grid.winding_hotspot_c < 140.0
    
    # ANSI 50 Instantaneous Overcurrent trip test
    sim.grid.base_load_kva = 8000.0  # Excessive overload
    sim.step_once()
    assert sim.grid.breaker_closed is False
    assert sim.grid.breaker_tripped_ansi == 50


def test_process_fluid_torricelli_mass_balance():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)
    
    # Turn off pump -> pure Torricelli drain
    sim.process.pump_running = False
    vol_0 = sim.process.tank_volume_l
    
    for _ in range(10):
        sim.step_once()
        
    vol_1 = sim.process.tank_volume_l
    assert vol_1 < vol_0, "Tank volume must decrease strictly according to Torricelli discharge"
    assert vol_1 >= 0.0, "Volume cannot become negative"


def test_building_microgrid_solar_and_bms():
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)
    
    # Battery discharge mode
    sim.building.battery_power_kw = -50.0  # 50 kW discharge
    soc_0 = sim.building.battery_soc_pct
    
    for _ in range(20):
        sim.step_once()
        
    soc_1 = sim.building.battery_soc_pct
    assert soc_1 < soc_0, "State of charge must decrease during discharge"
    assert sim.building.cell_max_v > sim.building.cell_min_v
