import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Play, Square, RotateCcw, Zap, TriangleAlert, OctagonX } from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';
import { Panel } from '../platform/kit';
import { DEVICE_META, unitTr, fmtNum, statusTone, statusTr, alarmText } from '../platform/meta';
import { POINT_TR } from '../platform/InspectorPanel';
import { useTr } from '../platform/ui';

type Icon = LucideIcon;
interface Cmd { label: string; device: string; op: string; params?: any; icon?: Icon; tone?: 'danger' }
interface Flt { label: string; hint: string; device: string; fault: string; params?: any }
interface Domain { devices: string[]; commands: Cmd[]; faults: Flt[] }

/** Dört alan sayfasının ortak düzeni. Cihaz kimlikleri, komutlar ve arızalar motorun gerçek arayüzüyle birebir. */
const DOMAINS: Record<string, Domain> = {
  factory: {
    devices: ['FAC_CONVEYOR_01', 'FAC_ROBOT_01', 'FAC_VFD_MOTOR_01'],
    commands: [
      { label: 'Konveyörü başlat', device: 'FAC_CONVEYOR_01', op: 'START', icon: Play },
      { label: 'Konveyörü durdur', device: 'FAC_CONVEYOR_01', op: 'STOP', icon: Square },
      { label: 'Hızı 1,2 m/sn yap', device: 'FAC_CONVEYOR_01', op: 'SET_SPEED', params: { speed: 1.2 }, icon: Zap },
      { label: 'Hızı 1,8 m/sn yap', device: 'FAC_CONVEYOR_01', op: 'SET_SPEED', params: { speed: 1.8 }, icon: Zap },
      { label: 'Acil durdur', device: 'FAC_CONVEYOR_01', op: 'E_STOP', icon: OctagonX, tone: 'danger' },
      { label: 'Acil durdurmayı sıfırla', device: 'FAC_CONVEYOR_01', op: 'RESET_TRIP', icon: RotateCcw },
    ],
    faults: [
      { label: 'Motor rulman aşınması', hint: 'Titreşim ve sıcaklık yükselir', device: 'FAC_VFD_MOTOR_01', fault: 'BEARING_WEAR', params: { severity: 0.8 } },
      { label: 'Motor aşırı yükü', hint: 'Akım ve tork artar', device: 'FAC_VFD_MOTOR_01', fault: 'MOTOR_OVERLOAD', params: { load_kg: 300 } },
      { label: 'Acil çekme ipi açması', hint: 'Konveyör kilitlenir', device: 'FAC_CONVEYOR_01', fault: 'PULL_CORD_TRIP' },
    ],
  },
  process: {
    devices: ['PROC_TANK_01', 'PROC_PUMP_01', 'PROC_VALVE_01'],
    commands: [
      { label: 'Pompayı başlat', device: 'PROC_PUMP_01', op: 'START', icon: Play },
      { label: 'Pompayı durdur', device: 'PROC_PUMP_01', op: 'STOP', icon: Square },
      { label: 'Vana %25', device: 'PROC_VALVE_01', op: 'SET_POSITION', params: { position: 25 }, icon: Zap },
      { label: 'Vana %50', device: 'PROC_VALVE_01', op: 'SET_POSITION', params: { position: 50 }, icon: Zap },
      { label: 'Vana %75', device: 'PROC_VALVE_01', op: 'SET_POSITION', params: { position: 75 }, icon: Zap },
    ],
    faults: [
      { label: 'Tahliye tıkanıklığı', hint: 'Tank seviyesi yükselir', device: 'PROC_TANK_01', fault: 'DRAIN_BLOCKAGE' },
      { label: 'pH sapması', hint: 'pH değeri +0,8 kayar', device: 'PROC_TANK_01', fault: 'PH_EXCURSION', params: { delta: 0.8 } },
      { label: 'Pompa rulman aşınması', hint: 'Pompa titreşimi artar', device: 'PROC_PUMP_01', fault: 'PUMP_BEARING_WEAR', params: { severity: 0.7 } },
    ],
  },
  grid: {
    devices: ['GRID_TRAFO_01', 'GRID_BREAKER_01', 'GRID_BUSBAR_11KV'],
    commands: [
      { label: 'Kesiciyi kapat', device: 'GRID_BREAKER_01', op: 'CLOSE', icon: Play },
      { label: 'Kesiciyi aç', device: 'GRID_BREAKER_01', op: 'OPEN', icon: Square },
      { label: 'Korumayı sıfırla', device: 'GRID_BREAKER_01', op: 'RESET_PROTECTION', icon: RotateCcw },
    ],
    faults: [{ label: 'Aşırı akım açması', hint: 'Kesici ANSI 50 ile açar', device: 'GRID_BREAKER_01', fault: 'OVERCURRENT_TRIP' }],
  },
  building: {
    devices: ['BLD_HVAC_ZONE1', 'BLD_SOLAR_PV_01', 'BLD_BMS_BATTERY_01'],
    commands: [
      { label: 'Oda hedefi 21 °C', device: 'BLD_HVAC_ZONE1', op: 'SET_TEMPERATURE_SP', params: { temperature: 21 }, icon: Zap },
      { label: 'Oda hedefi 23 °C', device: 'BLD_HVAC_ZONE1', op: 'SET_TEMPERATURE_SP', params: { temperature: 23 }, icon: Zap },
    ],
    faults: [],
  },
};

