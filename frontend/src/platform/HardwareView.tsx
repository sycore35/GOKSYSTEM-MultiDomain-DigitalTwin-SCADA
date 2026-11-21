import React, { useEffect, useState } from 'react';
import { usePoll } from './api';
import { deviceName, fmtNum } from './meta';
import { Badge, Card, Page, State, Table } from './ui';

/** Saha kartları: her varlığın PLC kartı (gerekenlerde akıllı kartı), kablolaması, ham sinyalleri ve ladder programı. */

const KIND_TR: Record<string, string> = { DI: 'DI · 24 V', AI: 'AI · 4–20 mA', DO: 'DO · MOSFET' };
const MODE_TR = (m: string, th: number) => m === 'gt' ? `> ${fmtNum(th, th < 10 ? 2 : 0)}` : m === 'lt' ? `< ${fmtNum(th, th < 10 ? 2 : 0)}` : m === 'changed' ? 'değişimde darbe' : '≥ 0,5 (mantık)';

const OnOff: React.FC<{ on: boolean; onText?: string; offText?: string }> = ({ on, onText = 'AÇIK', offText = 'KAPALI' }) => (
  <span className="inline-flex items-center gap-1.5 font-value" style={{ fontSize: 13, color: on ? 'var(--p-text)' : 'var(--p-dim)' }}>
    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: on ? 'var(--p-accent)' : 'transparent', border: `1.5px solid ${on ? 'var(--p-accent)' : 'var(--p-border-strong)'}` }} />
    {on ? onText : offText}
  </span>
);

const ladderNode = (n: any): string => {
  const [k, v] = Object.entries<any>(n)[0];
  if (k === 'NO') return `┤ ${v} ├`;
  if (k === 'NC') return `┤/ ${v} ├`;
  if (k === 'RISING') return `┤↑ ${v} ├`;
  if (k === 'CMP') return `[${v.a} ${v.op} ${typeof v.b === 'number' ? fmtNum(v.b, v.b % 1 ? 2 : 0) : v.b}]`;
  if (k === 'AND') return v.map(ladderNode).join('──');
  return `(${v.map(ladderNode).join(' ∥ ')})`;
};

