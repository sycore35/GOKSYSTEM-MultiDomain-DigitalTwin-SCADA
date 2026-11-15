import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { DeviceRuntimeState } from '../types';
import { Panel } from '../platform/kit';
import { LineChart } from '../platform/ui';
import { DEVICE_META, fmtNum, unitTr } from '../platform/meta';
import { POINT_TR } from '../platform/InspectorPanel';

interface Props { devices: Record<string, DeviceRuntimeState>; initialDeviceId?: string | null; initialPointId?: string | null }
interface TrendPoint { sim_time: number; value: number; unit?: string; quality?: string }

const RANGES: [string, string, number][] = [['5 dk', '5m', 60], ['15 dk', '15m', 150], ['1 saat', '1h', 300], ['6 saat', '6h', 600], ['24 saat', '24h', 1200]];

export const HistorianView: React.FC<Props> = ({ devices, initialDeviceId, initialPointId }) => {
  const ids = Object.keys(DEVICE_META);
  const [dev, setDev] = useState<string>(initialDeviceId && DEVICE_META[initialDeviceId] ? initialDeviceId : ids[0]);
  const points = Object.keys(devices[dev]?.telemetry || {});
  const [pt, setPt] = useState<string>(initialPointId || DEVICE_META[dev]?.key || '');
  const [range, setRange] = useState(1);
  const [rows, setRows] = useState<TrendPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (points.length && !points.includes(pt)) setPt(DEVICE_META[dev]?.key && points.includes(DEVICE_META[dev].key) ? DEVICE_META[dev].key : points[0]); }, [dev, points.length]);
  const load = async () => {
    if (!dev || !pt) return; setBusy(true);
    try {
      const r = await fetch(`/api/v1/historian/trends?device_id=${encodeURIComponent(dev)}&point_id=${encodeURIComponent(pt)}&limit=${RANGES[range][2]}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json()); setErr('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [dev, pt, range]);

  const vals = rows.map(r => r.value);
  const unit = unitTr(rows[0]?.unit);
  const stat = vals.length ? { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length, last: vals[vals.length - 1] } : null;
  const name = `${DEVICE_META[dev]?.name} · ${POINT_TR[pt] || pt}`;

  return (
    <div className="space-y-4">
      <Panel title="Seçim" right={
        <a className="p-btn" href={`/api/v1/historian/export/csv?device_id=${encodeURIComponent(dev)}&point_id=${encodeURIComponent(pt)}`} download><Download size={15} />CSV olarak indir</a>}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="p-lbl"><span>Ekipman</span>
            <select className="p-in" value={dev} onChange={e => setDev(e.target.value)}>{ids.map(i => <option key={i} value={i}>{DEVICE_META[i].name}</option>)}</select></label>
          <label className="p-lbl"><span>Ölçüm noktası</span>
            <select className="p-in" value={pt} onChange={e => setPt(e.target.value)}>{points.map(p => <option key={p} value={p}>{POINT_TR[p] || p}</option>)}</select></label>
          <div className="g3-seg" role="group" aria-label="Zaman aralığı">
            {RANGES.map(([l], i) => <button key={l} aria-pressed={range === i} onClick={() => setRange(i)}>{l}</button>)}
          </div>
          <button className="p-btn" onClick={load} aria-label="Yenile"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Yenile</button>
        </div>
      </Panel>

      <div className="kpi-strip">
        {[['Son değer', stat?.last], ['Ortalama', stat?.avg], ['En düşük', stat?.min], ['En yüksek', stat?.max]].map(([l, v]) => (
          <div className="kpi" key={l as string}><div className="kpi-l">{l as string}</div><div className="kpi-v">{fmtNum(v as number | undefined, 2)}{unit && <small>{unit}</small>}</div></div>
        ))}
        <div className="kpi"><div className="kpi-l">Örnek sayısı</div><div className="kpi-v">{rows.length}</div></div>
      </div>

      <Panel title={name}>
        {err ? <p role="alert" style={{ color: 'var(--p-bad)' }}>Veri alınamadı: {err}</p>
          : rows.length < 2 ? <p style={{ color: 'var(--p-muted)' }}>Bu nokta için henüz yeterli kayıt yok. Simülasyon çalıştıkça dolar.</p>
            : <LineChart title={name} height={300} xIsSeconds yLabel={unit} series={[{ name, unit, color: 'var(--p-accent)', points: rows.map(r => ({ t: r.sim_time, v: r.value })) }]} />}
      </Panel>
    </div>
  );
};
