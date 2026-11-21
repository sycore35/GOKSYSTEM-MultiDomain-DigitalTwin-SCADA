import React, { useRef, useState } from 'react';
import { Activity, Battery, Bot, Cable, Cog, Database, Fan, Gauge, Monitor, MonitorCog, Server, ShieldCheck, Sun, ToggleRight, Waves, Zap, Container, Cpu, CircuitBoard } from 'lucide-react';
import type { AlarmRecord, DeviceRuntimeState, SystemSummary } from '../types';
import { usePoll } from './api';
import { DEVICE_META, keyValue, statusTone, statusTr } from './meta';
import { CommDiagram } from './CommDiagram';
import { Card, Table } from './ui';

/** Tesis mimarisi: Purdue tarzı katmanlar, 12 varlık, kartları ve ağlar — hepsi canlı veriyle. */

const AREAS = [
  { id: 'Üretim', title: 'Üretim hattı', devices: ['FAC_CONVEYOR_01', 'FAC_ROBOT_01', 'FAC_VFD_MOTOR_01'] },
  { id: 'Proses', title: 'Proses', devices: ['PROC_TANK_01', 'PROC_PUMP_01', 'PROC_VALVE_01'] },
  { id: 'Enerji', title: 'Elektrik', devices: ['GRID_TRAFO_01', 'GRID_BREAKER_01', 'GRID_BUSBAR_11KV'] },
  { id: 'Tesis', title: 'Bina ve enerji depolama', devices: ['BLD_HVAC_ZONE1', 'BLD_SOLAR_PV_01', 'BLD_BMS_BATTERY_01'] },
];

const ICON: Record<string, React.FC<any>> = {
  FAC_CONVEYOR_01: Cog, FAC_ROBOT_01: Bot, FAC_VFD_MOTOR_01: Gauge, PROC_TANK_01: Container, PROC_PUMP_01: Waves,
  PROC_VALVE_01: ToggleRight, GRID_TRAFO_01: Zap, GRID_BREAKER_01: Activity, GRID_BUSBAR_11KV: Cable,
  BLD_HVAC_ZONE1: Fan, BLD_SOLAR_PV_01: Sun, BLD_BMS_BATTERY_01: Battery,
};

const TONE_VAR: Record<string, string> = { ok: 'var(--p-dim)', warn: 'var(--p-warn)', bad: 'var(--p-bad)', info: 'var(--p-info)', dim: 'var(--p-dim)' };

const LevelHead: React.FC<{ n: number; title: string; sub: string }> = ({ n, title, sub }) => (
  <div className="mb-2">
    <div style={{ font: '600 12px var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--p-dim)' }}>Seviye {n} · {title}</div>
    <div style={{ fontSize: 13, color: 'var(--p-muted)' }}>{sub}</div>
  </div>
);

const Band: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-[4px] p-3 md:p-4" style={{ background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>{children}</section>
);

const Node: React.FC<{ icon: React.FC<any>; title: string; addr?: string; children?: React.ReactNode }> = ({ icon: I, title, addr, children }) => (
  <div className="rounded-[3px] p-3 min-w-0" style={{ background: 'var(--p-raised)', border: '1px solid var(--p-border)' }}>
    <div className="flex items-center gap-2">
      <I size={18} aria-hidden="true" style={{ color: 'var(--p-muted)', flexShrink: 0 }} />
      <span className="truncate" style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
    </div>
    {addr && <div className="font-value" style={{ fontSize: 12, color: 'var(--p-dim)' }}>{addr}</div>}
    {children && <div className="mt-2" style={{ fontSize: 13, color: 'var(--p-muted)' }}>{children}</div>}
  </div>
);

const Led: React.FC<{ on: boolean; label: string }> = ({ on, label }) => (
  <span className="inline-flex items-center gap-1 font-value" style={{ fontSize: 11.5, color: on ? 'var(--p-text)' : 'var(--p-dim)' }} title={`${label} ${on ? 'açık' : 'kapalı'}`}>
    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 7, background: on ? 'var(--p-accent)' : 'transparent', border: `1.5px solid ${on ? 'var(--p-accent)' : 'var(--p-border-strong)'}` }} />
    {label}<span className="sr-only">{on ? ' açık' : ' kapalı'}</span>
  </span>
);

