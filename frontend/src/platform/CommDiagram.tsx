import React from 'react';
import type { AlarmRecord, DeviceRuntimeState, SystemSummary } from '../types';
import { DEVICE_META, fmtNum, keyValue, statusTone, statusTr } from './meta';

/**
 * Haberleşme şeması: tesisin katmanları ve aralarındaki protokoller, canlı veriyle.
 * Seviye 3 kayıt/izleme → Seviye 2 sunucu ve istasyonlar → Ethernet anahtarı → bölge RS-485 ağ geçitleri →
 * Seviye 1 PLC ve akıllı kartlar → Seviye 0 makineler. Her hat üzerinde gerçekte kullanılan protokol yazılıdır.
 */

export const AREAS = [
  { id: 'prod', title: 'ÜRETİM HATTI', devices: ['FAC_CONVEYOR_01', 'FAC_ROBOT_01', 'FAC_VFD_MOTOR_01'] },
  { id: 'proc', title: 'PROSES', devices: ['PROC_TANK_01', 'PROC_PUMP_01', 'PROC_VALVE_01'] },
  { id: 'grid', title: 'ELEKTRİK', devices: ['GRID_TRAFO_01', 'GRID_BREAKER_01', 'GRID_BUSBAR_11KV'] },
  { id: 'bld', title: 'BİNA VE DEPOLAMA', devices: ['BLD_HVAC_ZONE1', 'BLD_SOLAR_PV_01', 'BLD_BMS_BATTERY_01'] },
];

const W = 1660, H = 1000;
const AX = (i: number) => 60 + i * 398;          // bölge sol kenarı
const AW = 388;
const SX = (i: number, j: number) => AX(i) + 6 + j * 127;
const SW = 120;
const GW_CX = (i: number) => AX(i) + AW / 2;
const SWITCH_Y = 338;

const C = {
  band: 'var(--p-surface)', box: 'var(--p-raised)', sunk: 'var(--p-sunken)', line: 'var(--p-border-strong)', thin: 'var(--p-border)',
  text: 'var(--p-text)', muted: 'var(--p-muted)', dim: 'var(--p-dim)', acc: 'var(--p-accent)', accBg: 'var(--p-accent-bg)',
  warn: 'var(--p-warn)', bad: 'var(--p-bad)',
};
const UI = 'var(--font-ui)', MONO = 'var(--font-val)';
const toneStroke = (t: string) => (t === 'bad' ? C.bad : t === 'warn' ? C.warn : C.line);

const T: React.FC<React.SVGProps<SVGTextElement> & { s?: number; mono?: boolean; w?: number; c?: string }> = ({ s = 11, mono, w = 400, c = C.text, children, ...p }) => (
  <text fontSize={s} fontFamily={mono ? MONO : UI} fontWeight={w} fill={c} {...p}>{children}</text>
);

/** Protokol etiketi: hattın yanına küçük, okunur metin. */
const Proto: React.FC<{ x: number; y: number; children: React.ReactNode; anchor?: 'start' | 'end' | 'middle' }> = ({ x, y, children, anchor = 'start' }) => (
  <T x={x} y={y} s={10} mono c={C.muted} textAnchor={anchor}>{children}</T>
);

const v = (d: Record<string, DeviceRuntimeState>, id: string, pt: string) => Number(d[id]?.telemetry?.[pt]?.value ?? 0);

