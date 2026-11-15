import React, { useState } from 'react';
import { api, usePoll } from './api';
import { deviceName, statusTr, unitTr } from './meta';
import { Badge, Btn, Card, Field, LineChart, Notice, Page, Stat, State, Table, toneFor, useTr } from './ui';

const FEAT_TR: Record<string, string> = { 'Vibration RMS': 'Titreşim (RMS)', 'Motor current': 'Motor akımı', 'Winding temperature': 'Sargı sıcaklığı', 'Pump motor current': 'Pompa motoru akımı',
  'Casing/motor temperature': 'Gövde/motor sıcaklığı', 'Loading': 'Yüklenme', 'Winding hot-spot': 'Sargı sıcak noktası', 'Top-oil temperature': 'Üst yağ sıcaklığı' };
const nf = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export const MaintenanceView: React.FC = () => {
  const tr = useTr();
  const { data, error, loading } = usePoll<any>('/maintenance', 2000);
  return (
    <Page title={tr('Maintenance Prediction', 'Bakım Tahmini')} subtitle={tr('Explainable health index from vibration, temperature and current', 'Titreşim, sıcaklık ve akımdan açıklanabilir sağlık indeksi')}>
      <Notice tone="warn">{data?.disclaimer || 'TAHMİN / ESTIMATE'}</Notice>
      <State loading={loading && !data} error={error} />
      <div className="grid lg:grid-cols-3 gap-3">
        {data?.machines.map((m: any) => (
          <Card key={m.device_id} title={deviceName(m.device_id)} right={<Badge tone={toneFor(m.status)}>{statusTr(m.status)}</Badge>}>
            <div className="flex items-end gap-2"><span className="text-3xl font-mono font-bold" style={{ color: `var(--p-${toneFor(m.status)})` }}>{nf(m.health_index)}</span><span className="text-[11px] font-mono mb-1" style={{ color: 'var(--p-dim)' }}>/100 · {tr('estimated health', 'tahmini sağlık')}</span></div>
            <div role="progressbar" aria-label="health" aria-valuenow={m.health_index} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded my-2" style={{ background: 'var(--p-raised)' }}><div className="h-2 rounded" style={{ width: `${Math.max(2, m.health_index)}%`, background: `var(--p-${toneFor(m.status)})` }} /></div>
            <Table head={[tr('Feature', 'Özellik'), tr('Value', 'Değer'), tr('Score', 'Skor'), tr('Penalty', 'Ceza'), tr('To limit (est.)', 'Limite (tah.)')]}>
              {m.contributions.map((c: any) => <tr key={c.feature}><td>{FEAT_TR[c.label] || c.label}</td><td>{nf(c.value)} {unitTr(c.unit)}</td><td>{nf(c.score)}</td><td>−{nf(c.penalty_points)}</td><td>{c.est_seconds_to_limit != null ? `~${Math.round(c.est_seconds_to_limit / 60)} dk` : tr('stable', 'kararlı')}</td></tr>)}
            </Table>
            <ul className="text-[11px] font-mono mt-2 space-y-0.5" style={{ color: 'var(--p-muted)' }}>{m.contributions.filter((c: any) => c.penalty_points > 0).map((c: any) => <li key={c.label}>• {FEAT_TR[c.label] || c.label} = {nf(c.value)} {unitTr(c.unit)} (nominal {nf(c.nominal)}, sınır {nf(c.limit)}) → −{nf(c.penalty_points)} puan</li>)}</ul>
            <div className="text-[11px] font-mono mt-2" style={{ color: 'var(--p-text)' }}>{m.recommended_action}</div>
          </Card>))}
      </div>
    </Page>
  );
};

