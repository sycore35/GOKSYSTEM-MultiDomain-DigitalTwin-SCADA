import type { DeviceRuntimeState } from '../types';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'dim';

export interface DeviceMeta { name: string; short: string; zone: string; key: string; keyLabel: string; digits?: number }

/** Türkçe cihaz adları ve her cihaz için etiketle birlikte gösterilen anahtar ölçüm. */
export const DEVICE_META: Record<string, DeviceMeta> = {
  FAC_CONVEYOR_01: { name: 'Ana montaj konveyörü', short: 'KNV-01', zone: 'Üretim', key: 'speed', keyLabel: 'Hız', digits: 2 },
  FAC_ROBOT_01: { name: 'Robot kol', short: 'ROB-01', zone: 'Üretim', key: 'payload_kg', keyLabel: 'Yük', digits: 1 },
  FAC_VFD_MOTOR_01: { name: 'Sürücülü motor', short: 'MOT-01', zone: 'Üretim', key: 'rpm', keyLabel: 'Devir', digits: 0 },
  PROC_TANK_01: { name: 'Reaktör tankı', short: 'TNK-01', zone: 'Proses', key: 'level_pct', keyLabel: 'Seviye', digits: 1 },
  PROC_PUMP_01: { name: 'Besleme pompası', short: 'PMP-01', zone: 'Proses', key: 'flow_m3h', keyLabel: 'Debi', digits: 1 },
  PROC_VALVE_01: { name: 'Kontrol vanası', short: 'VAN-01', zone: 'Proses', key: 'position_pct', keyLabel: 'Konum', digits: 1 },
  GRID_TRAFO_01: { name: '11 kV / 400 V trafo', short: 'TRF-01', zone: 'Enerji', key: 'load_kva', keyLabel: 'Yük', digits: 0 },
  GRID_BREAKER_01: { name: 'Ana kesici', short: 'KES-01', zone: 'Enerji', key: 'current_l1_a', keyLabel: 'Akım L1', digits: 0 },
  GRID_BUSBAR_11KV: { name: '11 kV bara', short: 'BAR-01', zone: 'Enerji', key: 'total_p_mw', keyLabel: 'Güç', digits: 2 },
  BLD_HVAC_ZONE1: { name: 'Klima santrali', short: 'HVC-01', zone: 'Tesis', key: 'current_temp_c', keyLabel: 'Sıcaklık', digits: 1 },
  BLD_SOLAR_PV_01: { name: 'Güneş paneli dizisi', short: 'GES-01', zone: 'Tesis', key: 'output_kw', keyLabel: 'Çıkış', digits: 1 },
  BLD_BMS_BATTERY_01: { name: 'Batarya sistemi', short: 'BAT-01', zone: 'Tesis', key: 'soc_pct', keyLabel: 'Şarj', digits: 0 },
};

export const deviceName = (id: string, fallback?: string) => DEVICE_META[id]?.name || fallback || id;

export const STATUS_TR: Record<string, string> = {
  ONLINE: 'Çevrimiçi', RUNNING: 'Çalışıyor', WARNING: 'Uyarı', FAULT: 'Arıza', MODEL_FAULT: 'Model hatası',
  OFFLINE: 'Çevrim dışı', STOPPED: 'Durdu', TRIPPED: 'Açtı', ACTIVE: 'Aktif', IDLE: 'Boşta', MAINTENANCE: 'Bakımda',
  NORMAL: 'Normal', UNACK_ALARM: 'Onaysız alarm', ACK_ALARM: 'Onaylı alarm', RTN_UNACK: 'Normale döndü', SHELVED: 'Rafta',
  GOOD: 'İyi', WATCH: 'İzle', SERVICE_SOON: 'Yakında bakım', CRITICAL: 'Kritik', IN_SERVICE: 'Serviste',
};
export const statusTr = (s?: string) => (s && STATUS_TR[s]) || s || '—';

export const statusTone = (s?: string): Tone =>
  ['FAULT', 'CRITICAL', 'UNACK_ALARM', 'MODEL_FAULT', 'TRIPPED'].includes(s || '') ? 'bad'
    : ['WARNING', 'SERVICE_SOON', 'WATCH', 'RTN_UNACK', 'SHELVED', 'MAINTENANCE'].includes(s || '') ? 'warn' : 'ok';

export const TONE_COLOR: Record<Tone, string> = { ok: '#9AA3AB', warn: '#E3A21A', bad: '#F0605D', info: '#4DA3D4', dim: '#7C858D' };

export function fmtNum(v: number | undefined | null, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function keyValue(id: string, d?: DeviceRuntimeState): { label: string; text: string; unit: string } | null {
  const m = DEVICE_META[id]; if (!m || !d) return null;
  const p = d.telemetry?.[m.key]; if (!p) return null;
  return { label: m.keyLabel, text: fmtNum(p.value, m.digits ?? 1), unit: p.unit === 'bool' ? '' : p.unit };
}

export const ZONES = [
  { id: 'all', label: 'Tüm tesis' },
  { id: 'production', label: 'Üretim hattı' },
  { id: 'process', label: 'Proses' },
  { id: 'power', label: 'Elektrik' },
  { id: 'facility', label: 'Bina ve HVAC' },
  { id: 'personnel', label: 'Saha personeli' },
] as const;

/** Telemetri birimlerini Türkçe/okunur biçime çevirir; bool ve anlamsız birimler boş döner. */
const UNIT_TR: Record<string, string> = { pcs: 'adet', deg: '°', cos_phi: '', bool: '', state: '', idx: '', ansi: '', MVAR: 'MVAr', g: 'g' };
export const unitTr = (u?: string) => (u == null ? '' : u in UNIT_TR ? UNIT_TR[u] : u);

const TYPE_TR: Record<string, string> = { BATTERY: 'Batarya', HVAC: 'Klima', INVERTER: 'Evirici', CONVEYOR: 'Konveyör', ROBOT: 'Robot', MOTOR: 'Motor', BREAKER: 'Kesici', OTHER: 'Diğer',
  PLC: 'PLC', PUMP: 'Pompa', VALVE: 'Vana', SENSOR: 'Sensör', TRANSFORMER: 'Trafo', TANK: 'Tank', VFD: 'Sürücü', DRIVE: 'Sürücü' };
export const typeTr = (t?: string) => (t && TYPE_TR[t]) || t || '';
export const zoneTr = (z?: string) => (z || '').replace(/^BUILDING zone$/i, 'Bina').replace(/^FACTORY zone$/i, 'Fabrika').replace(/^GRID zone$/i, 'Elektrik').replace(/^PROCESS zone$/i, 'Proses');
