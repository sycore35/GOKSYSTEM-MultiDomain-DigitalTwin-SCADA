import React from 'react';
import { useTranslation } from '../i18n';

export const useTr = () => { const { lang } = useTranslation(); return (en: string, tr: string) => (lang === 'tr' ? tr : en); };

/** Sayfa başlığı kabukta (App.tsx .page-head) gösterilir; burada yalnızca eylem satırı ve içerik düzeni var. */
export const Page: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, actions, children }) => (
  <section aria-label={title} className="space-y-4 max-w-[1500px]">
    {actions && <div className="flex flex-wrap gap-2 justify-end">{actions}</div>}
    {children}
  </section>
);

export const Card: React.FC<{ title?: string; right?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, right, className = '', children }) => (
  <section className={`panel ${className}`}>
    {(title || right) && <div className="panel-h"><h2 style={{ font: 'inherit', margin: 0 }}>{title}</h2>{right}</div>}
    <div className="panel-b">{children}</div>
  </section>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; unit?: string; tone?: 'ok' | 'warn' | 'bad' | 'info' | 'dim'; hint?: string }> = ({ label, value, unit, tone = 'dim', hint }) => {
  const col = tone === 'dim' || tone === 'ok' ? 'var(--p-text)' : `var(--p-${tone})`;
  return (
    <div className="panel" style={{ padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{label}</div>
      <div className="font-value" style={{ color: col, fontSize: 22, lineHeight: 1.2, marginTop: 4, whiteSpace: 'nowrap' }}>{value}<span style={{ fontSize: 13, color: 'var(--p-dim)', marginLeft: 4 }}>{unit}</span></div>
      {hint && <div style={{ fontSize: 12, color: 'var(--p-dim)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
};

export const Badge: React.FC<{ tone?: 'ok' | 'warn' | 'bad' | 'info' | 'dim'; children: React.ReactNode }> = ({ tone = 'dim', children }) => (
  <span className="p-badge" style={{ color: tone === 'dim' ? 'var(--p-muted)' : `var(--p-${tone})` }}>{children}</span>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | '' }> = ({ variant = '', className = '', ...p }) => (
  <button type="button" {...p} className={`p-btn ${variant} ${className}`} />
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="p-lbl"><span>{label}</span>{children}</label>
);

export const State: React.FC<{ loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string }> = ({ loading, error, empty, emptyText }) => {
  const tr = useTr();
  if (error) return <div role="alert" className="panel p-3 text-[14px]" style={{ color: 'var(--p-bad)' }}>{tr('Error', 'Hata')}: {error}</div>;
  if (loading) return <div role="status" className="p-3 text-[14px]" style={{ color: 'var(--p-muted)' }}>{tr('Loading...', 'Yükleniyor...')}</div>;
  if (empty) return <div className="p-3 text-[14px]" style={{ color: 'var(--p-muted)' }}>{emptyText || tr('No data yet.', 'Henüz veri yok.')}</div>;
  return null;
};

export const Notice: React.FC<{ tone?: 'warn' | 'info'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <div className="panel text-[13px]" style={{ padding: '10px 14px', color: 'var(--p-muted)', borderLeft: `3px solid var(--p-${tone})` }}>{children}</div>
);

export const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto"><table className="p-tbl"><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);

export const PALETTE = ['#5BA8F5', '#E6A23C', '#4FD18B', '#E5736F', '#B48CF2', '#4FC9D6', '#D6C24F', '#F28CC2'];
export const toneFor = (state: string): 'ok' | 'warn' | 'bad' | 'info' | 'dim' =>
  ['FAULT', 'CRITICAL', 'UNACK_ALARM', 'MODEL_FAULT'].includes(state) ? 'bad' : ['WARNING', 'SERVICE_SOON', 'WATCH', 'RTN_UNACK', 'SHELVED', 'MAINTENANCE'].includes(state) ? 'warn' : ['ONLINE', 'RUNNING', 'GOOD', 'NORMAL', 'IN_SERVICE', 'ACK_ALARM'].includes(state) ? 'ok' : 'dim';

export interface Series { name: string; unit?: string; color?: string; dashed?: boolean; points: { t: number; v: number }[] }

/** Accessible multi-series SVG line chart. Line style (dashed) and legend text complement colour. */
export const LineChart: React.FC<{ series: Series[]; height?: number; yLabel?: string; xIsSeconds?: boolean; band?: [number, number]; title: string }> = ({ series, height = 200, yLabel, xIsSeconds, band, title }) => {
  const W = 800, H = height, L = 46, R = 10, T = 8, B = 20;
  const pts = series.flatMap(s => s.points);
  if (pts.length < 2) return <div className="text-xs font-mono p-3" style={{ color: 'var(--p-muted)' }}>…</div>;
  const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t));
  let y0 = Math.min(...pts.map(p => p.v)), y1 = Math.max(...pts.map(p => p.v));
  if (band) { y0 = Math.min(y0, band[0]); y1 = Math.max(y1, band[1]); }
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (t: number) => L + ((t - t0) / Math.max(1e-9, t1 - t0)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => y0 + f * (y1 - y0));
  const span = (t1 - t0) / (xIsSeconds ? 1 : 1000);
  return (
    <div>
      <svg role="img" aria-label={`${title}: ${series.map(s => s.name).join(', ')}`} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {ticks.map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--p-border)" strokeWidth="1" /><text x={L - 4} y={Y(v) + 3} textAnchor="end" fontSize="15" fill="var(--p-dim)" fontFamily="monospace">{fmt(v)}</text></g>)}
        {band && <rect x={L} width={W - L - R} y={Y(band[1])} height={Math.max(0, Y(band[0]) - Y(band[1]))} fill="var(--p-ok)" opacity="0.08" />}
        {series.map((s, i) => s.points.length > 1 && (
          <polyline key={s.name} fill="none" stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth="1.8" strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round"
            points={s.points.map(p => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')} />
        ))}
        <text x={L} y={H - 5} fontSize="15" fill="var(--p-dim)" fontFamily="monospace">{`-${span.toFixed(0)}s`}</text>
        <text x={W - R} y={H - 5} textAnchor="end" fontSize="15" fill="var(--p-dim)" fontFamily="monospace">{xIsSeconds ? `${t1.toFixed(0)} s` : 'now'}</text>
        {yLabel && <text x={L + 4} y={T + 9} fontSize="15" fill="var(--p-dim)" fontFamily="monospace">{yLabel}</text>}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono mt-1" style={{ color: 'var(--p-muted)' }}>
        {series.map((s, i) => <li key={s.name} className="flex items-center gap-1.5"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} /></svg>{s.name}{s.unit ? ` (${s.unit})` : ''}</li>)}
      </ul>
    </div>
  );
};
