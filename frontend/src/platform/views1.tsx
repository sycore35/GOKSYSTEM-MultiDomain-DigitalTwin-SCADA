import React, { useState } from 'react';
import { alarmText, deviceName, fmtNum, statusTr, typeTr, zoneTr } from './meta';
import { api, usePoll } from './api';
import { Badge, Btn, Card, Field, Notice, Page, Stat, State, Table, toneFor, useTr } from './ui';

const useAction = () => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async <T,>(fn: () => Promise<T>, okText?: (r: T) => string) => {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: okText ? okText(r) : 'OK' }); return r; }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  return { busy, msg, run };
};
const Msg: React.FC<{ m: { ok: boolean; text: string } | null }> = ({ m }) => m ? <div role="status" className="text-[11px] font-mono" style={{ color: m.ok ? 'var(--p-ok)' : 'var(--p-bad)' }}>{m.text}</div> : null;

/* Performance */
export const PerfView: React.FC = () => {
  const tr = useTr();
  const { data, error, loading, reload } = usePoll<any>('/perf/tick', 1000);
  const [det, setDet] = useState<any>(null), [ft, setFt] = useState<any>(null), [bm, setBm] = useState<any>(null);
  const a = useAction();
  const sd = data?.step_duration_ms, pe = data?.period_error_abs_ms;
  return (
    <Page title={tr('Physics Engine Performance', 'Fizik Motoru Performansı')}
      subtitle={tr('10 Hz tick timing, fault isolation and determinism - measured, not claimed', '10 Hz tick zamanlaması, hata izolasyonu ve determinizm - ölçülmüş değerler')}
      actions={<Btn onClick={() => a.run(() => api('/perf/reset', { method: 'POST' }).then(reload))}>{tr('Reset counters', 'Sayaçları sıfırla')}</Btn>}>
      <State loading={loading && !data} error={error} />
      {data && <>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <Stat label={tr('Ticks', 'Tick')} value={data.ticks} />
          <Stat label="Jitter σ" value={data.jitter_std_ms} unit="ms" tone={data.jitter_std_ms < 2 ? 'ok' : 'warn'} />
          <Stat label={tr('Overruns', 'Aşım')} value={data.overruns} tone={data.overruns ? 'bad' : 'ok'} />
          <Stat label={tr('Missed deadlines', 'Kaçan deadline')} value={data.missed_deadlines} tone={data.missed_deadlines ? 'bad' : 'ok'} />
          <Stat label={tr('Step p99', 'Adım p99')} value={sd.p99} unit="ms" hint={`${tr('budget', 'bütçe')} ${data.nominal_period_ms} ms`} />
          <Stat label={tr('Model errors', 'Model hatası')} value={Object.values(data.model_errors as Record<string, number>).reduce((x, y) => x + y, 0)} tone={Object.keys(data.model_errors).length ? 'warn' : 'ok'} />
        </div>
        <Card title={tr('Tick timing distribution (ms)', 'Tick zamanlama dağılımı (ms)')}>
          <Table head={['', 'p50', 'p95', 'p99', 'max', 'mean']}>
            {([[tr('Step compute time', 'Adım hesap süresi'), sd], [tr('|Period error| (jitter)', '|Periyot hatası| (jitter)'), pe], [tr('Start lateness', 'Başlama gecikmesi'), data.start_lateness_ms]] as any[]).map(([n, d]) => (
              <tr key={n}><td>{n}</td><td>{d.p50}</td><td>{d.p95}</td><td>{d.p99}</td><td>{d.max}</td><td>{d.mean}</td></tr>))}
          </Table>
          <div className="text-[10px] font-mono mt-2" style={{ color: 'var(--p-dim)' }}>
            <div><b>jitter</b>: gerçek tick periyodu ile nominal periyot farkının standart sapması</div><div><b>aşım</b>: hesap süresi periyot bütçesini aşan adım</div><div><b>kaçan deadline</b>: planlanan zamanından bir tam periyottan geç başlayan tick</div>
          </div>
          {Object.keys(data.model_errors).length > 0 && <div className="mt-2 text-[11px] font-mono" style={{ color: 'var(--p-warn)' }}>{Object.entries(data.last_error).map(([k, v]) => <div key={k}>{k}: {v as string}</div>)}</div>}
        </Card>
      </>}
      <div className="grid md:grid-cols-3 gap-2">
        <Card title={tr('Determinism', 'Determinizm')}>
          <p className="text-[11px] font-mono mb-2" style={{ color: 'var(--p-muted)' }}>{tr('Runs two engines with the same seed (noise on) and hashes every telemetry value.', 'Aynı seed ile iki motor çalıştırır (gürültü açık) ve tüm telemetri değerlerini hash\'ler.')}</p>
          <Btn disabled={a.busy} onClick={async () => setDet(await a.run(() => api('/perf/determinism?steps=600', { method: 'POST' })))}>{tr('Run check', 'Kontrolü çalıştır')}</Btn>
          {det && <div className="text-[11px] font-mono mt-2 space-y-1"><Badge tone={det.identical_same_seed ? 'ok' : 'bad'}>{det.identical_same_seed ? tr('IDENTICAL (same seed)', 'AYNI (aynı seed)') : 'DIFFERENT'}</Badge> <Badge tone={det.differs_other_seed ? 'ok' : 'warn'}>{det.differs_other_seed ? tr('differs with other seed', 'başka seed\'de farklı') : 'same?'}</Badge><div style={{ color: 'var(--p-dim)' }}>{det.steps} steps · sha256 {det.hash_run_a.slice(0, 16)}…</div></div>}
        </Card>
        <Card title={tr('Fault tolerance', 'Hata toleransı')}>
          <p className="text-[11px] font-mono mb-2" style={{ color: 'var(--p-muted)' }}>{tr('Registers a model that raises every tick; the loop must keep running.', 'Her tick hata fırlatan bir model ekler; döngü çalışmaya devam etmelidir.')}</p>
          <Btn disabled={a.busy} onClick={async () => setFt(await a.run(() => api('/perf/fault-tolerance?steps=100', { method: 'POST' })))}>{tr('Run test', 'Testi çalıştır')}</Btn>
          {ft && <div className="text-[11px] font-mono mt-2"><Badge tone={ft.passed ? 'ok' : 'bad'}>{ft.passed ? 'PASS' : 'FAIL'}</Badge><div style={{ color: 'var(--p-muted)' }}>{ft.steps_completed}/{ft.steps_requested} {tr('steps completed', 'adım tamamlandı')}, {JSON.stringify(ft.errors_counted)}</div></div>}
        </Card>
        <Card title={tr('Isolated 10 s benchmark', 'İzole 10 sn ölçüm')}>
          <p className="text-[11px] font-mono mb-2" style={{ color: 'var(--p-muted)' }}>{tr('Separate engine in real time (shares CPU with the live one).', 'Ayrı bir motor gerçek zamanlı çalışır (canlı motorla CPU paylaşır).')}</p>
          <Btn disabled={a.busy} onClick={async () => setBm(await a.run(() => api('/perf/benchmark?seconds=10', { method: 'POST' })))}>{a.busy ? tr('Running...', 'Çalışıyor...') : tr('Run 10 s', '10 sn çalıştır')}</Btn>
          {bm && <div className="text-[11px] font-mono mt-2" style={{ color: 'var(--p-muted)' }}>{bm.ticks} ticks · jitter σ {bm.jitter_std_ms} ms · |err| p50/p95/p99 {bm.period_error_abs_ms.p50}/{bm.period_error_abs_ms.p95}/{bm.period_error_abs_ms.p99} ms · {tr('overruns', 'aşım')} {bm.overruns}</div>}
        </Card>
      </div>
      <Msg m={a.msg} />
    </Page>
  );
};

