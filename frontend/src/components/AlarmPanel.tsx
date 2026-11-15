import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import { 
  Bell, AlertTriangle, ShieldAlert, CheckCircle2, 
  Search, Filter, Check, Clock, Cpu
} from 'lucide-react';
import { AlarmRecord } from '../types';

interface AlarmPanelProps {
  alarms: AlarmRecord[];
  onAcknowledge: (alarmId: string) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const AlarmPanel: React.FC<AlarmPanelProps> = ({
  alarms,
  onAcknowledge,
  onSelectDevice
}) => {
  const { t } = useTranslation();
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const filteredAlarms = alarms.filter(a => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    if (stateFilter !== 'ALL' && a.state !== stateFilter) return false;
    if (search && !a.source_device.toLowerCase().includes(search.toLowerCase()) && !a.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-950 text-rose-300 border border-rose-800">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-orange-950 text-orange-300 border border-orange-800">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-950 text-amber-300 border border-amber-800">MEDIUM</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-950 text-cyan-300 border border-cyan-800">LOW</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-900 text-slate-300 border border-slate-700">INFO</span>;
    }
  };

  const getStateBadge = (st: string) => {
    switch (st) {
      case 'UNACK_ALARM':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-600 text-white animate-pulse">UNACKNOWLEDGED</span>;
      case 'ACK_ALARM':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-950 text-amber-300 border border-amber-800">ACKNOWLEDGED</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-800">NORMAL / CLEARED</span>;
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 bg-tech-grid">
      {/* Alarm Header */}
      <div className="scada-panel p-4 rounded-lg flex items-center justify-between border-l-4 border-l-rose-500">
        <div>
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-rose-500" />
            <h1 className="text-base font-bold text-slate-100 tracking-wide">
              OPERATIONAL ALARM & EVENT MANAGEMENT CENTER
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            ISA-18.2 compliant state machine tracking alarm lifecycles: Unacknowledged, Acknowledged, Return-to-Normal, and Shelved.
          </p>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center gap-4 text-xs font-mono-num">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Active Alarms</span>
            <div className="text-xl font-bold text-rose-400">
              {alarms.filter(a => a.state === 'UNACK_ALARM' || a.state === 'ACK_ALARM').length}
            </div>
          </div>
          <div className="text-right border-l border-[#373C40] pl-3">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Unacknowledged</span>
            <div className="text-xl font-bold text-amber-400">
              {alarms.filter(a => a.state === 'UNACK_ALARM').length}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Ribbon */}
      <div className="scada-panel p-3 rounded-lg flex items-center justify-between flex-wrap gap-3">
        {/* Severity Filters */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-semibold mr-1">{t('severity')}:</span>
          {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded font-semibold transition ${
                severityFilter === sev 
                  ? 'bg-[#272B2E] text-[#E6A23C] border border-[#4A5056]' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search tag or equipment..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#202326] border border-[#4A5056] rounded pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-[#E6A23C] w-56 font-mono-num"
          />
        </div>
      </div>

      {/* Alarms Data Table */}
      <div className="scada-panel rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#202326] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#373C40]">
            <tr>
              <th className="p-3">Severity</th>
              <th className="p-3">Tag / Equipment</th>
              <th className="p-3">Domain</th>
              <th className="p-3">Alarm Message</th>
              <th className="p-3">Current / Limit</th>
              <th className="p-3">Time</th>
              <th className="p-3">State</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#373C40]">
            {filteredAlarms.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                  No alarms match the current filtering criteria.
                </td>
              </tr>
            ) : (
              filteredAlarms.map(a => (
                <tr key={a.alarm_id} className="hover:bg-[#202326]/60 transition">
                  <td className="p-3">{getSeverityBadge(a.severity)}</td>
                  <td className="p-3">
                    <button
                      onClick={() => onSelectDevice(a.source_device)}
                      className="font-mono-num font-bold text-slate-200 hover:text-[#E6A23C] transition flex items-center gap-1"
                    >
                      <Cpu size={12} className="text-[#E6A23C]" />
                      {a.source_device} : {a.tag_id}
                    </button>
                  </td>
                  <td className="p-3 text-slate-400 uppercase text-[11px]">{a.domain}</td>
                  <td className="p-3 text-slate-300 font-medium">{a.message}</td>
                  <td className="p-3 font-mono-num text-slate-300">
                    <span className="text-amber-400 font-bold">{a.current_value.toFixed(2)}</span>
                    <span className="text-slate-500"> / {a.setpoint_or_limit.toFixed(2)}</span>
                  </td>
                  <td className="p-3 font-mono-num text-slate-400">{a.trigger_sim_time.toFixed(1)}s</td>
                  <td className="p-3">{getStateBadge(a.state)}</td>
                  <td className="p-3 text-right">
                    {a.state === 'UNACK_ALARM' ? (
                      <button
                        onClick={() => onAcknowledge(a.alarm_id)}
                        className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded font-semibold text-[11px] flex items-center gap-1 ml-auto transition"
                      >
                        <Check size={12} /> ACKNOWLEDGE
                      </button>
                    ) : (
                      <span className="text-slate-500 text-[11px] italic">Acknowledged</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};