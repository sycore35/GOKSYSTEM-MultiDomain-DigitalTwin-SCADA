import React from 'react';
import { Play, Pause, RotateCcw, Menu, Wifi, WifiOff, Hexagon, BellRing, ShieldCheck } from 'lucide-react';
import { SystemSummary, AlarmRecord } from '../types';
import { PAGE_BY_ID } from '../pages';
import { deviceName } from '../platform/meta';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  summary: SystemSummary | null;
  connected: boolean;
  alarms: AlarmRecord[];
  onMenu: () => void;
  onSimulationControl: (action: 'start' | 'pause' | 'resume' | 'reset', speed?: number) => void;
}

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
};

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, summary, connected, alarms, onMenu, onSimulationControl }) => {
  const isRunning = summary?.running ?? false;
  const page = PAGE_BY_ID[currentTab];
  const active = alarms.filter(a => a.state !== 'NORMAL' && a.state !== 'SHELVED');
  const unack = active.filter(a => a.state === 'UNACK_ALARM' || a.state === 'RTN_UNACK');
  const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
  const top = [...active].sort((a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0))[0];
  const critical = active.some(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');

  return (
    <header className="shrink-0 z-30 select-none" style={{ background: 'var(--p-surface)', borderBottom: '1px solid var(--p-border)' }}>
      <div className="h-14 flex items-center gap-3 px-3 md:px-4">
        <button className="icon-btn md:hidden" onClick={onMenu} aria-label="Menüyü aç"><Menu size={18} /></button>
        <div className="flex items-center gap-2.5 shrink-0">
          <Hexagon size={22} strokeWidth={1.75} style={{ color: 'var(--p-accent)' }} aria-hidden="true" />
          <div className="leading-tight">
            <div className="font-semibold text-[15px] tracking-tight">GÖKSYSTEM <span className="font-value" style={{ color: 'var(--p-dim)', fontWeight: 400 }}>3.0</span></div>
            <div className="hidden sm:block" style={{ fontSize: 12, color: 'var(--p-dim)' }}>Endüstriyel dijital ikiz</div>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2 ml-3 pl-4 text-[14px]" style={{ borderLeft: '1px solid var(--p-border)', color: 'var(--p-muted)' }}>
          <span>Çalışma alanı</span><span style={{ color: 'var(--p-dim)' }}>/</span>
          <span style={{ color: 'var(--p-text)', fontWeight: 600 }}>{page?.title}</span>
        </div>

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2">
          <div className="chip" title="Simülasyon durumu ve süresi">
            <span className={`dot ${isRunning ? '' : ''}`} data-tone={isRunning ? 'ok' : 'warn'} />
            <span>{isRunning ? 'Simülasyon çalışıyor' : 'Simülasyon duraklatıldı'}</span>
            <span className="font-value" style={{ color: 'var(--p-muted)' }}>{fmtClock(summary?.sim_time ?? 0)}</span>
            {summary && <span className="font-value" style={{ color: 'var(--p-dim)' }}>{summary.speed_factor}×</span>}
          </div>
          <button className="icon-btn" onClick={() => onSimulationControl(isRunning ? 'pause' : 'resume')} aria-label={isRunning ? 'Duraklat' : 'Devam et'} title={isRunning ? 'Duraklat' : 'Devam et'}>
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="icon-btn" onClick={() => onSimulationControl('reset')} aria-label="Simülasyonu sıfırla" title="Sıfırla"><RotateCcw size={16} /></button>
        </div>

        <button className="chip" onClick={() => setCurrentTab('alarms')} title="Alarm yönetimine git"
          style={{ borderColor: unack.length ? 'var(--p-bad)' : undefined, background: unack.length ? 'var(--p-bad-bg)' : undefined }}>
          <BellRing size={15} style={{ color: unack.length ? 'var(--p-bad)' : 'var(--p-dim)' }} />
          <span className="font-value" style={{ color: unack.length ? 'var(--p-bad)' : 'var(--p-text)', fontWeight: 600 }}>{active.length}</span>
          <span className="hidden sm:inline">aktif alarm</span>
        </button>
        <div className="chip hidden sm:inline-flex" title="Sunucu bağlantısı">
          {connected ? <Wifi size={15} style={{ color: 'var(--p-dim)' }} /> : <WifiOff size={15} style={{ color: 'var(--p-bad)' }} />}
          <span style={{ color: connected ? 'var(--p-text)' : 'var(--p-bad)' }}>{connected ? 'Bağlı' : 'Bağlantı yok'}</span>
        </div>
      </div>

      {/* Alarm bandı: her zaman görünür */}
      <div role="status" aria-live="polite" className="h-9 px-3 md:px-4 flex items-center gap-3 text-[13px]"
        style={{ borderTop: '1px solid var(--p-border)', background: active.length ? (critical ? 'var(--p-bad-bg)' : 'var(--p-warn-bg)') : 'var(--p-sunken)' }}>
        {active.length === 0 ? (
          <><ShieldCheck size={15} style={{ color: 'var(--p-dim)' }} /><span style={{ color: 'var(--p-muted)' }}>Aktif alarm yok. Tüm ölçümler normal sınırlarda.</span></>
        ) : (
          <>
            <span className={`dot ${unack.length ? 'blink' : ''}`} data-tone={critical ? 'bad' : 'warn'} />
            <span className="font-semibold" style={{ color: critical ? 'var(--p-bad)' : 'var(--p-warn)' }}>{critical ? 'Alarm' : 'Uyarı'}</span>
            <span className="truncate" style={{ color: 'var(--p-text)' }}>{top ? `${deviceName(top.source_device)} — ${top.message}` : ''}</span>
            {active.length > 1 && <span className="font-value shrink-0" style={{ color: 'var(--p-muted)' }}>+{active.length - 1}</span>}
          </>
        )}
      </div>
    </header>
  );
};
