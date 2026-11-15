export interface TelemetryPoint {
  point_id: string;
  value: number;
  unit: string;
  quality: string;
  sim_time: number;
}

export interface DeviceRuntimeState {
  device_id: string;
  domain: string;
  status: string;
  telemetry: Record<string, TelemetryPoint>;
  active_alarms: string[];
  interlocks_engaged: boolean;
  last_update_sim_time: number;
}

export interface AlarmRecord {
  alarm_id: string;
  source_device: string;
  tag_id: string;
  domain: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  current_value: number;
  setpoint_or_limit: number;
  state: 'NORMAL' | 'UNACK_ALARM' | 'ACK_ALARM' | 'RTN_UNACK' | 'SHELVED';
  trigger_sim_time: number;
  ack_by?: string;
}

export interface AuditRecord {
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  status: string;
  details?: Record<string, any>;
}

export interface SystemSummary {
  sim_time: number;
  wall_time: number;
  running: boolean;
  speed_factor: number;
  total_devices: number;
  active_alarms_count: number;
  unack_alarms_count: number;
  kpis: {
    factory_oee_pct?: number;
    factory_parts_total?: number;
    factory_bottleneck_station?: string;
    grid_total_power_mw?: number;
    grid_power_factor?: number;
    grid_voltage_thd_pct?: number;
    grid_frequency_hz?: number;
    process_total_flow_m3h?: number;
    process_max_temperature_c?: number;
    process_reactor_level_pct?: number;
    process_system_pressure_bar?: number;
    building_power_kw?: number;
    building_comfort_score_pct?: number;
    building_solar_generation_kw?: number;
    building_battery_soc_pct?: number;
  };
}