const sevTr: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük', INFO: 'Bilgi' };

interface Props {
  domain: 'factory' | 'process' | 'grid' | 'building';
  devices: Record<string, DeviceRuntimeState>; alarms: AlarmRecord[];
  onCommand: (d: string, op: string, p?: any) => void; onInjectFault: (d: string, f: string, p?: any) => void;
}

export const DomainView: React.FC<Props> = ({ domain, devices, alarms, onCommand, onInjectFault }) => {
  useTr();
  const cfg = DOMAINS[domain];
  const active = alarms.filter(a => cfg.devices.includes(a.source_device) && a.state !== 'NORMAL' && a.state !== 'SHELVED');
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {cfg.devices.map(id => {
          const d = devices[id]; const m = DEVICE_META[id]; const tone = statusTone(d?.status);
          const pts = Object.values(d?.telemetry || {});
          return (
            <Panel key={id} title={<span className="flex items-center gap-2"><span className="dot" data-tone={tone === 'ok' ? undefined : tone} />{m.name}</span>}
              right={<span className="p-badge" data-tone={tone === 'ok' ? undefined : tone}>{statusTr(d?.status)}</span>} flush>
              <div className="px-4 pt-2 text-[12px]" style={{ color: 'var(--p-dim)' }}>{m.short} · {id}</div>
              <dl className="px-4 py-2">
                {pts.map(p => (
                  <div key={p.point_id} className="flex items-baseline justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--p-border)' }}>
                    <dt style={{ color: 'var(--p-muted)', fontSize: 14 }}>{POINT_TR[p.point_id] || p.point_id.replace(/_/g, ' ')}</dt>
                    <dd className="font-value" style={{ margin: 0, fontSize: 14 }}>
                      {p.unit === 'bool' ? (p.value ? 'Evet' : 'Hayır') : fmtNum(p.value, Math.abs(p.value) >= 1000 ? 0 : 2)}
                      {unitTr(p.unit) && <span style={{ color: 'var(--p-dim)', fontSize: 12, marginLeft: 4 }}>{unitTr(p.unit)}</span>}
                    </dd>
                  </div>
                ))}
                {pts.length === 0 && <p className="py-3" style={{ color: 'var(--p-muted)' }}>Veri bekleniyor…</p>}
              </dl>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <Panel title="Operatör komutları">
          <div className="flex flex-wrap gap-2">
            {cfg.commands.map(c => { const I = c.icon; return (
              <button key={c.label} type="button" className={`p-btn ${c.tone || ''}`} onClick={() => onCommand(c.device, c.op, c.params)}>{I && <I size={15} />}{c.label}</button>
            ); })}
          </div>
        </Panel>
        <Panel title="Arıza enjeksiyonu (simülasyon)">
          {cfg.faults.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>Bu alan için tanımlı arıza senaryosu yok. Genel senaryolar için Senaryolar sayfasını kullanın.</p> : (
            <div className="flex flex-col gap-2">
              {cfg.faults.map(f => (
                <button key={f.fault} type="button" className="p-btn text-left justify-start h-auto py-2" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }} onClick={() => onInjectFault(f.device, f.fault, f.params)}>
                  <span className="flex items-center gap-2"><TriangleAlert size={15} style={{ color: 'var(--p-warn)' }} />{f.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--p-muted)', fontWeight: 400 }}>{f.hint}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel title={`Aktif alarmlar (${active.length})`}>
          {active.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>Bu alanda aktif alarm yok.</p> : (
            <ul className="space-y-2">
              {active.map(a => (
                <li key={a.alarm_id} className="flex gap-2 items-start text-[14px]">
                  <span className="dot mt-1.5" data-tone={a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'bad' : 'warn'} />
                  <div className="min-w-0"><div className="font-medium">{DEVICE_META[a.source_device]?.name || a.source_device}</div>
                    <div style={{ color: 'var(--p-muted)', fontSize: 13 }}>{alarmText(a)} · {sevTr[a.severity]}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};
