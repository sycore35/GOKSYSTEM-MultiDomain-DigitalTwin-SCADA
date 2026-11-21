import React from 'react';
import { DigitalTwin3D } from './DigitalTwin3D';
import { SystemSummary, DeviceRuntimeState, AlarmRecord } from '../types';
import { KpiStrip, Panel, LinkBtn, KV } from '../platform/kit';
import { DEVICE_META, deviceName, fmtNum, keyValue, statusTone, statusTr, alarmText } from '../platform/meta';

interface OverviewProps {
  summary: SystemSummary | null;
  devices: Record<string, DeviceRuntimeState>;
  alarms: AlarmRecord[];
  onSelectDevice: (deviceId: string) => void;
  onNavigateTab: (tab: string) => void;
  selectedDeviceId?: string | null;
}

const sevTr: Record<string, string> = { CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük', INFO: 'Bilgi' };

export const EnterpriseOverview: React.FC<OverviewProps> = ({ summary, devices, alarms, onSelectDevice, onNavigateTab, selectedDeviceId }) => {
  const k: any = summary?.kpis || {};
  const tv = (id: string, p: string) => devices[id]?.telemetry?.[p]?.value;
  const active = alarms.filter(a => a.state !== 'NORMAL' && a.state !== 'SHELVED');
  const ids = Object.keys(DEVICE_META);
  const abnormal = ids.filter(id => ['WARNING', 'FAULT', 'MODEL_FAULT'].includes(devices[id]?.status || '')).length;
  const nodeCount = Object.keys(devices).length || summary?.total_devices || 0;

  return (
    <div>
      <KpiStrip items={[
        { label: 'İzlenen cihaz', value: nodeCount, hint: abnormal ? `${abnormal} cihaz anormal` : 'Hepsi normal', tone: abnormal ? 'warn' : 'ok' },
        { label: 'Aktif alarm', value: active.length, hint: `${summary?.unack_alarms_count ?? 0} onay bekliyor`, tone: active.length ? 'bad' : 'ok' },
        { label: 'Fabrika OEE', value: fmtNum(k.factory_oee_pct, 1), unit: '%', hint: `${fmtNum(k.factory_parts_total, 0)} parça üretildi` },
        { label: 'Şebeke yükü', value: fmtNum(k.grid_total_power_mw, 2), unit: 'MW', hint: `cos φ ${fmtNum(k.grid_power_factor, 2)}` },
        { label: 'Reaktör seviyesi', value: fmtNum(k.process_tank_level_pct, 1), unit: '%', hint: `pH ${fmtNum(k.process_ph_value, 2)}` },
        { label: 'Güneş üretimi', value: fmtNum(k.building_solar_kw, 1), unit: 'kW', hint: `Batarya %${fmtNum(k.building_battery_soc_pct, 0)}` },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] mb-4">
        <Panel title="Tesis 3B görünümü" right={<LinkBtn onClick={() => onNavigateTab('twin')}>Tam ekran aç</LinkBtn>} flush>
          <DigitalTwin3D devices={devices} alarms={alarms} onSelectDevice={onSelectDevice} selectedDeviceId={selectedDeviceId} compact />
        </Panel>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel title={`Aktif alarmlar (${active.length})`} right={<LinkBtn onClick={() => onNavigateTab('alarms')}>Alarm merkezi</LinkBtn>}>
            {active.length === 0 ? (
              <p style={{ color: 'var(--p-muted)' }}>Aktif alarm yok. Tüm sistemler normal sınırlarda çalışıyor.</p>
            ) : (
              <ul className="space-y-2">
                {active.slice(0, 5).map(a => (
                  <li key={a.alarm_id} className="flex gap-2 items-start text-[14px]">
                    <span className="dot mt-1.5" data-tone={a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'bad' : 'warn'} />
                    <div className="min-w-0"><div className="font-medium truncate">{deviceName(a.source_device)}</div>
                      <div style={{ color: 'var(--p-muted)', fontSize: 13 }}>{alarmText(a)} · {sevTr[a.severity]}</div></div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Cihaz durumu" flush bodyClass="max-h-[470px] overflow-y-auto">
            <ul>
              {ids.map(id => {
                const d = devices[id]; const kv = keyValue(id, d); const tone = statusTone(d?.status);
                return (
                  <li key={id}>
                    <button onClick={() => onSelectDevice(id)} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-[var(--p-hover)]" style={{ borderBottom: '1px solid var(--p-border)' }}>
                      <span className="dot" data-tone={tone === 'ok' ? undefined : tone} />
                      <span className="flex-1 min-w-0"><span className="block text-[14px] truncate">{DEVICE_META[id].name}</span>
                        <span className="block text-[12px]" style={{ color: tone === 'ok' ? 'var(--p-dim)' : `var(--p-${tone === 'bad' ? 'bad' : 'warn'})` }}>{DEVICE_META[id].short} · {statusTr(d?.status)}</span></span>
                      {kv && <span className="font-value text-[14px] shrink-0">{kv.text}<span style={{ color: 'var(--p-dim)', fontSize: 12, marginLeft: 3 }}>{kv.unit}</span></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel title="Akıllı Fabrika" right={<LinkBtn onClick={() => onNavigateTab('factory')}>Aç</LinkBtn>}>
          <KV label="Genel verimlilik (OEE)" value={fmtNum(k.factory_oee_pct, 1)} unit="%" />
          <KV label="Üretilen parça" value={fmtNum(k.factory_parts_total, 0)} unit="adet" />
          <KV label="Konveyör hızı" value={fmtNum(tv('FAC_CONVEYOR_01', 'speed'), 2)} unit="m/sn" />
        </Panel>
        <Panel title="Proses" right={<LinkBtn onClick={() => onNavigateTab('process')}>Aç</LinkBtn>}>
          <KV label="Reaktör seviyesi" value={fmtNum(k.process_tank_level_pct, 1)} unit="%" />
          <KV label="Reaktör sıcaklığı" value={fmtNum(tv('PROC_TANK_01', 'temp_c'), 1)} unit="°C" />
          <KV label="Pompa debisi" value={fmtNum(tv('PROC_PUMP_01', 'flow_m3h'), 1)} unit="m³/sa" />
        </Panel>
        <Panel title="Elektrik şebekesi" right={<LinkBtn onClick={() => onNavigateTab('grid')}>Aç</LinkBtn>}>
          <KV label="Aktif güç" value={fmtNum(k.grid_total_power_mw, 2)} unit="MW" />
          <KV label="Güç faktörü" value={fmtNum(k.grid_power_factor, 2)} />
          <KV label="Trafo yağ sıcaklığı" value={fmtNum(tv('GRID_TRAFO_01', 'oil_temp_c'), 1)} unit="°C" />
        </Panel>
        <Panel title="Bina ve mikro şebeke" right={<LinkBtn onClick={() => onNavigateTab('building')}>Aç</LinkBtn>}>
          <KV label="Oda sıcaklığı" value={fmtNum(tv('BLD_HVAC_ZONE1', 'current_temp_c'), 1)} unit="°C" />
          <KV label="Bina gücü (klima)" value={fmtNum(tv('BLD_HVAC_ZONE1', 'fan_power_kw'), 1)} unit="kW" />
          <KV label="Güneş üretimi" value={fmtNum(k.building_solar_kw, 1)} unit="kW" />
          <KV label="Batarya şarjı" value={fmtNum(k.building_battery_soc_pct, 0)} unit="%" />
        </Panel>
      </div>
    </div>
  );
};