/* Alarm Center */
export const AlarmCenter: React.FC = () => {
  const tr = useTr();
  const { data, error, loading, reload } = usePoll<any>('/alarms/center', 1500);
  const hist = usePoll<any[]>('/alarms/history?limit=60', 3000);
  const [tab, setTab] = useState<'active' | 'shelved' | 'history' | 'config'>('active');
  const [shelf, setShelf] = useState<{ id: string; reason: string; min: number } | null>(null);
  const [cfg, setCfg] = useState({ id: '', deadband: '', on_delay_s: '' });
  const a = useAction();
  const st = data?.stats;
  const doAck = (id: string) => a.run(() => api(`/alarms/${id}/ack`, { method: 'POST' }).then(reload));
  return (
    <Page title={tr('Alarm Management Center', 'Alarm Yönetim Merkezi')} subtitle={tr('ISA-18.2 approach: priorities, acknowledge, shelving with reason, deadband, history', 'ISA-18.2 yaklaşımı: öncelik, onay, gerekçeli rafa alma, deadband, geçmiş')}
      actions={<Btn onClick={() => a.run(() => api<any>('/alarms/ack-all', { method: 'POST' }).then(r => { reload(); return r; }), r => `${r.acknowledged} ${tr('acknowledged', 'onaylandı')}`)}>{tr('Acknowledge all', 'Tümünü onayla')}</Btn>}>
      <State loading={loading && !data} error={error} />
      {st && <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
        <Stat label={tr('Standing', 'Bekleyen')} value={st.standing} tone={st.standing ? 'warn' : 'ok'} />
        <Stat label={tr('Unacknowledged', 'Onaysız')} value={st.unacknowledged} tone={st.unacknowledged ? 'bad' : 'ok'} />
        <Stat label={tr('Shelved', 'Rafta')} value={st.shelved} />
        <Stat label={tr('Rate / 10 min', 'Oran / 10 dk')} value={st.alarm_rate_per_10min} />
        <Stat label="P1 / P2 / P3 / P4" value={[1, 2, 3, 4].map(p => st.by_priority[p] ?? 0).join(' / ')} />
        <Stat label={tr('Mean time to ack', 'Ort. onay süresi')} value={st.mean_time_to_ack_s != null ? fmtNum(st.mean_time_to_ack_s, 1) : '—'} unit={st.mean_time_to_ack_s != null ? 'sn' : undefined} />
      </div>}
      <div role="tablist" aria-label="Alarm views" className="flex flex-wrap gap-1">
        {(['active', 'shelved', 'history', 'config'] as const).map(k => (
          <Btn key={k} role="tab" aria-selected={tab === k} variant={tab === k ? 'primary' : ''} onClick={() => setTab(k)}>
            {{ active: tr('Active', 'Aktif'), shelved: tr('Shelved', 'Rafta'), history: tr('History', 'Geçmiş'), config: tr('Settings', 'Ayarlar') }[k]}
            {k === 'active' && data ? ` (${data.active.length})` : k === 'shelved' && data ? ` (${data.shelved.length})` : ''}
          </Btn>))}
      </div>
      {tab === 'active' && data && (data.active.length === 0 ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div style={{ fontWeight: 600 }}>{tr('All measurements within limits', 'Tüm ölçümler normal sınırlarda')}</div>
              <div style={{ color: 'var(--p-muted)', fontSize: 13 }}>{tr('No standing alarms. Run the fault scenario to see the alarm lifecycle.', 'Bekleyen alarm yok. Alarm yaşam döngüsünü görmek için arıza senaryosunu çalıştırın.')}</div>
            </div>
            <Btn variant="primary" onClick={() => a.run(() => api('/scenarios/fault/run', { method: 'POST' }).then(reload), () => tr('Fault scenario started', 'Arıza senaryosu başlatıldı'))}>{tr('Run fault scenario', 'Arıza senaryosu çalıştır')}</Btn>
          </div>
          {hist.data && hist.data.length > 0 && (
            <div className="mt-3">
              <div style={{ color: 'var(--p-muted)', fontSize: 12, marginBottom: 6 }}>{tr('Recent transitions', 'Son geçişler')}</div>
              <Table head={[tr('Time', 'Zaman'), 'Alarm', tr('Transition', 'Geçiş'), 'P']}>
                {hist.data.slice(0, 5).map((e: any) => <tr key={e.seq}><td className="font-value">{new Date(e.wall_time * 1000).toLocaleTimeString('tr-TR')}</td><td>{e.alarm_id}</td><td>{e.from_state ? statusTr(e.from_state) : '∅'} → {statusTr(e.to_state)}</td><td>{e.priority}</td></tr>)}
              </Table>
            </div>)}
        </Card>) : (
        <Card><Table head={['P', tr('State', 'Durum'), 'Alarm', tr('Device', 'Cihaz'), tr('Value / limit', 'Değer / limit'), tr('Occ.', 'Adet'), '']}>
          {[...data.active].sort((x: any, y: any) => x.priority - y.priority || x.trigger_sim_time - y.trigger_sim_time).map((al: any) => (
            <tr key={al.alarm_id}><td><b>P{al.priority}</b></td><td><Badge tone={toneFor(al.state)}>{statusTr(al.state)}</Badge></td>
              <td title={al.message}>{al.alarm_id}<div className="text-[10px]" style={{ color: 'var(--p-dim)' }}>{alarmText(al)}</div></td><td>{deviceName(al.source_device)}</td>
              <td className="font-value">{fmtNum(al.current_value, 2)} / {fmtNum(al.setpoint_or_limit, 2)}</td><td>{al.occurrences}</td>
              <td className="whitespace-nowrap">
                {(al.state === 'UNACK_ALARM' || al.state === 'RTN_UNACK') && <Btn onClick={() => doAck(al.alarm_id)} aria-label={`${tr('Acknowledge', 'Onayla')} ${al.alarm_id}`}>{tr('ACK', 'ONAY')}</Btn>}{' '}
                <Btn onClick={() => setShelf({ id: al.alarm_id, reason: '', min: 10 })} aria-label={`${tr('Shelve', 'Rafa al')} ${al.alarm_id}`}>{tr('Shelve', 'Rafa al')}</Btn></td></tr>))}
        </Table></Card>))}
      {shelf && (
        <Card title={`${tr('Shelve', 'Rafa al')} ${shelf.id}`}>
          <form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); a.run(() => api(`/alarms/${shelf.id}/shelve`, { body: { duration_s: shelf.min * 60, reason: shelf.reason } }).then(() => { setShelf(null); reload(); })); }}>
            <Field label={tr('Reason (required)', 'Gerekçe (zorunlu)')}><input required className="p-in" style={{ minWidth: 240 }} value={shelf.reason} onChange={e => setShelf({ ...shelf, reason: e.target.value })} /></Field>
            <Field label={tr('Minutes (max 480)', 'Dakika (en çok 480)')}><input type="number" min={1} max={480} className="p-in" style={{ width: 90 }} value={shelf.min} onChange={e => setShelf({ ...shelf, min: Number(e.target.value) })} /></Field>
            <Btn variant="primary" type="submit">{tr('Shelve', 'Rafa al')}</Btn><Btn onClick={() => setShelf(null)}>{tr('Cancel', 'Vazgeç')}</Btn>
          </form>
        </Card>)}
      {tab === 'shelved' && data && (data.shelved.length === 0 ? <State empty emptyText={tr('Nothing shelved.', 'Rafta alarm yok.')} /> : (
        <Card><Table head={['Alarm', tr('By', 'Kim'), tr('Reason', 'Gerekçe'), tr('Expires', 'Bitiş'), '']}>
          {data.shelved.map((al: any) => <tr key={al.alarm_id}><td>{al.alarm_id}</td><td>{al.shelved_by}</td><td>{al.shelve_reason}</td><td>{al.shelved_until ? new Date(al.shelved_until * 1000).toLocaleTimeString() : ''}</td>
            <td><Btn onClick={() => a.run(() => api(`/alarms/${al.alarm_id}/unshelve`, { method: 'POST' }).then(reload))}>{tr('Unshelve', 'Rafı kaldır')}</Btn></td></tr>)}
        </Table></Card>))}
      {tab === 'history' && (hist.data && hist.data.length ? (
        <Card><Table head={[tr('Time', 'Zaman'), 'Alarm', tr('Transition', 'Geçiş'), 'P', tr('Value', 'Değer'), tr('Operator', 'Operatör'), tr('Note', 'Not')]}>
          {hist.data.map((e: any) => <tr key={e.seq}><td>{new Date(e.wall_time * 1000).toLocaleTimeString('tr-TR')}</td><td>{e.alarm_id}</td><td>{e.from_state ? statusTr(e.from_state) : '∅'} → {statusTr(e.to_state)}</td><td>{e.priority}</td><td>{e.value}</td><td>{e.operator ?? ''}</td><td>{e.note}</td></tr>)}
        </Table></Card>) : <State empty emptyText={tr('No alarm events yet. Inject a fault from the Factory view or run the "fault" scenario.', 'Henüz alarm olayı yok. Fabrika görünümünden hata verin ya da "fault" senaryosunu çalıştırın.')} />)}
      {tab === 'config' && data && (
        <Card title={tr('Deadband and on-delay per alarm', 'Alarm başına deadband ve gecikme')}>
          <p className="text-[11px] font-mono mb-2" style={{ color: 'var(--p-muted)' }}>{tr(`Default deadband ${(data.default_deadband_pct * 100).toFixed(1)} % of the limit. Needs ALARM_CONFIG permission.`, `Varsayılan deadband limitin %${(data.default_deadband_pct * 100).toFixed(1)}'i. ALARM_CONFIG yetkisi gerekir.`)}</p>
          <form className="flex flex-wrap gap-2 items-end" onSubmit={e => { e.preventDefault(); a.run(() => api(`/alarms/${cfg.id}/config`, { method: 'PUT', body: { deadband: cfg.deadband === '' ? null : Number(cfg.deadband), on_delay_s: cfg.on_delay_s === '' ? null : Number(cfg.on_delay_s) } }).then(reload), () => tr('Saved', 'Kaydedildi')); }}>
            <Field label="Alarm ID"><select required className="p-in" value={cfg.id} onChange={e => setCfg({ ...cfg, id: e.target.value })}><option value="">-</option>{data.all.map((x: any) => <option key={x.alarm_id}>{x.alarm_id}</option>)}</select></Field>
            <Field label={tr('Deadband (absolute)', 'Deadband (mutlak)')}><input type="number" step="any" className="p-in" style={{ width: 120 }} value={cfg.deadband} onChange={e => setCfg({ ...cfg, deadband: e.target.value })} /></Field>
            <Field label={tr('On-delay (s)', 'Gecikme (sn)')}><input type="number" step="any" className="p-in" style={{ width: 110 }} value={cfg.on_delay_s} onChange={e => setCfg({ ...cfg, on_delay_s: e.target.value })} /></Field>
            <Btn variant="primary" type="submit">{tr('Apply', 'Uygula')}</Btn>
          </form>
          <div className="text-[11px] font-mono mt-2" style={{ color: 'var(--p-muted)' }}>{Object.entries(data.config).map(([k, v]) => <div key={k}>{k}: {JSON.stringify(v)}</div>)}</div>
          {st.bad_actors.length > 0 && <div className="mt-3"><div className="text-[10px] uppercase" style={{ color: 'var(--p-muted)' }}>{tr('Most frequent alarms', 'En sık alarmlar')}</div>{st.bad_actors.map((b: any) => <div key={b.alarm_id} className="text-[11px] font-mono" style={{ color: 'var(--p-text)' }}>{b.alarm_id}: {b.trips}</div>)}</div>}
        </Card>)}
      <Msg m={a.msg} />
    </Page>
  );
};

