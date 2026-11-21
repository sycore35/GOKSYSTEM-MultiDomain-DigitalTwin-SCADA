import React, { useEffect, useMemo, useState } from 'react';
import { api, usePoll } from './api';
import { SCENARIO_TR, eventLabelTr } from './meta';
import { Badge, Btn, Card, Field, LineChart, Notice, Page, Stat, State, Table, useTr } from './ui';

/* Trend Analyzer + Historian */
export const TrendAnalyzer: React.FC<{ initial?: string[] }> = ({ initial }) => {
  const tr = useTr();
  const list = usePoll<any[]>('/tsdb/series', 0);
  const stats = usePoll<any>('/tsdb/stats', 5000);
  const [sel, setSel] = useState<string[]>(initial && initial.length ? initial : ['FAC_VFD_MOTOR_01:temperature_c', 'FAC_VFD_MOTOR_01:current_a']);
  const [seconds, setSeconds] = useState(120), [norm, setNorm] = useState(true), [shift, setShift] = useState(0), [bucket, setBucket] = useState(0), [filter, setFilter] = useState('');
  useEffect(() => { if (initial && initial.length) setSel(initial); }, [initial?.join(',')]);
  const path = sel.length ? `/trends/compare?series=${encodeURIComponent(sel.join(','))}&seconds=${seconds}&normalize=${norm}&shift_s=${shift}${bucket ? `&bucket_ms=${bucket}` : ''}` : null;
  const { data, error, loading } = usePoll<any>(path, 2000);
  const toggle = (s: string) => setSel(p => p.includes(s) ? p.filter(x => x !== s) : p.length >= 8 ? p : [...p, s]);
  const chartSeries = useMemo(() => data ? data.series.flatMap((s: any) => [
    { name: s.series, unit: norm ? '0-1' : s.unit, points: s.points },
    ...(shift > 0 && s.previous.length ? [{ name: `${s.series} (-${shift}s)`, dashed: true, points: s.previous }] : [])]) : [], [data, norm, shift]);
  const visible = (list.data || []).filter(s => s.series.toLowerCase().includes(filter.toLowerCase())).slice(0, 80);
  return (
    <Page title={tr('Trend Analyzer & Historian', 'Trend Analizörü ve Historian')} subtitle={tr('Multi-sensor overlay, normalized comparison, previous-period overlay, millisecond store with downsampling', 'Çoklu sensör bindirme, normalize karşılaştırma, önceki dönem, downsampling\'li milisaniye depo')}>
      {stats.data && <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label={tr('Stored samples', 'Kayıtlı örnek')} value={stats.data.rows.toLocaleString()} /><Stat label={tr('Series', 'Seri')} value={stats.data.series} />
        <Stat label={tr('Retention', 'Saklama')} value={stats.data.retention_s / 3600} unit="h" /><Stat label={tr('Resolution', 'Çözünürlük')} value="100" unit="ms" hint={tr('one sample per tick', 'tick başına bir örnek')} />
      </div>}
      <div className="grid lg:grid-cols-[280px_1fr] gap-3">
        <Card title={tr('Series (max 8)', 'Seriler (en çok 8)')}>
          <input aria-label={tr('Filter series', 'Seri filtrele')} className="p-in w-full mb-2" placeholder={tr('filter...', 'filtre...')} value={filter} onChange={e => setFilter(e.target.value)} />
          <State loading={list.loading} error={list.error} empty={!!list.data && list.data.length === 0} emptyText={tr('No series yet - start the engine.', 'Henüz seri yok - motoru başlatın.')} />
          <ul className="max-h-[320px] overflow-y-auto space-y-0.5">
            {visible.map(s => <li key={s.series}><label className="flex items-center gap-2 text-[11px] font-mono cursor-pointer min-h-[28px]" style={{ color: 'var(--p-text)' }}>
              <input type="checkbox" checked={sel.includes(s.series)} onChange={() => toggle(s.series)} /><span className="truncate">{s.series}</span><span className="ml-auto" style={{ color: 'var(--p-dim)' }}>{s.unit}</span></label></li>)}
          </ul>
        </Card>
        <div className="space-y-3 min-w-0">
          <Card title={tr('Controls', 'Kontroller')}>
            <div className="flex flex-wrap gap-3 items-end">
              <Field label={tr('Window', 'Pencere')}><select className="p-in" value={seconds} onChange={e => setSeconds(Number(e.target.value))}>{[10, 30, 60, 120, 300, 600].map(v => <option key={v} value={v}>{v} s</option>)}</select></Field>
              <Field label={tr('Bucket', 'Kova')}><select className="p-in" value={bucket} onChange={e => setBucket(Number(e.target.value))}><option value={0}>auto</option><option value={100}>100 ms</option><option value={500}>500 ms</option><option value={1000}>1 s</option><option value={5000}>5 s</option></select></Field>
              <Field label={tr('Compare with previous (s)', 'Önceki dönemle karşılaştır (sn)')}><select className="p-in" value={shift} onChange={e => setShift(Number(e.target.value))}><option value={0}>{tr('off', 'kapalı')}</option>{[30, 60, 120, 300].map(v => <option key={v} value={v}>{v}</option>)}</select></Field>
              <label className="flex items-center gap-2 text-[11px] font-mono min-h-[36px]" style={{ color: 'var(--p-text)' }}><input type="checkbox" checked={norm} onChange={e => setNorm(e.target.checked)} />{tr('Normalize 0-1 (different units)', 'Normalize et 0-1 (farklı birimler)')}</label>
            </div>
          </Card>
          <Card title={tr('Overlay', 'Bindirme')}>
            <State loading={loading && !data} error={error} empty={sel.length === 0} emptyText={tr('Select at least one series.', 'En az bir seri seçin.')} />
            {data && <LineChart title="Trend overlay" height={260} series={chartSeries} yLabel={norm ? 'normalize' : ''} />}
            {data && <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--p-dim)' }}>bucket {data.bucket_ms} ms · {tr('avg per bucket', 'kova ortalaması')}</div>}
          </Card>
          {data && <Card title={tr('Statistics', 'İstatistik')}><Table head={[tr('Series', 'Seri'), 'min', 'max', 'mean', 'σ', tr('last', 'son'), tr('slope/min', 'eğim/dk'), 'n']}>
            {data.series.map((s: any) => s.stats && <tr key={s.series}><td>{s.series}</td>{['min', 'max', 'mean', 'std', 'last', 'slope_per_min'].map(k => <td key={k}>{s.stats[k].toFixed(3)}</td>)}<td>{s.stats.n}</td></tr>)}
          </Table></Card>}
          {data && data.correlations.length > 0 && <Card title={tr('Correlation (Pearson)', 'Korelasyon (Pearson)')}><Table head={['A', 'B', 'r', 'n']}>
            {data.correlations.map((c: any, i: number) => <tr key={i}><td>{c.a}</td><td>{c.b}</td><td><b>{c.pearson ?? 'n/a'}</b></td><td>{c.n}</td></tr>)}</Table>
            <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--p-dim)' }}>{tr('Correlation is not causation; both series share the same simulated plant.', 'Korelasyon nedensellik değildir; iki seri de aynı simüle tesisten gelir.')}</div></Card>}
        </div>
      </div>
    </Page>
  );
};

