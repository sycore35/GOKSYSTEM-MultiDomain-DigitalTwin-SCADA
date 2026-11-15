import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { Tone } from './meta';

/** KPI şeridi: tek satırda birleşik hücreler. Renk yalnızca anormal durumda (warn/bad). */
export const KpiStrip: React.FC<{ items: { label: string; value: React.ReactNode; unit?: string; hint?: string; tone?: Tone }[] }> = ({ items }) => (
  <div className="kpi-strip" role="list">
    {items.map(k => (
      <div key={k.label} className="kpi" role="listitem" data-tone={k.tone && k.tone !== 'ok' && k.tone !== 'dim' ? k.tone : undefined}>
        <div className="kpi-l">{k.label}</div>
        <div className="kpi-v">{k.value}{k.unit && <small>{k.unit}</small>}</div>
        {k.hint && <div className="kpi-h">{k.hint}</div>}
      </div>
    ))}
  </div>
);

export const Panel: React.FC<{ title?: React.ReactNode; right?: React.ReactNode; className?: string; bodyClass?: string; flush?: boolean; children: React.ReactNode }> =
  ({ title, right, className = '', bodyClass = '', flush, children }) => (
    <section className={`panel ${className}`}>
      {(title || right) && <div className="panel-h"><h2 style={{ font: 'inherit', margin: 0 }}>{title}</h2>{right}</div>}
      <div className={flush ? bodyClass : `panel-b ${bodyClass}`}>{children}</div>
    </section>
  );

export const LinkBtn: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: 'var(--p-accent)' }}>
    {children}<ArrowRight size={14} />
  </button>
);

export const KV: React.FC<{ label: string; value: React.ReactNode; unit?: string; tone?: Tone }> = ({ label, value, unit, tone }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5" style={{ borderBottom: '1px solid var(--p-border)' }}>
    <span style={{ color: 'var(--p-muted)', fontSize: 14 }}>{label}</span>
    <span className="font-value" style={{ color: tone === 'bad' ? 'var(--p-bad)' : tone === 'warn' ? 'var(--p-warn)' : 'var(--p-text)', fontSize: 15 }}>
      {value}{unit && <span style={{ color: 'var(--p-dim)', fontSize: 12, marginLeft: 4 }}>{unit}</span>}
    </span>
  </div>
);
