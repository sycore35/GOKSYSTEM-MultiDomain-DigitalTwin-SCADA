import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LanguageProvider } from './i18n';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { EnterpriseOverview } from './components/EnterpriseOverview';
import { DomainView } from './components/DomainView';
import { HistorianView } from './components/HistorianView';
import { AlarmPanel } from './components/AlarmPanel';
import { EventAuditView } from './components/EventAuditView';
import { DigitalTwin3D } from './components/DigitalTwin3D';
import { EquipmentDrawer } from './components/EquipmentDrawer';
import { DeviceRuntimeState, AlarmRecord, SystemSummary } from './types';
import { api, initTheme } from './platform/api';
import { PerfView, AlarmCenter, AssetsView } from './platform/views1';
import { TrendAnalyzer, PidStudio, ScenariosView } from './platform/views2';
import { MaintenanceView, EnergyView, PlcView } from './platform/views3';
import { OperatorsView, ProtocolView } from './platform/views4';
import { PAGE_BY_ID } from './pages';
import { deviceName } from './platform/meta';

initTheme();

const MainApp: React.FC = () => {
  const [currentTab, setTabState] = useState<string>(() => { const h = window.location.hash.replace(/^#\/?/, ''); return PAGE_BY_ID[h] ? h : 'overview'; });
  const [menuOpen, setMenuOpen] = useState(false);
  const setCurrentTab = useCallback((tab: string) => { setTabState(tab); if (window.location.hash !== `#/${tab}`) window.location.hash = `/${tab}`; }, []);
  useEffect(() => {
    const h = () => { const k = window.location.hash.replace(/^#\/?/, ''); if (PAGE_BY_ID[k]) setTabState(k); };
    window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h);
  }, []);
  const [devices, setDevices] = useState<Record<string, DeviceRuntimeState>>({});
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warn' | 'error' | 'success' } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const showToast = (message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Initial and fallback polling fetcher
  const refreshData = useCallback(async () => {
    try {
      const [statesRes, alarmsRes, sumRes] = await Promise.allSettled([
        fetch('/api/v1/states'),
        fetch('/api/v1/alarms'),
        fetch('/api/v1/summary')
      ]);

      if (statesRes.status === 'fulfilled' && statesRes.value.ok) {
        const rawStates = await statesRes.value.json();
        const dict: Record<string, DeviceRuntimeState> = {};
        if (Array.isArray(rawStates)) {
          rawStates.forEach((s: DeviceRuntimeState) => {
            if (s.device_id) dict[s.device_id] = s;
          });
        } else if (rawStates && typeof rawStates === 'object') {
          Object.assign(dict, rawStates);
        }
        setDevices(dict);
      }

      if (alarmsRes.status === 'fulfilled' && alarmsRes.value.ok) {
        const rawAlarms = await alarmsRes.value.json();
        if (Array.isArray(rawAlarms)) {
          setAlarms(rawAlarms);
        }
      }

      if (sumRes.status === 'fulfilled' && sumRes.value.ok) {
        const rawSum = await sumRes.value.json();
        setSummary(rawSum);
      }
    } catch (err) {
      console.warn('Data sync warning:', err);
    }
  }, []);

  // WebSocket Live Stream
  useEffect(() => {
    let reconnectTimer: any = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.devices) {
            setDevices(prev => ({ ...prev, ...payload.devices }));
          }
          if (payload.alarms && Array.isArray(payload.alarms)) {
            setAlarms(payload.alarms);
          }
          if (payload.summary) {
            setSummary(payload.summary);
          }
        } catch (e) {
          console.error('WS Parse Error', e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setConnected(false);
        ws.close();
      };
    };

    connect();
    refreshData();
    const interval = setInterval(refreshData, 5000);

    return () => {
      clearInterval(interval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [refreshData]);

  // Operational Dispatch Handlers (match the FastAPI contracts: CommandRequest body, query params for fault/ack/control)
  const handleCommand = async (deviceId: string, op: string, params: any = {}) => {
    try {
      await api('/commands', { body: { command_id: `ui-${Date.now()}`, target_device: deviceId, operation: op, parameters: params, operator_id: 'operator_ui', user_role: 'OPERATOR' } })
        .then((r: any) => showToast(r.success ? `${deviceName(deviceId)}: ${op} komutu uygulandı` : `Reddedildi: ${r.message}`, r.success ? 'success' : 'warn'));
      refreshData();
    } catch (e: any) {
      showToast(`Komut başarısız: ${e.message}`, 'error');
    }
  };

  const handleInjectFault = async (deviceId: string, fault: string, params: any = {}) => {
    try {
      await api(`/simulation/fault?target_device=${encodeURIComponent(deviceId)}&fault_type=${encodeURIComponent(fault)}`, { body: params });
      showToast(`${deviceName(deviceId)} için arıza enjekte edildi: ${fault}`, 'warn');
      refreshData();
    } catch (e: any) {
      showToast(`Arıza enjeksiyonu başarısız: ${e.message}`, 'error');
    }
  };

  const handleAcknowledge = async (alarmId: string) => {
    try {
      await api(`/alarms/${alarmId}/ack`, { method: 'POST' });
      showToast(`Alarm onaylandı: ${alarmId}`, 'success');
      refreshData();
    } catch (e: any) {
      showToast(`Alarm onaylanamadı: ${e.message}`, 'error');
    }
  };

  const handleSimulationControl = async (action: 'start' | 'pause' | 'resume' | 'reset', speed?: number) => {
    try {
      await api(`/simulation/control?action=${action}${speed !== undefined ? `&speed=${speed}` : ''}`, { method: 'POST' });
      showToast(`Simülasyon: ${({ start: 'başlatıldı', pause: 'duraklatıldı', resume: 'devam ediyor', reset: 'sıfırlandı' } as any)[action]}${speed ? ` (${speed}×)` : ''}`, 'info');
      refreshData();
    } catch (e: any) {
      showToast(`Simülasyon denetim hatası: ${e.message}`, 'error');
    }
  };

  const [analyzerSeries, setAnalyzerSeries] = useState<string[]>([]);
  const handleOpenTrends = (deviceId: string, pointId?: string) => {
    setSelectedDeviceId(deviceId);
    if (pointId) { setSelectedPointId(pointId); setAnalyzerSeries([`${deviceId}:${pointId}`]); }
    setCurrentTab(pointId ? 'analyzer' : 'historian');
  };

  const unackAlarmsCount = alarms.filter(a => a.state === 'UNACK_ALARM' || a.state === 'RTN_UNACK').length;

  const page = PAGE_BY_ID[currentTab];
  const fullBleed = currentTab === 'twin';
  const onSelect = (id: string) => setSelectedDeviceId(id);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: 'var(--p-bg)', color: 'var(--p-text)' }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2" style={{ background: 'var(--p-raised)' }}>İçeriğe geç</a>
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} summary={summary} connected={connected} alarms={alarms}
        onMenu={() => setMenuOpen(true)} onSimulationControl={handleSimulationControl} />

      {toast && (
        <div role="status" className="fixed top-28 right-4 z-[60] flex items-center gap-2.5 px-4 py-2.5 rounded text-[14px] max-w-[calc(100vw-32px)]"
          style={{ background: 'var(--p-raised)', border: `1px solid ${toast.type === 'error' ? 'var(--p-bad)' : toast.type === 'warn' ? 'var(--p-warn)' : 'var(--p-border-strong)'}`, color: 'var(--p-text)' }}>
          <span className="dot" data-tone={toast.type === 'error' ? 'bad' : toast.type === 'warn' ? 'warn' : 'info'} />
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} unackAlarmsCount={unackAlarmsCount} open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main id="main" className={`flex-1 min-w-0 ${fullBleed ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'} p-3 md:p-6`}>
          <div className={fullBleed ? 'shrink-0' : ''}>
            <div className="page-head" style={fullBleed ? { marginBottom: 12 } : undefined}>
              <div>
                <h1>{page?.title}</h1>
                <p>{page?.desc}</p>
              </div>
            </div>
          </div>

          {currentTab === 'overview' && (
            <EnterpriseOverview summary={summary} devices={devices} alarms={alarms} selectedDeviceId={selectedDeviceId} onSelectDevice={onSelect} onNavigateTab={(tab) => setCurrentTab(tab)} />
          )}

          {currentTab === 'twin' && (
            <div className="flex-1 min-h-[460px]">
              <DigitalTwin3D devices={devices} alarms={alarms} onSelectDevice={onSelect} selectedDeviceId={selectedDeviceId} onOpenTrends={handleOpenTrends} fill />
            </div>
          )}

          {currentTab === 'factory' && <DomainView domain="factory" devices={devices} alarms={alarms} onCommand={handleCommand} onInjectFault={handleInjectFault} />}
          {currentTab === 'grid' && <DomainView domain="grid" devices={devices} alarms={alarms} onCommand={handleCommand} onInjectFault={handleInjectFault} />}
          {currentTab === 'process' && <DomainView domain="process" devices={devices} alarms={alarms} onCommand={handleCommand} onInjectFault={handleInjectFault} />}
          {currentTab === 'building' && <DomainView domain="building" devices={devices} alarms={alarms} onCommand={handleCommand} onInjectFault={handleInjectFault} />}
          {currentTab === 'historian' && <HistorianView devices={devices} initialDeviceId={selectedDeviceId} initialPointId={selectedPointId} />}

          {currentTab === 'alarms' && <AlarmCenter />}
          {currentTab === 'perf' && <PerfView />}
          {currentTab === 'assets' && <AssetsView />}
          {currentTab === 'analyzer' && <TrendAnalyzer initial={analyzerSeries} />}
          {currentTab === 'pid' && <PidStudio />}
          {currentTab === 'scenarios' && <ScenariosView />}
          {currentTab === 'maintenance' && <MaintenanceView />}
          {currentTab === 'energy' && <EnergyView />}
          {currentTab === 'plc' && <PlcView />}
          {currentTab === 'operators' && <OperatorsView />}
          {currentTab === 'protocol' && <ProtocolView />}
          {currentTab === 'audit' && <EventAuditView />}
        </main>
      </div>

      {currentTab !== 'twin' && currentTab !== 'overview' && (
        <EquipmentDrawer deviceId={selectedDeviceId} devices={devices} alarms={alarms} onClose={() => setSelectedDeviceId(null)}
          onCommand={handleCommand} onInjectFault={handleInjectFault} onOpenTrends={handleOpenTrends} />
      )}

      <footer className="hidden md:flex h-8 px-4 items-center justify-between text-[12px] select-none shrink-0"
        style={{ borderTop: '1px solid var(--p-border)', background: 'var(--p-surface)', color: 'var(--p-muted)' }}>
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2"><span className="dot" data-tone={connected ? 'ok' : 'bad'} />GÖKSYSTEM 3.0</span>
          <span>Ağ geçidi <span className="font-value">{window.location.host}</span></span>
          <span>Veri tabanı <span className="font-value">SQLite WAL</span></span>
        </div>
        <div className="flex items-center gap-5">
          <span>İzlenen cihaz <span className="font-value">{Object.keys(devices).length}</span></span>
          <span>Onaysız alarm <span className="font-value" style={{ color: unackAlarmsCount ? 'var(--p-bad)' : undefined }}>{unackAlarmsCount}</span></span>
          <span>Sim. tick <span className="font-value">{(summary?.sim_time ?? 0).toFixed(1)} sn</span></span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <MainApp />
    </LanguageProvider>
  );
};

export default App;