// ───────────────────────── Seviye 0 makine çizimleri (kutu: x, y, 120×186) ─────────────────────────
const Machine: React.FC<{ id: string; x: number; y: number; d: Record<string, DeviceRuntimeState> }> = ({ id, x, y, d }) => {
  const cx = x + 60;
  const st = { fill: 'none', stroke: C.muted, strokeWidth: 1.6 };
  switch (id) {
    case 'PROC_TANK_01': {
      const lvl = Math.max(0, Math.min(100, v(d, id, 'level_pct')));
      const h = 136 * lvl / 100;
      return <g>
        <rect x={cx - 8} y={y + 10} width={16} height={10} {...st} />
        <rect x={cx - 36} y={y + 20} width={72} height={150} rx={16} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        <clipPath id="tankclip"><rect x={cx - 34} y={y + 22} width={68} height={146} rx={14} /></clipPath>
        <rect x={cx - 34} y={y + 168 - h} width={68} height={h} fill={C.acc} opacity={0.35} clipPath="url(#tankclip)" />
        <line x1={cx - 34} x2={cx + 34} y1={y + 168 - h} y2={y + 168 - h} stroke={C.acc} strokeWidth={1.5} clipPath="url(#tankclip)" />
        <T x={cx} y={y + 100} s={15} mono w={600} textAnchor="middle">{fmtNum(lvl, 1)} %</T>
        <T x={cx} y={y + 116} s={9.5} c={C.dim} textAnchor="middle">pH {fmtNum(v(d, id, 'ph_value'), 2)}</T>
      </g>;
    }
    case 'PROC_PUMP_01': {
      const run = v(d, id, 'rpm') > 50;
      return <g>
        <line x1={x + 4} x2={cx - 32} y1={y + 120} y2={y + 120} stroke={C.muted} strokeWidth={6} />
        <line x1={cx} x2={cx} y1={y + 72} y2={y + 30} stroke={C.muted} strokeWidth={6} />
        <circle cx={cx} cy={y + 110} r={34} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[0, 90, 180, 270].map(a => <path key={a} d={`M ${cx} ${y + 110} q 14 -6 22 -22`} {...st} stroke={run ? C.acc : C.muted} transform={`rotate(${a} ${cx} ${y + 110})`} />)}
        <circle cx={cx} cy={y + 110} r={5} fill={C.muted} />
        <rect x={cx - 30} y={y + 148} width={60} height={8} {...st} />
      </g>;
    }
    case 'PROC_VALVE_01': {
      const pos = Math.max(0, Math.min(100, v(d, id, 'position_pct')));
      return <g>
        <line x1={x + 4} x2={x + 116} y1={y + 120} y2={y + 120} stroke={C.muted} strokeWidth={6} />
        <path d={`M ${cx - 26} ${y + 102} L ${cx} ${y + 120} L ${cx - 26} ${y + 138} Z M ${cx + 26} ${y + 102} L ${cx} ${y + 120} L ${cx + 26} ${y + 138} Z`} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        <line x1={cx} x2={cx} y1={y + 120} y2={y + 66} stroke={C.muted} strokeWidth={2} />
        <path d={`M ${cx - 30} ${y + 66} A 30 22 0 0 1 ${cx + 30} ${y + 66} Z`} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        <rect x={cx - 30} y={y + 156} width={60} height={6} fill={C.sunk} stroke={C.thin} />
        <rect x={cx - 30} y={y + 156} width={60 * pos / 100} height={6} fill={C.acc} opacity={0.7} />
        <T x={cx} y={y + 176} s={9.5} c={C.dim} textAnchor="middle">açıklık</T>
      </g>;
    }
    case 'FAC_CONVEYOR_01': {
      const run = v(d, id, 'speed') > 0.05;
      return <g>
        {[0, 1, 2].map(k => <g key={k}>
          <rect x={x + 18 + k * 32} y={y + 92} width={14} height={30} rx={3} fill={C.sunk} stroke={C.muted} strokeWidth={1.3} />
          <rect x={x + 21 + k * 32} y={y + 86} width={8} height={7} fill={C.muted} />
        </g>)}
        <rect x={x + 4} y={y + 124} width={112} height={22} rx={11} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[0, 1, 2, 3, 4, 5].map(k => <circle key={k} cx={x + 15 + k * 18} cy={y + 135} r={6} {...st} />)}
        {run && [0, 1, 2].map(k => <path key={k} d={`M ${x + 30 + k * 30} ${y + 154} l 6 4 l -6 4`} fill="none" stroke={C.acc} strokeWidth={1.5} />)}
        <line x1={x + 20} x2={x + 20} y1={y + 146} y2={y + 172} stroke={C.muted} strokeWidth={2} />
        <line x1={x + 100} x2={x + 100} y1={y + 146} y2={y + 172} stroke={C.muted} strokeWidth={2} />
      </g>;
    }
    case 'FAC_ROBOT_01': {
      const j2 = v(d, id, 'joint2_deg'), j3 = v(d, id, 'joint3_deg');
      const r = Math.PI / 180;
      const bx = cx, by = y + 150;
      const a1 = (-90 + j2) * r, a2 = (-90 + j2 + 75 + j3) * r;
      const p1 = [bx + 58 * Math.cos(a1), by + 58 * Math.sin(a1)];
      const p2 = [p1[0] + 44 * Math.cos(a2), p1[1] + 44 * Math.sin(a2)];
      const load = v(d, id, 'payload_kg') > 0.5;
      return <g>
        <rect x={bx - 24} y={by + 6} width={48} height={14} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        <rect x={bx - 10} y={by - 6} width={20} height={14} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        <line x1={bx} y1={by} x2={p1[0]} y2={p1[1]} stroke={C.muted} strokeWidth={9} strokeLinecap="round" />
        <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={C.muted} strokeWidth={6} strokeLinecap="round" />
        <circle cx={bx} cy={by} r={6} fill={C.box} stroke={C.text} strokeWidth={1.2} />
        <circle cx={p1[0]} cy={p1[1]} r={5} fill={C.box} stroke={C.text} strokeWidth={1.2} />
        <circle cx={p2[0]} cy={p2[1]} r={load ? 6 : 3} fill={load ? C.acc : C.muted} />
      </g>;
    }
    case 'FAC_VFD_MOTOR_01': {
      const rpm = v(d, id, 'rpm');
      return <g>
        <line x1={x + 4} x2={cx - 40} y1={y + 112} y2={y + 112} stroke={C.muted} strokeWidth={4} />
        <rect x={cx - 40} y={y + 82} width={66} height={60} rx={8} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[0, 1, 2, 3, 4].map(k => <line key={k} x1={cx - 32 + k * 12} x2={cx - 32 + k * 12} y1={y + 86} y2={y + 138} stroke={C.thin} strokeWidth={2} />)}
        <circle cx={cx + 36} cy={y + 112} r={22} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[0, 72, 144, 216, 288].map(a => <path key={a} d={`M ${cx + 36} ${y + 112} q 10 -4 14 -16`} fill="none" stroke={rpm > 50 ? C.acc : C.muted} strokeWidth={1.6} transform={`rotate(${a} ${cx + 36} ${y + 112})`} />)}
        <rect x={cx - 36} y={y + 142} width={58} height={10} {...st} />
        <rect x={cx - 26} y={y + 70} width={26} height={12} {...st} />
      </g>;
    }
    case 'GRID_TRAFO_01':
      return <g>
        {[-20, 0, 20].map(o => <g key={o}><line x1={cx + o} x2={cx + o} y1={y + 40} y2={y + 66} stroke={C.muted} strokeWidth={3} /><circle cx={cx + o} cy={y + 38} r={4} fill={C.muted} /></g>)}
        <rect x={cx - 34} y={y + 66} width={68} height={86} rx={4} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[0, 1, 2, 3, 4, 5].map(k => <g key={k}>
          <line x1={cx - 46} x2={cx - 34} y1={y + 74 + k * 13} y2={y + 74 + k * 13} stroke={C.muted} strokeWidth={2} />
          <line x1={cx + 34} x2={cx + 46} y1={y + 74 + k * 13} y2={y + 74 + k * 13} stroke={C.muted} strokeWidth={2} />
        </g>)}
        <T x={cx} y={y + 114} s={10} mono c={C.dim} textAnchor="middle">11/0,4 kV</T>
      </g>;
    case 'GRID_BREAKER_01': {
      const closed = v(d, id, 'state') > 0.5;
      return <g>
        <rect x={cx - 40} y={y + 30} width={80} height={140} rx={4} fill={C.sunk} stroke={C.thin} />
        <line x1={cx} x2={cx} y1={y + 40} y2={y + 76} stroke={C.text} strokeWidth={3} />
        <circle cx={cx} cy={y + 78} r={4} fill={C.text} />
        <line x1={cx} y1={y + 128} x2={closed ? cx : cx + 30} y2={closed ? y + 80 : y + 88} stroke={closed ? C.text : C.warn} strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={cx} cy={y + 128} r={4} fill={C.text} />
        <line x1={cx} x2={cx} y1={y + 128} y2={y + 160} stroke={C.text} strokeWidth={3} />
        <T x={cx} y={y + 186} s={10} mono w={600} c={closed ? C.text : C.warn} textAnchor="middle">{closed ? 'KAPALI' : 'AÇIK'}</T>
      </g>;
    }
    case 'GRID_BUSBAR_11KV':
      return <g>
        {['L1', 'L2', 'L3'].map((p, k) => <g key={p}>
          <rect x={x + 6} y={y + 70 + k * 22} width={108} height={9} rx={2} fill={C.muted} />
          <T x={x + 6} y={y + 66 + k * 22} s={9} mono c={C.dim}>{p}</T>
        </g>)}
        {[30, 60, 90].map(o => <line key={o} x1={x + o} x2={x + o} y1={y + 124} y2={y + 160} stroke={C.muted} strokeWidth={2} />)}
      </g>;
    case 'BLD_HVAC_ZONE1':
      return <g>
        <rect x={cx - 48} y={y + 70} width={96} height={72} rx={6} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[-22, 22].map(o => <g key={o}>
          <circle cx={cx + o} cy={y + 104} r={17} {...st} />
          {[0, 120, 240].map(a => <path key={a} d={`M ${cx + o} ${y + 104} q 8 -3 10 -13`} fill="none" stroke={v(d, id, 'fan_power_kw') > 0.2 ? C.acc : C.muted} strokeWidth={1.5} transform={`rotate(${a} ${cx + o} ${y + 104})`} />)}
        </g>)}
        <rect x={cx - 40} y={y + 142} width={10} height={14} fill={C.muted} /><rect x={cx + 30} y={y + 142} width={10} height={14} fill={C.muted} />
      </g>;
    case 'BLD_SOLAR_PV_01': {
      const irr = v(d, id, 'irradiance_wm2');
      return <g>
        <circle cx={x + 22} cy={y + 40} r={11} fill={irr > 50 ? C.warn : 'none'} stroke={C.muted} strokeWidth={1.4} opacity={irr > 50 ? 0.85 : 1} />
        <polygon points={`${x + 14},${y + 136} ${x + 44},${y + 76} ${x + 116},${y + 76} ${x + 92},${y + 136}`} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        {[1, 2, 3].map(k => <line key={k} x1={x + 14 + 78 * k / 4 + (30 - 30 * 0)} x2={x + 44 + 72 * k / 4} y1={y + 136} y2={y + 76} stroke={C.thin} strokeWidth={1} />)}
        {[1, 2].map(k => <line key={k} x1={x + 14 + 30 * k / 3} x2={x + 92 + 24 * k / 3} y1={y + 136 - 60 * k / 3} y2={y + 136 - 60 * k / 3} stroke={C.thin} strokeWidth={1} />)}
        <line x1={x + 60} x2={x + 60} y1={y + 136} y2={y + 168} stroke={C.muted} strokeWidth={3} />
      </g>;
    }
    case 'BLD_BMS_BATTERY_01': {
      const soc = Math.max(0, Math.min(100, v(d, id, 'soc_pct')));
      const h = 104 * soc / 100;
      return <g>
        <rect x={cx - 12} y={y + 46} width={24} height={8} fill={C.muted} />
        <rect x={cx - 30} y={y + 54} width={60} height={110} rx={6} fill={C.sunk} stroke={C.muted} strokeWidth={1.6} />
        <rect x={cx - 27} y={y + 161 - h} width={54} height={h} rx={3} fill={C.acc} opacity={0.35} />
        <T x={cx} y={y + 114} s={15} mono w={600} textAnchor="middle">%{fmtNum(soc, 0)}</T>
      </g>;
    }
    default:
      return <rect x={x + 10} y={y + 40} width={100} height={100} {...st} />;
  }
};

