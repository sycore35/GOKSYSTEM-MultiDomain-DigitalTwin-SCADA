import React from 'react';
import { useTranslation } from '../i18n';
import { 
  X, Activity, AlertTriangle, ShieldAlert, Cpu, 
  ExternalLink, Play, Square, RefreshCw, Zap
} from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';

interface EquipmentDrawerProps {
  deviceId: string | null;
  devices: Record<string, DeviceRuntimeState>;
  alarms: AlarmRecord[];
  onClose: () => void;
  onCommand: (device: string, op: string, params?: any) => void;
  onInjectFault: (device: string, fault: string, params?: any) => void;
  onOpenTrends: (deviceId: string, pointId?: string) => void;
}

export const EquipmentDrawer: React.FC<EquipmentDrawerProps> = ({
  deviceId,
  devices,
  alarms,
  onClose,
  onCommand,
  onInjectFault,
  onOpenTrends
}) => {
  const { t } = useTranslation();
  if (!deviceId) return null;
  const dev = devices[deviceId];
  if (!dev) return null;

  const deviceAlarms = alarms.filter(a => a.source_device === deviceId);
  const telePoints = Object.values(dev.telemetry || {});

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
      case 'ENERGIZED':
      case 'ACTIVE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">RUNNING</span>;
      case 'WARNING':
      case 'HIGH_LOAD':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-950 text-amber-400 border border-amber-800/50">WARNING</span>;
      case 'FAULT':
      case 'TRIPPED':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-950 text-rose-400 border border-rose-800/50">FAULT / TRIPPED</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-800 text-slate-300 border border-slate-700">STANDBY</span>;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#17191B] border-l border-[#373C40] shadow-2xl z-50 flex flex-col transform transition-transform duration-200">
      {/* Drawer Header */}
      <div className="p-4 bg-[#202326] border-b border-[#373C40] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={18} className="text-[#E6A23C]" />
          <div>
            <h2 className="text-sm font-bold text-slate-100 tracking-wide font-mono-num">{dev.device_id}</h2>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">{dev.domain} DOMAIN</div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
        >
          <X size={18} />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="p-4 flex-1 overflow-y-auto space-y-5">
        {/* State Banner */}
        <div className="scada-panel p-3 rounded flex items-center justify-between">
          <span className="text-xs text-slate-400">OPERATIONAL STATE:</span>
          {getStatusBadge(dev.status)}
        </div>

        {/* Interlock & Security */}
        {dev.interlocks_engaged && (
          <div className="p-2.5 rounded bg-amber-950/40 border border-amber-800/60 flex items-center gap-2 text-xs text-amber-300">
            <ShieldAlert size={16} className="text-amber-400 shrink-0" />
            <span>Hardware safety interlock engaged on this equipment.</span>
          </div>
        )}

        {/* Live Telemetry Measurements */}
        <div>
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Activity size={14} className="text-[#E6A23C]" /> {t('telemetry')}
          </div>
          <div className="space-y-1.5">
            {telePoints.length === 0 ? (
              <div className="text-xs text-slate-500 italic p-3 text-center border border-dashed border-[#373C40] rounded">
                No active telemetry tags reported
              </div>
            ) : (
              telePoints.map(pt => (
                <div 
                  key={pt.point_id}
                  onClick={() => onOpenTrends(dev.device_id, pt.point_id)}
                  className="scada-panel p-2.5 rounded hover:border-[#E6A23C]/40 cursor-pointer transition flex items-center justify-between group"
                >
                  <div>
                    <div className="text-xs text-slate-300 font-mono-num">{pt.point_id}</div>
                    <div className="text-[10px] text-slate-500">Quality: {pt.quality}</div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-100 font-mono-num">
                      {typeof pt.value === 'number' ? (Number.isInteger(pt.value) ? pt.value : pt.value.toFixed(2)) : pt.value}
                    </span>
                    <span className="text-xs text-slate-400">{pt.unit}</span>
                    <ExternalLink size={12} className="text-slate-600 group-hover:text-[#E6A23C] opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Associated Alarms */}
        {deviceAlarms.length > 0 && (
          <div>
            <div className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Active Alarms ({deviceAlarms.length})
            </div>
            <div className="space-y-1.5">
              {deviceAlarms.map(a => (
                <div key={a.alarm_id} className="p-2.5 rounded bg-rose-950/30 border border-rose-900/60 text-xs">
                  <div className="flex justify-between font-semibold text-rose-300">
                    <span>{a.tag_id}</span>
                    <span className="text-[10px] bg-rose-900/80 px-1.5 py-0.2 rounded text-white">{a.severity}</span>
                  </div>
                  <p className="text-slate-300 mt-1">{a.message}</p>
                  <div className="text-[10px] text-slate-400 mt-1 font-mono-num">
                    Val: {a.current_value.toFixed(2)} | Limit: {a.setpoint_or_limit.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operational Commands */}
        <div>
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap size={14} className="text-amber-400" /> {t('actions')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onCommand(dev.device_id, 'START')}
              className="px-3 py-2 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-700/50 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Play size={12} /> START / RUN
            </button>
            <button
              onClick={() => onCommand(dev.device_id, 'STOP')}
              className="px-3 py-2 bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 border border-rose-700/50 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Square size={12} /> STOP / TRIP
            </button>
          </div>
          <div className="mt-2">
            <button
              onClick={() => onInjectFault(dev.device_id, 'SENSOR_DRIFT', { magnitude: 15.0 })}
              className="w-full px-3 py-2 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-800/50 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> INJECT TEST ANOMALY (+15 Drift)
            </button>
          </div>
        </div>
      </div>

      {/* Drawer Footer */}
      <div className="p-3 bg-[#202326] border-t border-[#373C40] flex justify-between items-center text-xs text-slate-400">
        <span className="font-mono-num">Sim Time: {dev.last_update_sim_time.toFixed(1)}s</span>
        <button
          onClick={() => onOpenTrends(dev.device_id)}
          className="text-[#E6A23C] hover:underline flex items-center gap-1 font-semibold"
        >
          View Full Trends <ExternalLink size={12} />
        </button>
      </div>
    </div>
  );
};