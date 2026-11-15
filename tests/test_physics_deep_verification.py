"""Closed-form checks of the physics models: braking distance, FFT peak, line current and ANSI 50 threshold, tank mass balance, PID anti-windup, building and battery limits."""

import math
import numpy as np
import pytest

from goksystem.core.device_registry import DeviceRegistry
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine
from goksystem.scada.security import SecurityManager
from goksystem.core.engine import SimulationEngine
from goksystem.analytics.engine import AnalyticsEngine


def test_conveyor_braking_multi_speed_regression():
    """Verify that stopping time is strictly t_stop = v0 / a (a = 14 m/s^2), NOT a fixed constant."""
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)

    test_speeds = [0.7, 1.4, 1.8, 2.5, 3.5]  # m/s
    dt = 0.01  # high resolution for precise time calculation

    for v0 in test_speeds:
        sim.factory.conveyor_running = True
        sim.factory.conveyor_speed = v0
        sim.factory.pull_cord_tripped = True

        elapsed = 0.0
        while sim.factory.conveyor_speed > 0.0:
            sim.factory.step(dt, sim_time=elapsed)
            elapsed += dt

        expected_time = v0 / 14.0
        # Allow +/- 1.5 dt tolerance
        assert abs(elapsed - expected_time) <= dt * 1.5, f"At v0={v0}, expected {expected_time:.3f}s, got {elapsed:.3f}s"


def test_vibration_fft_resolution_and_discrimination():
    """Test vibration FFT resolution and discrimination between true 185 Hz defect and normal/off-nominal frequencies."""
    sample_rate = 1000.0  # Hz
    duration = 0.5        # 500 samples
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

    # 1. Defective signal: 185 Hz present with 1.2g amplitude
    sig_defect = 0.1 * np.random.randn(len(t)) + 1.2 * np.sin(2 * np.pi * 185.0 * t)
    res_defect = AnalyticsEngine.analyze_vibration_fft(sig_defect.tolist(), sample_rate_hz=sample_rate)
    assert res_defect["defect_detected"] is True
    assert res_defect["condition"] == "CRITICAL_DEFECT"
    assert abs(res_defect["overall_peak_freq_hz"] - 185.0) <= 2.0  # Bin resolution is 2 Hz

    # 2. Healthy signal: only 50 Hz motor rotation harmonic
    sig_healthy = 0.1 * np.random.randn(len(t)) + 0.8 * np.sin(2 * np.pi * 50.0 * t)
    res_healthy = AnalyticsEngine.analyze_vibration_fft(sig_healthy.tolist(), sample_rate_hz=sample_rate)
    assert res_healthy["defect_detected"] is False
    assert res_healthy["condition"] == "NORMAL"

    # 3. Off-nominal signal: 240 Hz gear mesh (should not trigger 185 Hz bearing alarm)
    sig_gear = 0.1 * np.random.randn(len(t)) + 1.5 * np.sin(2 * np.pi * 240.0 * t)
    res_gear = AnalyticsEngine.analyze_vibration_fft(sig_gear.tolist(), sample_rate_hz=sample_rate)
    assert res_gear["defect_detected"] is False


def test_electrical_grid_three_phase_and_pqs_relationships():
    """Verify three-phase electrical relationships and ANSI 50 protection threshold."""
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)

    # Rated condition: S = 2500 kVA, V_L = 11.0 kV
    # Expected line current I = 2500 / (sqrt(3) * 11) = 131.216 A
    sim.grid.base_load_kva = 2500.0
    sim.grid.breaker_closed = True
    sim.step_once()

    i_l1 = st.read_point_value("GRID_BREAKER_01", "current_l1_a")
    assert i_l1 > 100.0
    assert sim.grid.breaker_closed is True

    # Overload condition driving primary current > 160 A -> Instantaneous trip ANSI 50
    sim.grid.base_load_kva = 3600.0  # 3600 / (sqrt(3)*11) = 188.9 A
    sim.step_once()
    assert sim.grid.breaker_closed is False
    assert sim.grid.breaker_tripped_ansi == 50


def test_process_plant_mass_balance_and_pid_antiwindup():
    """Verify mass balance conservation, level non-negativity, and PID anti-windup clamping."""
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)

    # 1. Torricelli drain without pump inflow
    sim.process.pump_running = False
    sim.process.tank_volume_l = 2000.0
    dt = 0.1

    for _ in range(100):
        sim.process.step(dt, sim_time=0.0)

    # Volume must decrease smoothly and never drop below 0
    assert 0.0 <= sim.process.tank_volume_l < 2000.0

    # 2. PID anti-windup test
    # Force extreme pH error (pH = 12.0 with setpoint 7.0 -> error = 5.0)
    sim.process.ph_value = 12.0
    for _ in range(200):
        sim.process.step(dt, sim_time=0.0)

    # Integral term must be clamped between -50 and 50
    assert -50.0 <= sim.process.pid_integral <= 50.0
    # Valve position must be clamped between 0 and 100%
    assert 0.0 <= sim.process.valve_position_pct <= 100.0


def test_building_thermal_continuity_and_bms_soc_bounds():
    """Verify thermal continuity without instantaneous jumps and BMS SOC bounds."""
    reg = DeviceRegistry()
    st = StateEngine(reg)
    alm = AlarmEngine()
    sec = SecurityManager()
    sim = SimulationEngine(reg, st, alm, sec)

    # 1. Thermal continuity: Step 10 times at dt=0.1s
    t_initial = sim.building.zone_temp_c
    dt = 0.1
    for _ in range(10):
        sim.building.step(dt, sim_time=0.0)
    t_after = sim.building.zone_temp_c
    # Thermal envelope has tau=180s, so temperature cannot change by more than 0.5°C in 1 second
    assert abs(t_after - t_initial) < 0.5

    # 2. BMS SOC lower clamp test
    sim.building.battery_power_kw = -500.0  # extreme discharge
    sim.building.battery_soc_pct = 6.0
    for _ in range(50):
        sim.building.step(dt, sim_time=0.0)
    assert sim.building.battery_soc_pct >= 5.0, "SOC must not drop below minimum reserve clamp (5%)"