// ───────────────────────── Seviye 1 kart çizimleri ─────────────────────────
const PlcCard: React.FC<{ x: number; y: number; node: any; running: boolean }> = ({ x, y, node, running }) => {
  const card = node.cards[0];
  const ins = node.inputs || [], outs = node.outputs || [], ais = node.analog || [];
  return <g>
    <rect x={x} y={y} width={SW} height={100} rx={4} fill={C.box} stroke={C.line} strokeWidth={1.2} />
    <rect x={x} y={y} width={SW} height={16} rx={4} fill={C.sunk} />
    <T x={x + 6} y={y + 12} s={10} mono w={600}>{card.card_id}</T>
    <T x={x + SW - 6} y={y + 12} s={9} c={C.dim} textAnchor="end">PLC</T>
    <rect x={x + 5} y={y + 21} width={13} height={44} rx={2} fill={C.sunk} stroke={C.thin} />
    <circle cx={x + 11.5} cy={y + 28} r={2.2} fill={C.acc} />
    {[0, 1, 2, 3].map(k => <line key={k} x1={x + 8} x2={x + 15} y1={y + 40 + k * 5} y2={y + 40 + k * 5} stroke={C.thin} />)}
    <rect x={x + 21} y={y + 21} width={34} height={44} rx={2} fill={C.sunk} stroke={C.thin} />
    <rect x={x + 24} y={y + 24} width={28} height={13} rx={2} fill={running ? C.accBg : C.box} stroke={running ? C.acc : C.thin} />
    <T x={x + 38} y={y + 34} s={8.5} mono w={700} c={running ? C.acc : C.dim} textAnchor="middle">{running ? 'RUN' : 'STOP'}</T>
    <circle cx={x + 27} cy={y + 46} r={2} fill={C.thin} /><T x={x + 31} y={y + 48.5} s={6.5} c={C.dim}>ERR</T>
    <circle cx={x + 27} cy={y + 55} r={2} fill={running ? C.acc : C.thin} /><T x={x + 31} y={y + 57.5} s={6.5} c={C.dim}>COM</T>
    {[['DI', ins, x + 62], ['DO', outs, x + 90]].map(([lbl, list, cxx]: any) => <g key={lbl}>
      <T x={cxx} y={y + 28} s={8} mono c={C.dim}>{lbl}</T>
      {[0, 1, 2, 3].map(k => {
        const io = list[k];
        return <g key={k}>
          <circle cx={cxx + 3} cy={y + 35 + k * 8} r={2.6} fill={io?.on ? C.acc : 'none'} stroke={io ? (io.on ? C.acc : C.line) : C.thin} strokeDasharray={io ? undefined : '1 1'} />
          <T x={cxx + 8} y={y + 37.5 + k * 8} s={7} mono c={io ? C.muted : C.thin}>{k + 1}</T>
        </g>;
      })}
    </g>)}
    <line x1={x + 4} x2={x + SW - 4} y1={y + 70} y2={y + 70} stroke={C.thin} />
    <T x={x + 6} y={y + 82} s={8.5} mono c={C.muted}>{ais.length ? ais.map((a: any) => `${a.ch} ${fmtNum(a.mA, 1)}`).join('  ') + ' mA' : 'AI yok'}</T>
    <T x={x + 6} y={y + 94} s={8.5} mono c={C.dim}>Modbus @{card.address}</T>
  </g>;
};

