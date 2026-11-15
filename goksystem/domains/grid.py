"""11 kV / 400 V, 2.5 MVA substation: transformer thermal model (top-oil tau = 300 s), VCB, ANSI 50 and thermal trips, and complex power calculation."""

import math
from typing import Dict, Any
from goksystem.core.models import DomainType
from goksystem.core.state_engine import StateEngine
from goksystem.scada.alarm_engine import AlarmEngine, Severity


class GridDomain:
    """Electrical distribution grid and substation simulation."""

    def __init__(self, state_engine: StateEngine, alarm_engine: AlarmEngine):
        self.state_engine = state_engine
        self.alarm_engine = alarm_engine
        
        self.v_primary_kv = 11.0
        self.v_secondary_v = 400.0
        self.breaker_closed = True
        self.breaker_tripped_ansi = 0
        
        self.base_load_kva = 1650.0  # 66% of 2.5 MVA rating
        self.power_factor = 0.92
        self.ambient_temp_c = 28.0
        
        # IEEE C57.91 Thermal Model
        self.oil_temp_c = 52.0
        self.winding_hotspot_c = 68.0

    def step(self, dt: float, sim_time: float, factory_load_kw: float = 45.0, building_load_kw: float = 120.0):
        # Total Load Demand (coupling factory & building demand)
        total_p_kw = (self.base_load_kva * self.power_factor) + (factory_load_kw if self.breaker_closed else 0.0) + (building_load_kw if self.breaker_closed else 0.0)
        if not self.breaker_closed:
            total_p_kw = 0.0
            
        total_s_kva = total_p_kw / self.power_factor if self.breaker_closed else 0.0
        total_q_kvar = math.sqrt(max(0.0, total_s_kva**2 - total_p_kw**2)) if self.breaker_closed else 0.0

        # Three-phase current at 11 kV: I = S / (sqrt(3) * V)
        if self.breaker_closed and self.v_primary_kv > 0.1:
            i_primary_a = total_s_kva / (math.sqrt(3.0) * self.v_primary_kv)
            i_sec_a = (total_s_kva * 1000.0) / (math.sqrt(3.0) * self.v_secondary_v)
        else:
            i_primary_a = 0.0
            i_sec_a = 0.0

        # IEEE C57.91 Transformer Thermal Model
        # Rated load ratio K = S / S_rated (S_rated = 2500 kVA)
        k_ratio = total_s_kva / 2500.0 if self.breaker_closed else 0.0
        
        # Ultimate top-oil rise: delta_theta_oil = delta_theta_oil_rated * K^1.6
        rated_oil_rise = 45.0
        target_oil_temp = self.ambient_temp_c + rated_oil_rise * (k_ratio ** 1.6)
        # Oil thermal time constant: tau_oil = 300 s
        self.oil_temp_c += (target_oil_temp - self.oil_temp_c) * (dt / 300.0)
        
        # Winding hotspot: theta_hs = theta_oil + delta_theta_hs_rated * K^1.6
        rated_hs_rise = 28.0
        target_hs_temp = self.oil_temp_c + rated_hs_rise * (k_ratio ** 1.6)
        # Winding thermal time constant: tau_w = 40 s
        self.winding_hotspot_c += (target_hs_temp - self.winding_hotspot_c) * (dt / 40.0)

        # ANSI Protection Relaying
        # ANSI 50: Instantaneous Overcurrent trip (> 160 A on 11kV primary)
        if self.breaker_closed and i_primary_a > 160.0:
            self.breaker_closed = False
            self.breaker_tripped_ansi = 50
        # Hotspot thermal overload trip (> 130°C)
        elif self.breaker_closed and self.winding_hotspot_c > 130.0:
            self.breaker_closed = False
            self.breaker_tripped_ansi = 49  # ANSI 49 Thermal Overload

        self.state_engine.update_telemetry("GRID_TRAFO_01", "v_primary_kv", round(self.v_primary_kv, 2), "kV", sim_time)
        self.state_engine.update_telemetry("GRID_TRAFO_01", "v_secondary_v", round(self.v_secondary_v if self.breaker_closed else 0.0, 1), "V", sim_time)
        self.state_engine.update_telemetry("GRID_TRAFO_01", "load_kva", round(total_s_kva, 1), "kVA", sim_time)
        self.state_engine.update_telemetry("GRID_TRAFO_01", "power_factor", round(self.power_factor, 3), "cos_phi", sim_time)
        self.state_engine.update_telemetry("GRID_TRAFO_01", "oil_temp_c", round(self.oil_temp_c, 2), "°C", sim_time)
        self.state_engine.update_telemetry("GRID_TRAFO_01", "winding_hotspot_c", round(self.winding_hotspot_c, 2), "°C", sim_time)

        self.state_engine.update_telemetry("GRID_BREAKER_01", "state", 1.0 if self.breaker_closed else 0.0, "state", sim_time)
        self.state_engine.update_telemetry("GRID_BREAKER_01", "current_l1_a", round(i_primary_a, 2), "A", sim_time)
        self.state_engine.update_telemetry("GRID_BREAKER_01", "tripped_ansi_code", float(self.breaker_tripped_ansi), "ansi", sim_time)

        self.state_engine.update_telemetry("GRID_BUSBAR_11KV", "voltage_kv", round(self.v_primary_kv, 2), "kV", sim_time)
        self.state_engine.update_telemetry("GRID_BUSBAR_11KV", "total_p_mw", round(total_p_kw / 1000.0, 3), "MW", sim_time)
        self.state_engine.update_telemetry("GRID_BUSBAR_11KV", "total_q_mvar", round(total_q_kvar / 1000.0, 3), "MVAR", sim_time)

        self.alarm_engine.evaluate_limit(
            alarm_id="ALM_GRID_HOTSPOT",
            source_device="GRID_TRAFO_01",
            tag_id="winding_hotspot_c",
            domain=DomainType.GRID,
            current_val=self.winding_hotspot_c,
            limit_val=110.0,
            is_high_alarm=True,
            severity=Severity.HIGH,
            message="Transformer winding hotspot temperature exceeded 110°C limit",
            sim_time=sim_time
        )
        if self.breaker_tripped_ansi > 0:
            self.alarm_engine.evaluate_limit(
                alarm_id="ALM_GRID_BREAKER_TRIP",
                source_device="GRID_BREAKER_01",
                tag_id="tripped_ansi_code",
                domain=DomainType.GRID,
                current_val=float(self.breaker_tripped_ansi),
                limit_val=0.5,
                is_high_alarm=True,
                severity=Severity.CRITICAL,
                message=f"Breaker tripped on ANSI {self.breaker_tripped_ansi} protection lock-out",
                sim_time=sim_time
            )

    def handle_command(self, operation: str, parameters: Dict[str, Any]) -> bool:
        op = operation.upper()
        if op == "CLOSE":
            if self.breaker_tripped_ansi == 0:
                self.breaker_closed = True
                return True
            return False
        elif op == "OPEN":
            self.breaker_closed = False
            return True
        elif op == "RESET_PROTECTION":
            self.breaker_tripped_ansi = 0
            return True
        elif op == "TAP_UP":
            self.v_secondary_v = min(440.0, self.v_secondary_v + 5.0)
            return True
        elif op == "TAP_DOWN":
            self.v_secondary_v = max(360.0, self.v_secondary_v - 5.0)
            return True
        return False
