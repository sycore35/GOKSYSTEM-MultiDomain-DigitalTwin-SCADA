import React from 'react';
import { Sun, Moon, X } from 'lucide-react';
import { applyTheme, useTheme } from '../platform/api';
import { LoginBox } from '../platform/views4';
import { PAGES } from '../pages';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  unackAlarmsCount: number;
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, unackAlarmsCount, open, onClose }) => {
  const theme = useTheme();
  const item = (p: typeof PAGES[number]) => {
    const Icon = p.icon;
    return (
      <button key={p.id} className="nav-item" onClick={() => { setCurrentTab(p.id); onClose(); }} aria-current={currentTab === p.id ? 'page' : undefined}>
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="flex-1 truncate">{p.label}</span>
        {p.id === 'alarms' && unackAlarmsCount > 0 && (
          <span className="font-value text-[12px] px-1.5 rounded-sm" style={{ background: 'var(--p-bad)', color: '#fff', fontWeight: 600 }}>{unackAlarmsCount}</span>
        )}
      </button>
    );
  };
  return (
    <>
      {open && <div className="fixed inset-0 z-40 md:hidden" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} aria-hidden="true" />}
      <aside aria-label="Gezinme" className={`fixed md:static z-50 inset-y-0 left-0 w-[260px] md:w-[232px] shrink-0 flex flex-col transition-transform duration-200 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--p-surface)', borderRight: '1px solid var(--p-border)' }}>
        <div className="md:hidden flex items-center justify-between h-12 px-3" style={{ borderBottom: '1px solid var(--p-border)' }}>
          <span className="font-semibold">Menü</span>
          <button className="icon-btn" onClick={onClose} aria-label="Menüyü kapat"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          <div className="nav-group" style={{ paddingTop: 12 }}>Operasyon</div>
          {PAGES.filter(p => p.group === 'ops').map(item)}
          <div className="nav-group">Platform</div>
          {PAGES.filter(p => p.group === 'platform').map(item)}
        </nav>
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--p-border)' }}>
          <LoginBox />
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--p-dim)', fontSize: 12 }}>Sürüm 3.0.5</span>
            <button className="icon-btn" onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'} title={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