export const Ladder: React.FC<{ plc: any }> = ({ plc }) => {
  const tags = plc.program.tags;
  const out = (o: any) => ({ coil: `( ${o.tag} )`, set: `(S ${o.tag})`, reset: `(R ${o.tag})`, ton: `[TON ${o.tag} ${(tags[o.tag]?.preset_ms ?? 0) / 1000} sn]`,
    ctu: `[CTU ${o.tag} PV=${tags[o.tag]?.preset}]`, move: `[MOVE ${o.value ?? o.from} → ${o.tag}]` } as any)[o.type];
  return (
    <ol className="space-y-1.5">
      {plc.program.rungs.map((r: any) => {
        const on = !!plc.rung_state[r.id];
        return (
          <li key={r.id} className="px-3 py-2 rounded-[3px]" style={{ background: 'var(--p-raised)', borderLeft: `3px solid ${on ? 'var(--p-accent)' : 'var(--p-border)'}` }}>
            <div className="flex items-center justify-between gap-3" style={{ fontSize: 13, color: 'var(--p-muted)' }}>
              <span><b style={{ color: 'var(--p-text)' }}>{r.id}</b> · {r.comment}</span>
              <OnOff on={on} onText="ENERJİLİ" offText="ENERJİSİZ" />
            </div>
            <div className="overflow-x-auto whitespace-pre font-value mt-1" style={{ fontSize: 12.5, color: 'var(--p-text)' }}>
              ║ {ladderNode(r.logic)} ──── {r.outputs.map(out).join(' ')} ║
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const FAMILY_TR: Record<string, string> = { plc: 'PLC kartı', smart: 'Akıllı kart' };

const ChannelTable: React.FC<{ channels: any[] }> = ({ channels }) => (
  <div className="overflow-x-auto">
    <Table head={['Kanal', 'Etiket', 'Görev / sensör', 'Ham sinyal', 'Değer', 'Durum']}>
      {channels.map((c: any) => (
        <tr key={c.ch}>
          <td className="font-value whitespace-nowrap">{c.ch}<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>{KIND_TR[c.kind]}</div></td>
          <td className="font-value whitespace-nowrap">{c.tag}</td>
          <td>{c.desc}<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>{c.part}{c.kind === 'DI' && ` · ${c.source} ${MODE_TR(c.mode, c.threshold)}`}{c.kind === 'AI' && c.plc_tag !== c.ch && ` · PLC etiketi ${c.plc_tag}`}</div></td>
          <td className="font-value whitespace-nowrap">
            {c.kind === 'AI' && <>{fmtNum(c.signal.mA, 2)} mA<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>{fmtNum(c.signal.shunt_v, 3)} V · {c.signal.adc_counts} sayım</div></>}
            {c.kind === 'DI' && <>{fmtNum(c.signal.volts, 0)} V<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>LED {fmtNum(c.signal.led_mA, 1)} mA</div></>}
            {c.kind === 'DO' && <>MOSFET {c.signal.mosfet}<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>bobin {fmtNum(c.signal.coil_v, 0)} V</div></>}
          </td>
          <td className="font-value whitespace-nowrap">{c.kind === 'AI' ? <>{fmtNum(c.value, 2)}<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>aralık {fmtNum(c.range[0], 0)}…{fmtNum(c.range[1], 0)}</div></> : <OnOff on={c.value} />}</td>
          <td>{c.kind === 'AI'
            ? <Badge tone={c.signal.status === 'OK' ? 'dim' : 'warn'}>{c.signal.status === 'OK' ? 'Normal' : c.signal.status === 'OVER_RANGE' ? 'Aralık üstü (20,5 mA)' : 'Aralık altı (3,8 mA)'}</Badge>
            : <Badge tone="dim">{c.kind === 'DO' ? 'Kart çıkışı' : 'Saha girişi'}</Badge>}</td>
        </tr>
      ))}
    </Table>
  </div>
);

const BusTable: React.FC<{ bus: any[] }> = ({ bus }) => (
  <div className="overflow-x-auto">
    <Table head={['Veri yolu', 'Adres', 'Etiket', 'Cihaz', 'Okunan değerler']}>
      {bus.map((b: any) => (
        <tr key={`${b.bus}-${b.address}-${b.tag}`}>
          <td className="font-value whitespace-nowrap">{b.bus === 'RS485' ? 'RS-485 Modbus RTU' : 'I²C'}</td>
          <td className="font-value">{b.address}</td>
          <td className="font-value whitespace-nowrap">{b.tag}</td>
          <td>{b.desc}<div style={{ fontSize: 12, color: 'var(--p-dim)' }}>{b.part}</div></td>
          <td className="font-value" style={{ fontSize: 13 }}>{b.points.map((p: any) => <div key={p.tag}>{p.tag} = {p.value == null ? '—' : fmtNum(p.value, 2)}</div>)}</td>
        </tr>
      ))}
    </Table>
  </div>
);

const BoardCard: React.FC<{ card: any; deviceId: string }> = ({ card, deviceId }) => {
  const [view, setView] = useState<'top' | 'iso' | 'bottom'>('top');
  const [drc, setDrc] = useState<any>(null);
  useEffect(() => {
    let live = true;
    fetch(`/${card.artifacts.drc_summary}`).then(r => (r.ok ? r.json() : null)).then(j => { if (live) setDrc(j); }).catch(() => { if (live) setDrc(null); });
    return () => { live = false; };
  }, [card.artifacts.drc_summary]);
  return (
    <section aria-label={`${card.card_id} ${card.name}`} className="space-y-3">
      <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
        <Card title={`${card.card_id} · ${FAMILY_TR[card.family]}`} right={
          <div role="tablist" aria-label="Kart görünümü" className="flex gap-1">
            {(['top', 'iso', 'bottom'] as const).map(v => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className="px-2 py-1 rounded-[3px]"
                style={{ fontSize: 12, minHeight: 28, background: view === v ? 'var(--p-hover)' : 'transparent', border: '1px solid var(--p-border)', color: 'var(--p-text)' }}>
                {{ top: 'Üst', iso: 'İzometrik', bottom: 'Alt' }[v]}</button>))}
          </div>}>
          <img src={`/${card.artifacts[view]}`} alt={`${card.card_id} ${card.name}, ${deviceName(deviceId)} için KiCad 3B görüntüsü`} width={1600} height={1200}
            className="w-full h-auto rounded-[3px]" style={{ background: '#fff', aspectRatio: '4 / 3', objectFit: 'contain' }} loading="lazy" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2" style={{ fontSize: 13 }}>
            <a href={`/${card.artifacts.schematic_pdf}`} target="_blank" rel="noreferrer" style={{ color: 'var(--p-accent)' }}>Şematik (PDF)</a>
            <a href={`/${card.artifacts.bom_csv}`} target="_blank" rel="noreferrer" style={{ color: 'var(--p-accent)' }}>Malzeme listesi (CSV)</a>
            <span style={{ color: 'var(--p-dim)' }}>KiCad projesi: hardware/kicad/{card.kicad_project}</span>
          </div>
        </Card>
        <Card title={card.name} right={drc && <Badge tone={drc.errors ? 'warn' : 'dim'}>DRC {drc.errors} hata · {drc.unconnected} açık bağlantı</Badge>}>
          <p className="m-0 mb-2" style={{ fontSize: 13, color: 'var(--p-muted)' }}>{card.role}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" style={{ fontSize: 13 }}>
            {[
              ['Kart', `${card.card_id} · Modbus adresi ${card.address}`], ['Konum', card.location], ['MCU', card.mcu], ['Besleme', card.supply],
              ['Tasarım', `${card.layers} katman, ${card.base_design} tabanlı`],
              ['Monte kanallar', card.populated.length ? card.populated.join(', ') : 'yalnız veri yolu'],
            ].map(([k, v]) => <React.Fragment key={k}><dt style={{ color: 'var(--p-dim)' }}>{k}</dt><dd className="m-0" style={{ color: 'var(--p-text)' }}>{v}</dd></React.Fragment>)}
          </dl>
          <ul className="mt-3 space-y-1" style={{ fontSize: 12.5, color: 'var(--p-muted)' }}>
            {card.io.map((g: any) => <li key={g.group}><b style={{ color: 'var(--p-text)' }}>{g.count}× {g.group}</b> — {g.detail} <span style={{ color: 'var(--p-dim)' }}>[{g.terminal}]</span></li>)}
          </ul>
        </Card>
      </div>
      {card.channels.length > 0 && <Card title={`${card.card_id} · klemens ve kanal haritası (canlı)`}><ChannelTable channels={card.channels} /></Card>}
      {card.bus.length > 0 && <Card title={`${card.card_id} · veri yolu cihazları`}><BusTable bus={card.bus} /></Card>}
    </section>
  );
};

export const HardwareView: React.FC<{ initialDeviceId?: string | null }> = ({ initialDeviceId }) => {
  const list = usePoll<any>('/hardware/nodes', 2000);
  const [sel, setSel] = useState<string>(initialDeviceId || 'FAC_VFD_MOTOR_01');
  useEffect(() => { if (initialDeviceId) setSel(initialDeviceId); }, [initialDeviceId]);
  const det = usePoll<any>(`/hardware/nodes/${encodeURIComponent(sel)}`, 700);
  const d = det.data;

  return (
    <Page title="Saha Kartları" subtitle="Her varlığın kendi PLC kartı, durum izleme gerekenlerde ayrıca akıllı dönüşüm kartı: KiCad tasarımı, kablolama, ham sinyaller ve ladder programı.">
      <State loading={list.loading && !list.data} error={list.error} />
      {list.data && (
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-3">
          <nav aria-label="Varlıklar ve kartları" className="space-y-1">
            {list.data.nodes.map((n: any) => {
              const active = n.device_id === sel;
              return (
                <button key={n.device_id} onClick={() => setSel(n.device_id)} aria-current={active ? 'true' : undefined}
                  className="w-full text-left px-3 py-2 rounded-[3px]"
                  style={{ minHeight: 44, background: active ? 'var(--p-accent-bg)' : 'var(--p-surface)', border: `1px solid ${active ? 'var(--p-accent)' : 'var(--p-border)'}`, color: 'var(--p-text)' }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{deviceName(n.device_id)}</span>
                    <span className="font-value" style={{ fontSize: 12, color: 'var(--p-dim)' }}>@{n.address}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {n.cards.map((c: any) => <span key={c.card_id} className="font-value px-1.5 rounded-[2px]" style={{ fontSize: 11.5, border: '1px solid var(--p-border-strong)', color: c.family === 'smart' ? 'var(--p-accent)' : 'var(--p-muted)' }}>{c.card_id}</span>)}
                  </div>
                  <div className="font-value mt-0.5" style={{ fontSize: 12, color: 'var(--p-dim)' }}>DI {n.inputs_on} açık · DO {n.outputs_on} açık</div>
                </button>
              );
            })}
          </nav>

          <div className="space-y-4 min-w-0">
            <State loading={det.loading && !d} error={det.error} />
            {d && <>
              {d.cards.map((c: any) => <BoardCard key={c.card_id} card={c} deviceId={d.device_id} />)}
              <Card title={`Kart programı (ladder) · ${d.node_id} · ${d.plc.program.rungs.length} basamak · ${d.plc.scan_count} tarama · son ${d.plc.last_scan_us} µs`}>
                <Ladder plc={d.plc} />
              </Card>
            </>}
          </div>
        </div>
      )}
    </Page>
  );
};