/* Assets */
const EMPTY = { asset_id: '', tag: '', name: '', type: 'MOTOR', manufacturer: '', model: '', serial: '', location: '', status: 'IN_SERVICE', install_date: '', device_id: '', notes: '' };
export const AssetsView: React.FC = () => {
  const tr = useTr();
  const [q, setQ] = useState(''), [type, setType] = useState('');
  const path = `/assets?${type ? `type=${type}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`;
  const { data, error, loading, reload } = usePoll<any[]>(path, 4000);
  const sum = usePoll<any>('/assets/summary', 6000);
  const meta = usePoll<any>('/assets/meta', 0);
  const [form, setForm] = useState<any | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const a = useAction();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const { asset_id, ...body } = form;
    a.run(() => (asset_id ? api(`/assets/${asset_id}`, { method: 'PUT', body }) : api('/assets', { body })).then(() => { setForm(null); reload(); sum.reload(); }), () => tr('Saved', 'Kaydedildi'));
  };
  const fld = (k: string, label: string, props: any = {}) => <Field label={label}><input className="p-in" value={form[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} {...props} /></Field>;
  return (
    <Page title={tr('Industrial Asset Manager', 'Endüstriyel Varlık Yöneticisi')} subtitle={tr('PLC, motor, pump, valve, sensor, transformer inventory linked to live devices', 'Canlı cihazlara bağlı PLC, motor, pompa, vana, sensör, trafo envanteri')}
      actions={<Btn variant="primary" onClick={() => setForm({ ...EMPTY })}>{tr('Add asset', 'Varlık ekle')}</Btn>}>
      {sum.data && <div className="flex flex-wrap gap-2"><Stat label={tr('Total assets', 'Toplam varlık')} value={sum.data.total} />{Object.entries(sum.data.by_status).map(([k, v]) => <Stat key={k} label={statusTr(k)} value={v as number} tone={toneFor(k)} />)}</div>}
      <div className="flex flex-wrap gap-2 items-end">
        <Field label={tr('Search', 'Ara')}><input className="p-in" value={q} onChange={e => setQ(e.target.value)} placeholder="etiket, ad, seri no…" /></Field>
        <Field label={tr('Type', 'Tür')}><select className="p-in" value={type} onChange={e => setType(e.target.value)}><option value="">{tr('All', 'Tümü')}</option>{meta.data?.types.map((t: string) => <option key={t} value={t}>{typeTr(t)}</option>)}</select></Field>
      </div>
      {form && (
        <Card title={form.asset_id ? tr('Edit asset', 'Varlığı düzenle') : tr('New asset', 'Yeni varlık')}>
          <form onSubmit={save} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {fld('tag', 'Tag *', { required: true })}{fld('name', tr('Name', 'Ad') + ' *', { required: true })}
            <Field label={tr('Type', 'Tür')}><select className="p-in" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{meta.data?.types.map((t: string) => <option key={t}>{t}</option>)}</select></Field>
            <Field label={tr('Status', 'Durum')}><select className="p-in" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{meta.data?.statuses.map((t: string) => <option key={t}>{t}</option>)}</select></Field>
            {fld('manufacturer', tr('Manufacturer', 'Üretici'))}{fld('model', 'Model')}{fld('serial', tr('Serial', 'Seri no'))}{fld('location', tr('Location', 'Konum'))}
            {fld('install_date', tr('Install date', 'Kurulum tarihi'), { type: 'date' })}{fld('device_id', tr('Linked device id', 'Bağlı cihaz kimliği'))}{fld('notes', tr('Notes', 'Notlar'))}
            <div className="flex gap-2 items-end"><Btn variant="primary" type="submit">{tr('Save', 'Kaydet')}</Btn><Btn onClick={() => setForm(null)}>{tr('Cancel', 'Vazgeç')}</Btn></div>
          </form>
        </Card>)}
      <State loading={loading && !data} error={error} empty={!!data && data.length === 0} emptyText={tr('No assets match.', 'Eşleşen varlık yok.')} />
      {data && data.length > 0 && <Card><Table head={['Tag', tr('Name', 'Ad'), tr('Type', 'Tür'), tr('Status', 'Durum'), tr('Live', 'Canlı'), tr('Location', 'Konum'), '']}>
        {data.map(r => <tr key={r.asset_id}><td><b>{r.tag}</b></td><td>{r.name}<div className="text-[10px]" style={{ color: 'var(--p-dim)' }}>{[r.manufacturer, r.model, r.serial].filter(Boolean).join(' · ')}</div></td><td>{typeTr(r.type)}</td>
          <td><Badge tone={toneFor(r.status)}>{statusTr(r.status)}</Badge></td><td>{r.live_status ? <Badge tone={toneFor(r.live_status)}>{statusTr(r.live_status)}</Badge> : <span style={{ color: 'var(--p-dim)' }}>-</span>}{r.active_alarms ? ` ⚠${r.active_alarms}` : ''}</td><td>{zoneTr(r.location)}</td>
          <td className="whitespace-nowrap"><Btn onClick={() => setForm({ ...EMPTY, ...r })} aria-label={`${tr('Edit', 'Düzenle')} ${r.tag}`}>{tr('Edit', 'Düzenle')}</Btn>{' '}
            {confirmDel === r.asset_id ? <Btn variant="danger" onClick={() => a.run(() => api(`/assets/${r.asset_id}`, { method: 'DELETE' }).then(() => { setConfirmDel(null); reload(); sum.reload(); }))}>{tr('Confirm delete', 'Silmeyi onayla')}</Btn> : <Btn variant="danger" onClick={() => setConfirmDel(r.asset_id)} aria-label={`${tr('Delete', 'Sil')} ${r.tag}`}>{tr('Delete', 'Sil')}</Btn>}</td></tr>)}
      </Table></Card>}
      <Msg m={a.msg} />
    </Page>
  );
};