const SmartCard: React.FC<{ x: number; y: number; card: any }> = ({ x, y, card }) => (
  <g>
    <clipPath id={`clip-${card.card_id}`}><rect x={x} y={y} width={54} height={40} rx={3} /></clipPath>
    <rect x={x} y={y} width={54} height={40} rx={3} fill="#1f4d36" />
    <image href={`/${card.top}`} x={x - 14} y={y - 13} width={82} height={62} preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${card.card_id})`} />
    <rect x={x} y={y} width={54} height={40} rx={3} fill="none" stroke={C.acc} strokeWidth={1.4} />
    <T x={x + 27} y={y + 52} s={8.5} mono w={600} c={C.acc} textAnchor="middle">{card.card_id}</T>
  </g>
);

export const CommDiagram: React.FC<{
  devices: Record<string, DeviceRuntimeState>; alarms: AlarmRecord[]; summary: SystemSummary | null; connected: boolean;
  nodes: Record<string, any>; running: Record<string, boolean>; perf: any; onOpen: (id: string) => void;
}> = ({ devices, alarms, summary, connected, nodes, running, perf, onOpen }) => {
  const unack = alarms.filter(a => a.state === 'UNACK_ALARM' || a.state === 'RTN_UNACK').length;
  const tank = devices.PROC_TANK_01;
  const lvl = v(devices, 'PROC_TANK_01', 'level_pct');
  const tankTone = statusTone(tank?.status);
  const cards = Object.values(nodes).reduce((s: number, n: any) => s + n.cards.length, 0);
  const keyOpen = (id: string) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id); } };

  const switchDrops = [150, 300, 450, 600, 730, 860, 1000, 1320, ...AREAS.map((_, i) => GW_CX(i))];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-labelledby="comm-title comm-desc" style={{ display: 'block', minWidth: 1100 }}>
      <title id="comm-title">GÖKSYSTEM haberleşme şeması</title>
      <desc id="comm-desc">Seviye 3 kayıt ve izleme, seviye 2 sunucu ve istasyonlar, endüstriyel Ethernet anahtarı, bölge RS-485 ağ geçitleri, seviye 1 PLC ve akıllı kartlar ve seviye 0 makineler; her bağlantıda kullanılan protokol yazılıdır.</desc>

      {/* katman bantları ve sol etiketler */}
      {[[10, 140, 'SEVİYE 3 · KAYIT'], [160, 170, 'SEVİYE 2 · KONTROL'], [372, 296, 'SEVİYE 1 · KARTLAR'], [676, 316, 'SEVİYE 0 · SAHA']].map(([y, h, l]: any) => (
        <g key={l}>
          <rect x={8} y={y} width={W - 16} height={h} rx={6} fill={C.band} stroke={C.thin} />
          <T x={30} y={y + h / 2} s={11} w={600} c={C.dim} textAnchor="middle" letterSpacing="0.12em" transform={`rotate(-90 30 ${y + h / 2})`}>{l}</T>
        </g>
      ))}

      {/* ── Seviye 3 ── */}
      <line x1={300} x2={300} y1={132} y2={SWITCH_Y} stroke={C.line} strokeDasharray="4 4" />
      <line x1={600} x2={600} y1={132} y2={SWITCH_Y} stroke={C.line} strokeDasharray="4 4" />
      <line x1={860} x2={860} y1={132} y2={SWITCH_Y} stroke={C.line} strokeDasharray="4 4" />
      <g>
        {[0, 1].map(k => <g key={k}><rect x={210} y={24 + k * 26} width={180} height={22} rx={2} fill={C.box} stroke={C.line} />
          {[0, 1, 2, 3, 4].map(m => <rect key={m} x={218 + m * 16} y={30 + k * 26} width={11} height={10} fill={C.sunk} stroke={C.thin} />)}
          <circle cx={372} cy={35 + k * 26} r={2.5} fill={C.acc} /><circle cx={362} cy={35 + k * 26} r={2.5} fill={C.thin} /></g>)}
        <T x={300} y={92} s={12} w={600} textAnchor="middle">Historian</T>
        <T x={300} y={107} s={10} mono c={C.dim} textAnchor="middle">SQLite WAL · 1 Hz + ms tampon</T>
        <Proto x={306} y={126}>SQL (sunucu içi)</Proto>
      </g>
      <g>
        <rect x={500} y={20} width={200} height={84} rx={6} fill={C.box} stroke={C.line} />
        <rect x={508} y={28} width={184} height={66} rx={3} fill={C.sunk} />
        <T x={516} y={42} s={9} w={600} c={C.dim} letterSpacing="0.06em">ALARM MERKEZİ · ISA-18.2</T>
        <T x={516} y={80} s={26} mono w={600} c={alarms.length ? C.warn : C.text}>{alarms.length}</T>
        <T x={556} y={70} s={9.5} c={C.dim}>aktif alarm</T>
        <T x={684} y={70} s={9.5} c={C.dim} textAnchor="end">onaysız</T>
        <T x={684} y={86} s={16} mono w={600} c={unack ? C.bad : C.text} textAnchor="end">{unack}</T>
        <Proto x={606} y={126}>olay akışı</Proto>
      </g>
      <g>
        <path d="M 860 24 l 26 10 v 22 c 0 18 -12 28 -26 34 c -14 -6 -26 -16 -26 -34 v -22 z" fill={C.box} stroke={C.line} strokeWidth={1.4} />
        <path d="M 849 56 l 8 8 l 14 -16" fill="none" stroke={C.acc} strokeWidth={2} />
        <T x={900} y={50} s={12} w={600}>Denetim izi</T>
        <T x={900} y={66} s={10} mono c={C.dim}>SHA-256 zincirli kayıt</T>
        <Proto x={866} y={126}>imzalı olay kaydı</Proto>
      </g>
      <g>
        <rect x={1040} y={22} width={590} height={104} rx={6} fill={C.box} stroke={C.line} />
        <T x={1056} y={44} s={10} w={600} c={C.dim} letterSpacing="0.08em">10 Hz FİZİK DÖNGÜSÜ · ZAMANLAMA</T>
        {perf ? <>
          {[['periyot hatası p95', `${perf.period_error_abs_ms.p95.toFixed(2)} ms`], ['adım süresi p99', `${perf.step_duration_ms.p99.toFixed(2)} ms`], ['aşım', String(perf.overruns)], ['tick', String(perf.ticks)]].map(([k, val], i) => (
            <g key={k}><T x={1056 + i * 146} y={70} s={10} c={C.dim}>{k}</T><T x={1056 + i * 146} y={96} s={20} mono w={600}>{val}</T></g>
          ))}
          <T x={1056} y={116} s={9.5} c={C.dim}>simülasyon zamanı t = {summary ? summary.sim_time.toFixed(1) : '—'} sn · ayrıntı: Motor sayfası, docs/TIMING.md</T>
        </> : <T x={1056} y={80} s={11} c={C.dim}>ölçüm yükleniyor…</T>}
      </g>

      {/* ── Seviye 2 ── */}
      {[[150, 'Operatör HMI', window.location.host], [450, 'SCADA sunucusu', 'FastAPI · 10 Hz'], [730, 'Mühendislik ist.', 'ladder editörü'], [1020, 'Protokol ağ geçitleri', ''], [1320, 'Factory I/O köprüsü', '']].map(([x, l, s]: any) => (
        <g key={l}><T x={x} y={180} s={12.5} w={600} textAnchor="middle">{l}</T>{s && <T x={x} y={194} s={9.5} mono c={C.dim} textAnchor="middle">{s}</T>}</g>
      ))}
      {/* HMI */}
      <g>
        <rect x={40} y={200} width={220} height={86} rx={7} fill={C.box} stroke={C.line} />
        <rect x={48} y={207} width={204} height={66} rx={3} fill={C.sunk} />
        <T x={56} y={220} s={8.5} w={600} c={C.dim} letterSpacing="0.06em">REAKTÖR TANKI · SEVİYE</T>
        <T x={56} y={252} s={24} mono w={600}>{fmtNum(lvl, 1)}<tspan fontSize={12} fill={C.dim}> %</tspan></T>
        <rect x={180} y={226} width={64} height={16} rx={2} fill={tankTone === 'ok' ? C.box : 'none'} stroke={toneStroke(tankTone)} />
        <T x={212} y={237.5} s={8.5} w={700} c={tankTone === 'ok' ? C.text : toneStroke(tankTone)} textAnchor="middle">{statusTr(tank?.status).toLocaleUpperCase('tr-TR').slice(0, 10)}</T>
        <T x={56} y={267} s={9} mono c={C.dim}>pH {fmtNum(v(devices, 'PROC_TANK_01', 'ph_value'), 2)} · {fmtNum(v(devices, 'PROC_TANK_01', 'temp_c'), 1)} °C</T>
        <rect x={135} y={286} width={30} height={6} fill={C.line} /><rect x={110} y={292} width={80} height={5} rx={2} fill={C.line} />
        <circle cx={248} cy={213} r={2.5} fill={connected ? C.acc : C.bad} />
      </g>
      {/* SCADA */}
      <g>
        {[0, 1, 2].map(k => <g key={k}><rect x={360} y={202 + k * 24} width={180} height={20} rx={2} fill={C.box} stroke={C.line} />
          {[0, 1, 2, 3, 4].map(m => <rect key={m} x={368 + m * 15} y={207 + k * 24} width={10} height={10} fill={C.sunk} stroke={C.thin} />)}
          <circle cx={524} cy={212 + k * 24} r={2.5} fill={summary?.running ? C.acc : C.thin} /><circle cx={514} cy={212 + k * 24} r={2.5} fill={C.thin} /></g>)}
        <rect x={360} y={274} width={180} height={18} rx={2} fill={C.sunk} stroke={C.thin} />
        <T x={368} y={287} s={9} mono c={C.dim}>REST /api/v1 · WS /ws · t={summary ? summary.sim_time.toFixed(0) : '—'} sn</T>
      </g>
      {/* Mühendislik */}
      <g>
        <rect x={668} y={204} width={110} height={70} rx={5} fill={C.box} stroke={C.line} />
        <rect x={674} y={210} width={98} height={56} fill={C.sunk} />
        {[0, 1, 2, 3, 4].map(k => <line key={k} x1={680} x2={680 + [70, 50, 80, 40, 60][k]} y1={218 + k * 10} y2={218 + k * 10} stroke={k === 2 ? C.acc : C.line} strokeWidth={2} />)}
        <rect x={713} y={274} width={20} height={8} fill={C.line} />
        <rect x={786} y={210} width={26} height={72} rx={3} fill={C.box} stroke={C.line} />
        <circle cx={799} cy={270} r={3} fill={C.acc} />
        <T x={730} y={298} s={9} mono c={C.dim} textAnchor="middle">{cards ? `${cards} kart · ${Object.keys(nodes).length} program` : ''}</T>
      </g>
      {/* Protokol ağ geçitleri */}
      <g>
        <rect x={900} y={202} width={240} height={94} rx={5} fill={C.box} stroke={C.line} />
        {[['Modbus TCP', '127.0.0.1:5020 · kayıt haritası', true], ['MQTT', 'goksystem/telemetry/# (dahili veri yolu)', true], ['OPC UA', 'ns=2 düğüm modeli (ağ sunucusu değil)', false]].map(([p, d2, live]: any, k) => (
          <g key={p}>
            <circle cx={914} cy={222 + k * 26} r={3} fill={live ? C.acc : 'none'} stroke={live ? C.acc : C.line} />
            <T x={924} y={225 + k * 26} s={11} w={600}>{p}</T>
            <T x={924} y={237 + k * 26} s={8.5} mono c={C.dim}>{d2}</T>
          </g>
        ))}
      </g>
      {/* Factory I/O */}
      <g>
        <rect x={1220} y={202} width={200} height={94} rx={5} fill="none" stroke={C.line} strokeDasharray="5 4" />
        <T x={1320} y={238} s={11} w={600} textAnchor="middle">Factory I/O</T>
        <T x={1320} y={254} s={9} mono c={C.dim} textAnchor="middle">3B fabrika simülatörü</T>
        <T x={1320} y={270} s={9} mono c={C.dim} textAnchor="middle">mod: mock (varsayılan)</T>
      </g>
      {/* Seviye 2 → anahtar */}
      {[[150, 297, 'HTTP · WebSocket 100 ms'], [450, 292, 'REST · WS · Modbus TCP'], [730, 302, 'HTTP'], [1000, 296, 'Modbus TCP · MQTT'], [1320, 296, 'Modbus TCP (köprü)']].map(([x, y0, p]: any) => (
        <g key={x}><line x1={x} x2={x} y1={y0} y2={SWITCH_Y} stroke={C.line} strokeWidth={2.5} /><Proto x={x + 6} y={322}>{p}</Proto></g>
      ))}

      {/* ── Ethernet anahtarı ── */}
      <rect x={60} y={SWITCH_Y} width={W - 80} height={24} rx={4} fill={C.box} stroke={C.line} strokeWidth={1.4} />
      <T x={1062} y={SWITCH_Y + 16} s={10.5} w={700} c={C.muted} letterSpacing="0.1em">ENDÜSTRİYEL ETHERNET ANAHTARI</T>
      {switchDrops.map(x => <g key={x}><circle cx={x} cy={SWITCH_Y + 12} r={4.5} fill={C.sunk} stroke={C.line} /><circle cx={x} cy={SWITCH_Y + 12} r={2} fill={C.acc} /></g>)}

      {/* ── Seviye 1 ve 0: bölgeler ── */}
      {AREAS.map((a, i) => {
        const gx = GW_CX(i);
        return (
          <g key={a.id}>
            <T x={AX(i) + 8} y={398} s={10.5} w={700} c={C.dim} letterSpacing="0.08em">{a.title}</T>
            <line x1={gx} x2={gx} y1={SWITCH_Y + 24} y2={384} stroke={C.line} strokeWidth={2.5} />
            <Proto x={gx + 6} y={378}>Modbus TCP</Proto>
            <rect x={gx - 75} y={384} width={150} height={32} rx={4} fill={C.box} stroke={C.line} />
            <T x={gx} y={398} s={9.5} w={700} textAnchor="middle" letterSpacing="0.04em">RS-485 AĞ GEÇİDİ</T>
            <T x={gx} y={410} s={8.5} mono c={C.dim} textAnchor="middle">Modbus TCP ⇄ RTU</T>
            <line x1={gx} x2={gx} y1={416} y2={436} stroke={C.acc} strokeWidth={2.5} />
            <line x1={AX(i) + 8} x2={AX(i) + AW - 8} y1={436} y2={436} stroke={C.acc} strokeWidth={2.5} />
            <Proto x={AX(i) + AW - 8} y={430} anchor="end">RS-485 · Modbus RTU 19200 8E1</Proto>

            {/* bölge içi proses / güç hatları (makinelerin arkasında) */}
            {a.id === 'proc' && <g><line x1={SX(i, 0) + 96} x2={SX(i, 2) + 116} y1={820} y2={820} stroke={C.line} strokeWidth={6} strokeDasharray="10 6" /></g>}
            {a.id === 'grid' && <g><line x1={SX(i, 0) + 106} x2={SX(i, 2) + 10} y1={756} y2={756} stroke={C.line} strokeWidth={4} /></g>}
            {a.id === 'bld' && <g><line x1={SX(i, 1) + 70} x2={SX(i, 2) + 30} y1={866} y2={866} stroke={C.line} strokeWidth={4} /><Proto x={SX(i, 2) - 6} y={882} anchor="middle">DC bara</Proto></g>}

            {a.devices.map((id, j) => {
              const sx = SX(i, j);
              const node = nodes[id];
              const smart = node?.cards?.find((c: any) => c.family === 'smart');
              const d = devices[id];
              const tone = statusTone(d?.status);
              const kv = keyValue(id, d);
              const fb = node?.fieldbus?.[0];
              return (
                <g key={id} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onOpen(id)} onKeyDown={keyOpen(id)}
                  aria-label={`${DEVICE_META[id]?.name}: ${statusTr(d?.status)}${kv ? `, ${kv.label} ${kv.text} ${kv.unit}` : ''}. Kartını aç`}>
                  {/* RS-485 düşüşü */}
                  <line x1={sx + SW / 2} x2={sx + SW / 2} y1={436} y2={452} stroke={C.acc} strokeWidth={2} />
                  <Proto x={sx + SW / 2 + 4} y={448}>@{node?.address ?? ''}</Proto>
                  {node && <PlcCard x={sx} y={452} node={node} running={!!running[id]} />}
                  {/* PLC → makine: 4–20 mA / 24 V */}
                  <line x1={sx + 24} x2={sx + 24} y1={552} y2={700} stroke={C.muted} strokeWidth={1.4} />
                  <Proto x={sx + 28} y={596}>4–20 mA</Proto>
                  <Proto x={sx + 28} y={608}>24 V I/O</Proto>
                  {smart && <g>
                    <line x1={sx + 91} x2={sx + 91} y1={552} y2={572} stroke={C.acc} strokeWidth={1.6} />
                    <Proto x={sx + 95} y={566}>RS-485</Proto>
                    <SmartCard x={sx + 64} y={572} card={smart} />
                    <line x1={sx + 91} x2={sx + 91} y1={628} y2={700} stroke={C.acc} strokeWidth={1.4} strokeDasharray="2 3" />
                    <Proto x={sx + 95} y={664}>I²C</Proto>
                  </g>}
                  {/* makine */}
                  <rect x={sx} y={700} width={SW} height={190} rx={6} fill="transparent" stroke={toneStroke(tone)} strokeWidth={tone === 'ok' ? 1 : 2} strokeDasharray={tone === 'ok' ? '3 4' : undefined} />
                  <Machine id={id} x={sx} y={702} d={devices} />
                  <T x={sx + SW / 2} y={910} s={12} w={600} textAnchor="middle">{DEVICE_META[id]?.name}</T>
                  <T x={sx + SW / 2} y={930} s={15} mono w={600} textAnchor="middle">{kv ? kv.text : '—'}<tspan fontSize={10} fill={C.dim}> {kv?.unit}</tspan></T>
                  <T x={sx + SW / 2} y={948} s={9.5} c={tone === 'ok' ? C.muted : toneStroke(tone)} textAnchor="middle">● {statusTr(d?.status)}</T>
                  {fb && <T x={sx + SW / 2} y={964} s={8.5} mono c={C.dim} textAnchor="middle">RS-485 @{fb.address} {fb.tag}</T>}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};