/** Kart kutusu: kimlik, Modbus adresi, RUN göstergesi (tarama sayacı ilerliyorsa) ve DO LED'leri. */
const CardTile: React.FC<{ card: any; node: any; running: boolean; onOpen: () => void }> = ({ card, node, running, onOpen }) => (
  <button onClick={onOpen} className="w-full text-left rounded-[3px] p-2.5" aria-label={`${card.card_id} kartını aç`}
    style={{ minHeight: 44, background: 'var(--p-raised)', border: `1px solid ${card.family === 'smart' ? 'var(--p-accent)' : 'var(--p-border-strong)'}`, color: 'var(--p-text)' }}>
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 min-w-0">
        {card.family === 'smart' ? <CircuitBoard size={15} aria-hidden="true" style={{ color: 'var(--p-accent)' }} /> : <Cpu size={15} aria-hidden="true" style={{ color: 'var(--p-muted)' }} />}
        <span className="font-value truncate" style={{ fontSize: 13 }}>{card.card_id}</span>
      </span>
      {card.family === 'plc'
        ? <span className="font-value px-1.5 rounded-[2px]" style={{ fontSize: 11, background: running ? 'var(--p-accent-bg)' : 'var(--p-sunken)', color: running ? 'var(--p-accent)' : 'var(--p-dim)', border: `1px solid ${running ? 'var(--p-accent)' : 'var(--p-border)'}` }}>{running ? 'RUN' : 'STOP'}</span>
        : <span className="font-value" style={{ fontSize: 11, color: 'var(--p-accent)' }}>AKILLI</span>}
    </div>
    <div className="font-value" style={{ fontSize: 11.5, color: 'var(--p-dim)' }}>Modbus @{card.address} · {card.family === 'plc' ? 'PLC I/O' : 'I²C + RS-485'}</div>
    {card.family === 'plc' && node.outputs.length > 0 && (
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">{node.outputs.map((o: any) => <Led key={o.ch} on={o.on} label={o.ch} />)}</div>
    )}
  </button>
);

const DeviceTile: React.FC<{ id: string; d?: DeviceRuntimeState; onOpen: () => void }> = ({ id, d, onOpen }) => {
  const I = ICON[id] || Cog;
  const kv = keyValue(id, d);
  const tone = statusTone(d?.status);
  return (
    <button onClick={onOpen} className="w-full text-left rounded-[3px] p-2.5" aria-label={`${DEVICE_META[id]?.name || id}: ${statusTr(d?.status)}. Kartını aç`}
      style={{ minHeight: 44, background: 'var(--p-sunken)', border: `1px solid ${tone === 'ok' ? 'var(--p-border)' : TONE_VAR[tone]}`, color: 'var(--p-text)' }}>
      <div className="flex items-center gap-2">
        <I size={20} aria-hidden="true" style={{ color: tone === 'ok' ? 'var(--p-muted)' : TONE_VAR[tone], flexShrink: 0 }} />
        <div className="min-w-0">
          <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600 }}>{DEVICE_META[id]?.name || id}</div>
          <div className="font-value" style={{ fontSize: 11.5, color: 'var(--p-dim)' }}>{DEVICE_META[id]?.short}</div>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-1.5">
        <span className="font-value" style={{ fontSize: 20 }}>{kv ? kv.text : '—'}<span style={{ fontSize: 12, color: 'var(--p-dim)' }}> {kv?.unit}</span></span>
        <span className="inline-flex items-center gap-1" style={{ fontSize: 12, color: tone === 'ok' ? 'var(--p-muted)' : TONE_VAR[tone] }}>
          <span aria-hidden="true" className="dot" data-tone={tone === 'ok' ? undefined : tone} />{statusTr(d?.status)}
        </span>
      </div>
    </button>
  );
};

const PROTOCOLS: [string, string, string, string][] = [
  ['HTTP REST', 'Operatör HMI, mühendislik ist. ⇄ SCADA sunucusu', '/api/v1 (FastAPI)', 'Komut, yapılandırma, sorgu'],
  ['WebSocket', 'SCADA sunucusu → operatör HMI', '/ws, 100 ms', 'Değişen noktaların canlı akışı'],
  ['Modbus TCP', 'Protokol ağ geçidi, bölge ağ geçitleri, Factory I/O', '127.0.0.1:5020', 'Gerçek sunucu; yazma varsayılan kapalı. Bölge ağ geçitleri simüle tesis modelidir'],
  ['MQTT', 'SCADA → dış sistemler', 'goksystem/telemetry/{alan}/{cihaz}/{nokta}', 'Broker yoksa dahili veri yolu kullanılır'],
  ['OPC UA', 'SCADA → dış sistemler', 'ns=2;s=GOKSYSTEM.*', 'Yalnız düğüm modeli; ağ sunucusu değil'],
  ['Modbus RTU (RS-485)', 'Ağ geçidi ⇄ PLC kartları; PLC kartı ⇄ VFD, analizör, BMS; akıllı kart ⇄ PLC kartı', '19200 8E1, kart adresleri 10–43 / 111–141', 'MAX3485 + SM712 korumalı hat, 120 Ω sonlandırma'],
  ['4–20 mA', 'Transmitter → PLC/akıllı kart analog girişi', '150 Ω şönt, 12 bit ADC', 'NAMUR NE 43: 3,8 / 20,5 mA doyma'],
  ['24 V dijital', 'Saha kontakları → DI; DO → ara röleler', 'PC817 opto · AO3400A MOSFET', 'Kart çıkışları tesise komut göndermez'],
  ['I²C', 'Akıllı kart → sensör modülü', 'ADXL355 0x1D · SHT31 0x44', 'Titreşim, sıcaklık/nem'],
  ['SQLite WAL', 'SCADA sunucusu → historian, denetim izi', 'data/*.db', 'Sunucu içi; 1 Hz kayıt + ms tampon'],
];