/* PID Studio */
const COLORS = ['#5BA8F5', '#E6A23C', '#4FD18B', '#E5736F'];
export const PidStudio: React.FC = () => {
  const tr = useTr();
  const [plant, setPlant] = useState({ plant_k: 1, tau: 5, theta: 0.5 });
  const [runs, setRuns] = useState([{ name: 'A', kp: 1, ki: 0.2, kd: 0 }, { name: 'B', kp: 4, ki: 1.2, kd: 0.5 }]);
  const [res, setRes] = useState<any>(null), [err, setErr] = useState('');
  const [sug, setSug] = useState<any[]>([]);
  const live = usePoll<any>('/pid/live?seconds=120', 1500);
  const [lg, setLg] = useState<{ kp: number; ki: number; kd: number } | null>(null), [msg, setMsg] = useState('');
  const sim = async () => { setErr(''); try { setRes(await api('/pid/compare', { body: { runs, ...plant, setpoint: 1, duration: 40 } })); } catch (e: any) { setErr(e.message); } };
  useEffect(() => { sim(); /* initial */ }, []);
  useEffect(() => { if (live.data && !lg) setLg({ kp: live.data.kp, ki: live.data.ki, kd: live.data.kd }); }, [live.data]);
  const setRun = (i: number, k: string, v: number | string) => setRuns(rs => rs.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const num = (v: any, f: (n: number) => void, w = 80, step: any = 'any') => <input type="number" step={step} className="p-in" style={{ width: w }} value={v} onChange={e => f(Number(e.target.value))} />;
  const applyLive = async (extra: any = {}) => { try { await api('/pid/live', { body: { ...lg, ...extra } }); setMsg(tr('Applied to the running process model', 'Çalışan proses modeline uygulandı')); live.reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title="PID Tuning Studio" subtitle={tr('Compare step responses (overshoot, rise, settling) and tune the live pH loop', 'Basamak yanıtlarını karşılaştırın (aşım, yükselme, yerleşme) ve canlı pH döngüsünü ayarlayın')}>
      <Notice>{tr('Left: offline simulation on a first-order-plus-dead-time plant. Right: gains of the running pH neutralization controller. Suggested gains are textbook starting points.', 'Sol: birinci derece + ölü zaman bitkisi üzerinde çevrimdışı simülasyon. Sağ: çalışan pH nötralizasyon denetleyicisinin kazançları. Önerilen kazançlar ders kitabı başlangıç değerleridir.')}</Notice>
      <div className="grid xl:grid-cols-2 gap-3">
        <div className="space-y-3 min-w-0">
          <Card title={tr('Plant (FOPDT)', 'Bitki (FOPDT)')}>
            <div className="flex flex-wrap gap-3">
              <Field label="K">{num(plant.plant_k, v => setPlant({ ...plant, plant_k: v }))}</Field>
              <Field label="τ (s)">{num(plant.tau, v => setPlant({ ...plant, tau: v }))}</Field>
              <Field label="θ (s)">{num(plant.theta, v => setPlant({ ...plant, theta: v }))}</Field>
              <Btn onClick={async () => setSug(await api(`/pid/suggest?k=${plant.plant_k}&tau=${plant.tau}&theta=${plant.theta}`))}>{tr('Suggest gains', 'Kazanç öner')}</Btn>
            </div>
            {sug.map(s => <div key={s.name} className="text-[11px] font-mono mt-1 flex flex-wrap gap-2 items-center" style={{ color: 'var(--p-muted)' }}>{s.name}: Kp {s.kp} Ki {s.ki} Kd {s.kd}
              <Btn onClick={() => setRuns(rs => [{ name: s.name.split(' ')[0], kp: s.kp, ki: s.ki, kd: s.kd }, ...rs.slice(1)])}>{tr('Use as A', 'A olarak kullan')}</Btn></div>)}
          </Card>
          <Card title={tr('Gain sets to compare (max 4)', 'Karşılaştırılacak kazanç setleri (en çok 4)')} right={<>{runs.length < 4 && <Btn onClick={() => setRuns([...runs, { name: String.fromCharCode(65 + runs.length), kp: 2, ki: 0.5, kd: 0 }])}>+</Btn>}</>}>
            {runs.map((r, i) => <div key={i} className="flex flex-wrap gap-2 items-end mb-2">
              <span aria-hidden className="w-3 h-3 rounded-sm mb-2" style={{ background: COLORS[i] }} />
              <Field label={tr('Name', 'Ad')}><input className="p-in" style={{ width: 70 }} value={r.name} onChange={e => setRun(i, 'name', e.target.value)} /></Field>
              <Field label="Kp">{num(r.kp, v => setRun(i, 'kp', v))}</Field><Field label="Ki">{num(r.ki, v => setRun(i, 'ki', v))}</Field><Field label="Kd">{num(r.kd, v => setRun(i, 'kd', v))}</Field>
              {runs.length > 1 && <Btn onClick={() => setRuns(runs.filter((_, j) => j !== i))} aria-label={`${tr('Remove', 'Kaldır')} ${r.name}`}>×</Btn>}
            </div>)}
            <Btn variant="primary" onClick={sim}>{tr('Simulate & compare', 'Simüle et ve karşılaştır')}</Btn>
            {err && <div role="alert" className="text-[11px] font-mono mt-1" style={{ color: 'var(--p-bad)' }}>{err}</div>}
          </Card>
          {res && <Card title={tr('Step response (setpoint = 1)', 'Basamak yanıtı (hedef = 1)')}>
            <LineChart title="Step response" height={240} band={[0.98, 1.02]} xIsSeconds series={res.runs.map((r: any, i: number) => ({ name: r.name, color: COLORS[i], dashed: i % 2 === 1, points: r.t.map((t: number, j: number) => ({ t, v: r.y[j] })) }))} />
            <Table head={[tr('Run', 'Koşu'), 'Kp/Ki/Kd', tr('Overshoot %', 'Aşım %'), tr('Rise s', 'Yükselme s'), tr('Settling s (2%)', 'Yerleşme s (%2)'), 'IAE', tr('SS error', 'KD hata'), tr('Stable', 'Kararlı')]}>
              {res.runs.map((r: any) => <tr key={r.name}><td>{r.name}</td><td>{r.gains.kp}/{r.gains.ki}/{r.gains.kd}</td><td>{r.metrics.overshoot_pct}</td><td>{r.metrics.rise_time_s ?? '-'}</td><td>{r.metrics.settling_time_s ?? '-'}</td><td>{r.metrics.iae}</td><td>{r.metrics.steady_state_error}</td><td><Badge tone={r.metrics.stable ? 'ok' : 'bad'}>{r.metrics.stable ? 'OK' : 'NO'}</Badge></td></tr>)}
            </Table></Card>}
        </div>
        <div className="space-y-3 min-w-0">
          <Card title={tr('Live loop: PROC_VALVE_01 pH neutralization', 'Canlı döngü: PROC_VALVE_01 pH nötralizasyon')}>
            <State loading={live.loading && !live.data} error={live.error} />
            {live.data && lg && <>
              <div className="flex flex-wrap gap-3 items-end">
                <Field label="Kp">{num(lg.kp, v => setLg({ ...lg, kp: v }))}</Field><Field label="Ki">{num(lg.ki, v => setLg({ ...lg, ki: v }))}</Field><Field label="Kd">{num(lg.kd, v => setLg({ ...lg, kd: v }))}</Field>
                <Btn variant="primary" onClick={() => applyLive()}>{tr('Apply live', 'Canlı uygula')}</Btn>
                <Btn onClick={async () => { try { await api('/pid/live/disturb?delta=0.8', { method: 'POST' }); setMsg(tr('pH disturbance +0.8 applied', 'pH bozucusu +0.8 uygulandı')); } catch (e: any) { setMsg(e.message); } }}>{tr('Disturb pH +0.8', 'pH bozucu +0.8')}</Btn>
              </div>
              {msg && <div role="status" className="text-[11px] font-mono mt-1" style={{ color: 'var(--p-muted)' }}>{msg}</div>}
              <div className="mt-2"><LineChart title="pH process value" height={150} yLabel="pH" series={[{ name: 'pH (PV)', points: live.data.pv }]} band={[live.data.setpoint - 0.14, live.data.setpoint + 0.14]} /></div>
              <LineChart title="Valve output" height={120} yLabel="%" series={[{ name: tr('Valve position', 'Vana konumu') + ' %', points: live.data.out }]} />
              <div className="text-[10px] font-mono" style={{ color: 'var(--p-dim)' }}>Kazançlar çalışan proses modeline hemen uygulanır; senaryo sıfırlama varsayılanlara (18 / 1,2 / 0,5) döner. · SP {live.data.setpoint}</div>
            </>}
          </Card>
        </div>
      </div>
    </Page>
  );
};

/* Scenarios */
export const ScenariosView: React.FC = () => {
  const tr = useTr();
  const cat = usePoll<any[]>('/scenarios', 0);
  const st = usePoll<any>('/scenarios/status', 1000);
  const [msg, setMsg] = useState('');
  const run = async (id: string) => { try { await api(`/scenarios/${id}/run`, { method: 'POST' }); setMsg(`${tr('Started', 'Başladı')}: ${id}`); st.reload(); } catch (e: any) { setMsg(e.message); } };
  const s = st.data;
  return (
    <Page title={tr('Multi-Scenario Engine', 'Çoklu Senaryo Motoru')} subtitle={tr('Normal, fault, maintenance, emergency stop and production timelines applied to the live engine', 'Normal, arıza, bakım, acil durdurma ve üretim zaman çizelgeleri canlı motora uygulanır')}
      actions={<Btn variant="danger" onClick={async () => { try { await api('/scenarios/stop', { method: 'POST' }); setMsg(tr('Scenario stopped, plant reset', 'Senaryo durduruldu, tesis sıfırlandı')); st.reload(); } catch (e: any) { setMsg(e.message); } }}>{tr('Stop & reset plant', 'Durdur ve tesisi sıfırla')}</Btn>}>
      <Notice tone="warn">{tr('Starting a scenario resets the simulation (alarms, models) before applying its initial conditions.', 'Senaryo başlatmak, başlangıç koşullarını uygulamadan önce simülasyonu (alarm, model) sıfırlar.')}</Notice>
      {s?.scenario_id && <Card title={`${tr('Active', 'Aktif')}: ${SCENARIO_TR[s.scenario_id]?.name || s.name}`} right={<Badge tone={s.finished ? 'dim' : 'ok'}>{s.finished ? tr('FINISHED', 'BİTTİ') : tr('RUNNING', 'ÇALIŞIYOR')}</Badge>}>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={s.duration_sec} aria-valuenow={Math.min(s.elapsed_sec, s.duration_sec)} className="h-2 rounded" style={{ background: 'var(--p-raised)' }}>
          <div className="h-2 rounded" style={{ width: `${Math.min(100, (s.elapsed_sec / s.duration_sec) * 100)}%`, background: 'var(--p-accent)' }} /></div>
        <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--p-muted)' }}>{s.elapsed_sec} / {s.duration_sec} s</div>
        <ul className="text-[11px] font-mono mt-2 space-y-0.5">{s.events.map((e: any, i: number) => <li key={i} style={{ color: e.fired ? 'var(--p-ok)' : 'var(--p-dim)' }}>{e.fired ? '✔' : '○'} t={e.t}s · {eventLabelTr(e.label)}</li>)}</ul>
        {s.log.length > 0 && <div className="text-[10px] font-mono mt-2" style={{ color: 'var(--p-muted)' }}>{s.log.map((l: any, i: number) => <div key={i}>[{l.scenario_t}s] {eventLabelTr(l.label)}: {l.ok ? tr('OK', 'tamam') : tr('REJECTED', 'reddedildi')} - {l.message}</div>)}</div>}
      </Card>}
      <State loading={cat.loading} error={cat.error} />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
        {cat.data?.map(c => <Card key={c.scenario_id} title={SCENARIO_TR[c.scenario_id]?.name || c.name} right={<span className="text-[10px] font-mono" style={{ color: 'var(--p-dim)' }}>{c.duration_sec}s</span>}>
          <p className="text-[11px] font-mono mb-2" style={{ color: 'var(--p-muted)' }}>{SCENARIO_TR[c.scenario_id]?.desc || c.description}</p>
          <ul className="text-[10px] font-mono mb-2" style={{ color: 'var(--p-dim)' }}>{c.events.map((e: any, i: number) => <li key={i}>t={e.t}s · {eventLabelTr(e.label)}</li>)}{c.events.length === 0 && <li>{tr('no scheduled events', 'planlı olay yok')}</li>}</ul>
          <Btn variant="primary" onClick={() => run(c.scenario_id)}>{tr('Run', 'Çalıştır')}</Btn></Card>)}
      </div>
      {msg && <div role="status" className="text-[11px] font-mono" style={{ color: 'var(--p-muted)' }}>{msg}</div>}
    </Page>
  );
};