export const EnergyView: React.FC = () => {
  const tr = useTr();
  const { data, error, loading, reload } = usePoll<any>('/energy/report', 2000);
  const hist = usePoll<any>('/trends/compare?series=GRID_BUSBAR_11KV:total_p_mw,GRID_BUSBAR_11KV:total_q_mvar&seconds=120', 3000);
  const [msg, setMsg] = useState('');
  const dl = async () => { try { const r: Response = await api('/energy/report.csv', { raw: true }); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'goksystem_energy_report.csv'; a.click(); URL.revokeObjectURL(u); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title={tr('Energy Management', 'Enerji Yönetimi')} subtitle={tr('Active/reactive power, consumption and efficiency (integrated over simulation time)', 'Aktif/reaktif güç, tüketim ve verimlilik (simülasyon zamanı üzerinden integre)')}
      actions={<><Btn onClick={dl}>{tr('Download CSV', 'CSV indir')}</Btn><Btn onClick={async () => { try { await api('/energy/reset', { method: 'POST' }); reload(); } catch (e: any) { setMsg(e.message); } }}>{tr('Reset counters', 'Sayaçları sıfırla')}</Btn></>}>
      <State loading={loading && !data} error={error} />
      {data && <>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <Stat label={tr('Site P', 'Saha P')} value={data.now.site_kw} unit="kW" /><Stat label={tr('Site Q', 'Saha Q')} value={data.now.site_kvar} unit="kvar" />
          <Stat label={tr('Power factor', 'Güç faktörü')} value={data.now.site_pf} tone={data.now.site_pf >= 0.9 ? 'ok' : 'warn'} />
          <Stat label={tr('Energy', 'Enerji')} value={data.site.active_kwh} unit="kWh" /><Stat label={tr('Reactive energy', 'Reaktif enerji')} value={data.site.reactive_kvarh} unit="kvarh" />
          <Stat label={tr('Trafo loading', 'Trafo yüklenme')} value={data.now.trafo_loading_pct} unit="%" tone={data.now.trafo_loading_pct > 90 ? 'bad' : 'dim'} />
        </div>
        <div className="grid lg:grid-cols-2 gap-3">
          <Card title={tr('Consumers', 'Tüketiciler')}><Table head={[tr('Channel', 'Kanal'), 'kW', 'kvar', 'kWh', 'kvarh', '%']}>
            {data.consumers.map((c: any) => <tr key={c.channel}><td>{c.channel}</td><td>{c.now_kw}</td><td>{c.now_kvar}</td><td>{c.kwh}</td><td>{c.kvarh}</td><td>{c.share_pct}</td></tr>)}</Table></Card>
          <Card title={tr('Efficiency report', 'Verimlilik raporu')}><Table head={[tr('Indicator', 'Gösterge'), tr('Value', 'Değer')]}>
            <tr><td>{tr('Distribution efficiency', 'Dağıtım verimi')}</td><td>{data.efficiency.distribution_efficiency_pct ?? '-'} %</td></tr>
            <tr><td>{tr('Transformer losses', 'Trafo kayıpları')}</td><td>{data.efficiency.transformer_loss_kwh} kWh</td></tr>
            <tr><td>{tr('Parts produced', 'Üretilen parça')}</td><td>{data.efficiency.parts_produced}</td></tr>
            <tr><td>kWh / {tr('part (drive motor)', 'parça (sürücü motor)')}</td><td>{data.efficiency.kwh_per_part_factory_motor ?? '-'}</td></tr>
            <tr><td>{tr('Solar generation', 'Güneş üretimi')}</td><td>{data.efficiency.solar_kwh} kWh ({data.efficiency.solar_share_pct ?? '-'} %)</td></tr>
            <tr><td>{tr('Min / avg power factor', 'Min / ort. güç faktörü')}</td><td>{data.site.min_power_factor ?? '-'} / {data.site.avg_power_factor ?? '-'}</td></tr>
            <tr><td>{tr('Cost estimate', 'Maliyet tahmini')} ({data.cost_estimate.tariff_per_kwh} {data.cost_estimate.currency}/kWh)</td><td>{data.cost_estimate.cost} {data.cost_estimate.currency}</td></tr>
          </Table></Card>
        </div>
        {hist.data && <Card title={tr('Site power, last 120 s (MW / MVAr)', 'Saha gücü, son 120 sn (MW / MVAr)')}><LineChart title="Site power" series={hist.data.series.map((s: any) => ({ name: s.series, unit: s.unit, points: s.points }))} /></Card>}
        <Notice>{data.assumptions.join(' ')}</Notice>
      </>}
      {msg && <div role="alert" className="text-[11px] font-mono" style={{ color: 'var(--p-bad)' }}>{msg}</div>}
    </Page>
  );
};

export const PlcView: React.FC = () => {
  const tr = useTr();
  const { data, error, loading, reload } = usePoll<any>('/plc', 700);
  const [editor, setEditor] = useState<string | null>(null), [errs, setErrs] = useState<string[]>([]), [msg, setMsg] = useState('');
  const post = async (path: string, body?: any, method = 'POST') => { try { await api(path, { method, body: body ?? {} }); reload(); setMsg(''); } catch (e: any) { setMsg(e.message); } };
  const tagsList = data ? Object.entries<any>(data.program.tags) : [];
  const manual = tagsList.filter(([, t]) => (t.kind === 'DI' || t.kind === 'AI') && !t.source);
  const render = (n: any): string => { const [k, v] = Object.entries<any>(n)[0]; return k === 'NO' ? `┤ ${v} ├` : k === 'NC' ? `┤/ ${v} ├` : k === 'RISING' ? `┤↑ ${v} ├` : k === 'CMP' ? `[${v.a} ${v.op} ${v.b}]` : k === 'AND' ? v.map(render).join('──') : `(${v.map(render).join(' ∥ ')})`; };
  const outStr = (o: any) => ({ coil: `( ${o.tag} )`, set: `(S ${o.tag})`, reset: `(R ${o.tag})`, ton: `[TON ${o.tag} ${data.program.tags[o.tag]?.preset_ms}ms]`, ctu: `[CTU ${o.tag} PV=${data.program.tags[o.tag]?.preset}]`, move: `[MOVE ${o.value ?? o.from} → ${o.tag}]` } as any)[o.type];
  const saveProgram = async () => { try { await api('/plc/program', { method: 'PUT', body: JSON.parse(editor || '{}') }); setErrs([]); setEditor(null); reload(); } catch (e: any) { setErrs(e.message.includes('{') ? [e.message] : [e.message]); } };
  return (
    <Page title={tr('PLC Logic Simulator', 'PLC Mantık Simülatörü')} subtitle={tr('Ladder scan engine: contacts, coils, TON timers, CTU counters, digital/analog I/O', 'Merdiven tarama motoru: kontaklar, bobinler, TON zamanlayıcı, CTU sayıcı, sayısal/analog G/Ç')}
      actions={<>
        <Btn variant={data?.running ? 'danger' : 'primary'} onClick={() => post('/plc/run', { run: !data?.running })}>{data?.running ? tr('Stop PLC', 'PLC durdur') : tr('Run PLC', 'PLC çalıştır')}</Btn>
        <Btn onClick={() => { setEditor(JSON.stringify(data.program, null, 2)); setErrs([]); }}>{tr('Edit program (JSON)', 'Programı düzenle (JSON)')}</Btn>
        <Btn onClick={() => post('/plc/default-program')}>{tr('Load demo program', 'Demo programı yükle')}</Btn></>}>
      <State loading={loading && !data} error={error} />
      {data && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label={tr('State', 'Durum')} value={data.running ? 'RUN' : 'STOP'} tone={data.running ? 'ok' : 'dim'} /><Stat label={tr('Scans', 'Tarama')} value={data.scan_count} />
          <Stat label={tr('Last scan', 'Son tarama')} value={data.last_scan_us} unit="µs" /><Stat label={tr('Max scan', 'En uzun tarama')} value={data.max_scan_us} unit="µs" />
        </div>
        <Card title={tr('Output write mode', 'Çıkış yazma modu')}>
          <label className="flex items-center gap-2 text-[11px] font-mono min-h-[36px]" style={{ color: 'var(--p-text)' }}>
            <input type="checkbox" checked={data.write_enabled} onChange={e => post('/plc/write-mode', { enabled: e.target.checked })} />
            {tr('Allow PLC outputs to command the plant (START/STOP, SET_SPEED). Off = outputs only change PLC variables.', 'PLC çıkışlarının tesise komut vermesine izin ver (START/STOP, SET_SPEED). Kapalı = çıkışlar yalnızca PLC değişkenlerini değiştirir.')}</label>
          {data.command_log.length > 0 && <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--p-muted)' }}>{data.command_log.map((c: any, i: number) => <div key={i}>{c.tag} → {c.device} {c.operation} {JSON.stringify(c.params)} {c.accepted ? 'OK' : 'REJECTED'}</div>)}</div>}
        </Card>
        {editor !== null && <Card title={tr('Program JSON', 'Program JSON')}>
          <textarea aria-label="PLC program JSON" className="p-in" style={{ minHeight: 320 }} spellCheck={false} value={editor} onChange={e => setEditor(e.target.value)} />
          {errs.map((e, i) => <div role="alert" key={i} className="text-[11px] font-mono" style={{ color: 'var(--p-bad)' }}>{e}</div>)}
          <div className="flex gap-2 mt-2"><Btn variant="primary" onClick={saveProgram}>{tr('Validate & load', 'Doğrula ve yükle')}</Btn><Btn onClick={() => setEditor(null)}>{tr('Cancel', 'Vazgeç')}</Btn></div></Card>}
        <div className="grid xl:grid-cols-[1fr_340px] gap-3">
          <Card title={`${tr('Ladder', 'Merdiven')}: ${data.program.name}`}>
            <ol className="space-y-1">{data.program.rungs.map((r: any) => {
              const on = data.rung_state[r.id];
              return <li key={r.id} className="p-2 rounded border font-mono text-[11px]" style={{ borderColor: on ? 'var(--p-ok)' : 'var(--p-border)', background: 'var(--p-raised)' }}>
                <div className="flex justify-between gap-2" style={{ color: 'var(--p-dim)' }}><span>{r.id} · {r.comment}</span><Badge tone={on ? 'ok' : 'dim'}>{on ? 'POWER' : 'OFF'}</Badge></div>
                <div className="overflow-x-auto whitespace-pre" style={{ color: 'var(--p-text)' }}>{render(r.logic)} ──── {r.outputs.map(outStr).join(' ')}</div></li>; })}</ol>
          </Card>
          <div className="space-y-3 min-w-0">
            <Card title={tr('Manual inputs', 'Manuel girişler')}>
              {manual.map(([name, t]) => t.kind === 'DI'
                ? <label key={name} className="flex items-center gap-2 text-[11px] font-mono min-h-[32px]" style={{ color: 'var(--p-text)' }}><input type="checkbox" checked={!!data.values[name]} onChange={e => post('/plc/input', { tag: name, value: e.target.checked })} />{name} <span style={{ color: 'var(--p-dim)' }}>{t.comment}</span></label>
                : <Field key={name} label={name}><input type="number" step="any" className="p-in" defaultValue={data.values[name]} onBlur={e => post('/plc/input', { tag: name, value: Number(e.target.value) })} /></Field>)}
            </Card>
            <Card title={tr('Tags', 'Etiketler')}><div className="max-h-[320px] overflow-y-auto"><Table head={[tr('Tag', 'Etiket'), tr('Kind', 'Tür'), tr('Value', 'Değer')]}>
              {Object.entries<any>(data.values).map(([k, v]) => { const base = k.split('.')[0]; const kind = data.program.tags[base]?.kind; return <tr key={k}><td>{k}{data.forced[k] !== undefined ? ' 🔒' : ''}</td><td>{kind}</td><td><Badge tone={v === true ? 'ok' : 'dim'}>{String(v)}</Badge></td></tr>; })}</Table></div></Card>
          </div>
        </div>
      </>}
      {msg && <div role="alert" className="text-[11px] font-mono" style={{ color: 'var(--p-bad)' }}>{msg}</div>}
    </Page>
  );
};