export const ArchitectureView: React.FC<{
  devices: Record<string, DeviceRuntimeState>; alarms: AlarmRecord[]; summary: SystemSummary | null; connected: boolean;
  onOpenHardware: (id: string) => void;
}> = ({ devices, alarms, summary, connected, onOpenHardware }) => {
  const hw = usePoll<any>('/hardware/nodes', 1000).data;
  const perf = usePoll<any>('/perf/tick', 2000).data;
  // RUN = tarama sayacı bir önceki yoklamaya göre ilerledi; yalnızca yeni yoklama sonucunda yeniden hesaplanır
  const prevScans = useRef<Record<string, number>>({});
  const lastHw = useRef<any>(null);
  const runRef = useRef<Record<string, boolean>>({});
  if (hw && hw !== lastHw.current) {
    runRef.current = Object.fromEntries(hw.nodes.map((n: any) => [n.device_id, n.running && n.scan_count > (prevScans.current[n.device_id] ?? -1)]));
    prevScans.current = Object.fromEntries(hw.nodes.map((n: any) => [n.device_id, n.scan_count]));
    lastHw.current = hw;
  }
  const running = runRef.current;
  const nodes: Record<string, any> = Object.fromEntries((hw?.nodes || []).map((n: any) => [n.device_id, n]));
  const unack = alarms.filter(a => a.state === 'UNACK_ALARM' || a.state === 'RTN_UNACK').length;
  const cardCount = (hw?.nodes || []).reduce((s: number, n: any) => s + n.cards.length, 0);

  const [mode, setMode] = useState<'diagram' | 'list'>('diagram');
  const tabs = (
    <div role="tablist" aria-label="Görünüm" className="flex gap-1">
      {([['diagram', 'Haberleşme şeması'], ['list', 'Liste']] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className="px-3 rounded-[3px]"
          style={{ minHeight: 34, fontSize: 13, background: mode === k ? 'var(--p-hover)' : 'transparent', border: '1px solid var(--p-border)', color: 'var(--p-text)' }}>{l}</button>
      ))}
    </div>
  );
  if (mode === 'diagram') return (
    <div className="space-y-3">
      {tabs}
      <div className="rounded-[4px] overflow-x-auto" style={{ background: 'var(--p-bg)', border: '1px solid var(--p-border)' }}>
        <CommDiagram devices={devices} alarms={alarms} summary={summary} connected={connected} nodes={nodes} running={running} perf={perf} onOpen={onOpenHardware} />
      </div>
      <p className="m-0" style={{ fontSize: 12.5, color: 'var(--p-dim)' }}>
        Kalın gri hat: Ethernet · camgöbeği hat: RS-485 Modbus RTU · ince gri hat: 4–20 mA ve 24 V I/O · noktalı camgöbeği: I²C · kalın kesikli: proses borusu (tank → pompa → vana) · kalın düz: 11 kV / 0,4 kV güç hattı ve DC bara.
        Her hattın yanında protokolü yazar. Bir makineye veya karta tıklayın: kartları ve ladder programı açılır.
      </p>
      <Card title="Kullanılan protokoller">
        <div className="overflow-x-auto"><Table head={['Protokol', 'Nerede', 'Adres / hız', 'Not']}>
          {PROTOCOLS.map(([p, w, a, n]) => <tr key={p}><td className="font-value whitespace-nowrap">{p}</td><td>{w}</td><td className="font-value">{a}</td><td style={{ color: 'var(--p-muted)' }}>{n}</td></tr>)}
        </Table></div>
      </Card>
    </div>
  );
  return (
    <div className="space-y-3">
      {tabs}
      <Band>
        <LevelHead n={3} title="Kayıt ve izleme" sub="Olayları ve ölçümleri kalıcı tutan, denetlenebilir katman" />
        <div className="grid sm:grid-cols-3 gap-2">
          <Node icon={Database} title="Historian" addr="SQLite WAL · 1 Hz kayıt + ms halka tamponu">Zaman serisi, CSV dışa aktarma</Node>
          <Node icon={ShieldCheck} title="Denetim izi" addr="SHA-256 zincirli kayıt">Operatör komutları ve sistem olayları</Node>
          <Node icon={Activity} title="Alarm merkezi" addr="ISA-18.2 yaşam döngüsü">
            <span className="font-value" style={{ color: alarms.length ? 'var(--p-warn)' : 'var(--p-text)' }}>{alarms.length}</span> aktif · <span className="font-value" style={{ color: unack ? 'var(--p-bad)' : 'var(--p-text)' }}>{unack}</span> onaysız
          </Node>
        </div>
      </Band>

      <Band>
        <LevelHead n={2} title="Kontrol ve izleme" sub="Operatörün ve mühendisin kullandığı sunucu ve istasyonlar" />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <Node icon={Monitor} title="Operatör HMI" addr={`${window.location.host} · WebSocket`}>
            <span className="dot" data-tone={connected ? undefined : 'bad'} aria-hidden="true" /> {connected ? 'Bağlı' : 'Bağlantı yok'}
          </Node>
          <Node icon={Server} title="SCADA sunucusu" addr="FastAPI · 10 Hz fizik döngüsü">
            {summary ? <>t = <span className="font-value">{summary.sim_time.toFixed(1)}</span> sn · {summary.running ? 'çalışıyor' : 'duraklatıldı'}</> : '—'}
            {perf && <div className="font-value" style={{ fontSize: 12, color: 'var(--p-dim)' }}>periyot hatası p95 {perf.period_error_abs_ms.p95.toFixed(2)} ms · aşım {perf.overruns}</div>}
          </Node>
          <Node icon={MonitorCog} title="Mühendislik istasyonu" addr="PLC / ladder editörü">{cardCount ? `${cardCount} saha kartı, ${hw.nodes.length} ladder programı` : '—'}</Node>
          <Node icon={Cable} title="Protokol ağ geçitleri" addr="Modbus TCP :5020 · MQTT · OPC UA">Saha verisini dış sistemlere sunar</Node>
        </div>
      </Band>

      <div className="relative rounded-[3px] px-3 py-2 flex items-center justify-between gap-2" style={{ background: 'var(--p-sunken)', border: '1px solid var(--p-border-strong)' }}>
        <span style={{ font: '600 12px var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--p-muted)' }}>Endüstriyel Ethernet · Modbus TCP</span>
        <span className="font-value" style={{ fontSize: 12, color: 'var(--p-dim)' }}>her bölgede RS-485 Modbus RTU saha hattı ↓</span>
      </div>

      <Band>
        <div className="grid md:grid-cols-[1fr] gap-1 mb-2">
          <LevelHead n={1} title="Denetleyiciler ve saha cihazları" sub="Seviye 1: her varlığın PLC kartı (gerekenlerde akıllı kart) · Seviye 0: gerçek makine ve süreç. Bir kutuya tıklayın: kartı ve ladder programı açılır." />
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {AREAS.map(a => (
            <div key={a.id} className="rounded-[3px] p-2.5 min-w-0" style={{ border: '1px dashed var(--p-border-strong)' }}>
              <div className="flex items-baseline justify-between mb-2">
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.title}</span>
                <span className="font-value" style={{ fontSize: 11.5, color: 'var(--p-dim)' }}>RS-485 hattı</span>
              </div>
              <ol className="space-y-3">
                {a.devices.map(id => (
                  <li key={id} className="space-y-1">
                    <div className="space-y-1">
                      {(nodes[id]?.cards || []).map((c: any) => <CardTile key={c.card_id} card={c} node={nodes[id]} running={!!running[id]} onOpen={() => onOpenHardware(id)} />)}
                    </div>
                    <div aria-hidden="true" className="mx-auto" style={{ width: 1, height: 10, background: 'var(--p-border-strong)' }} />
                    <DeviceTile id={id} d={devices[id]} onOpen={() => onOpenHardware(id)} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-3 mb-0" style={{ fontSize: 12, color: 'var(--p-dim)' }}>
          RUN: kartın ladder taraması son yenilemeden bu yana ilerledi. DO LED'leri kartın çıkış rölelerini gösterir; kart çıkışları tesise komut göndermez.
        </p>
      </Band>
    </div>
  );
};
