import { useTranslation } from '../i18n';
import React from 'react';
import { 
  Zap, ArrowRight, Play, Square, RefreshCw, 
  Activity, ShieldCheck, Gauge, AlertTriangle
} from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';

interface GridViewProps {
  devices: Record<string, DeviceRuntimeState>;
  alarms: AlarmRecord[];
  onCommand: (device: string, op: string, params?: any) => void;
  onInjectFault: (device: string, fault: string, params?: any) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const GridView: React.FC<GridViewProps> = ({
  devices,
  alarms,
  onCommand,
  onInjectFault,
  onSelectDevice
}) => {
  const { t } = useTranslation();
  const trafo = devices['GRID_TRAFO_01'];
  const cb1 = devices['GRID_CB_01'];
  const cb2 = devices['GRID_CB_02'];

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 bg-[#17191B]">
      {/* Domain Header */}
      <div className="scada-panel p-4 rounded-lg flex items-center justify-between border-l-4 border-l-amber-400">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-amber-400" />
            <h1 className="text-base font-bold text-slate-100 tracking-wide">
              ELECTRICAL GRID — 11kV SUBSTATION SINGLE-LINE DIAGRAM (SLD)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Medium voltage power distribution network showing 33kV/11kV step-down transformer, vacuum circuit breakers, harmonic distortion, and reactive power flow.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Active Power</span>
            <div className="text-xl font-bold font-mono-num text-amber-400">1.68 MW</div>
          </div>
          <div className="text-right border-l border-[#373C40] pl-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Frequency</span>
            <div className="text-xl font-bold font-mono-num text-emerald-400">50.02 Hz</div>
          </div>
        </div>
      </div>

      {/* Single-Line Diagram (SLD) Schematic */}
      <div className="scada-panel p-5 rounded-lg">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity size={14} className="text-amber-400" />
          Single-Line Diagram Representation (Medium Voltage Busbar)
        </h2>

        <div className="bg-[#080B10] border border-[#373C40] rounded-lg p-6 flex flex-col items-center relative">
          {/* Incoming 33kV Utility Supply Line */}
          <div className="flex flex-col items-center mb-4">
            <span className="text-[10px] font-mono-num text-amber-300 uppercase tracking-wider">33 kV Grid Infeed Utility</span>
            <div className="w-1 h-8 bg-amber-400 my-1" />
          </div>

          {/* Step-Down Transformer T1 */}
          <div 
            onClick={() => onSelectDevice('GRID_TRAFO_01')}
            className="p-4 rounded-lg bg-[#202326] border-2 border-amber-400 hover:border-amber-300 cursor-pointer shadow-lg w-72 text-center transition"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100">Transformer TR-101</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {trafo?.status || 'ENERGIZED'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num">GRID_TRAFO_01 (33kV / 11kV)</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#373C40]">
              <div className="text-left">
                <div className="text-[10px] text-slate-500">Power:</div>
                <div className="font-mono-num font-bold text-amber-400">1.68 MW</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500">Oil Temp:</div>
                <div className="font-mono-num font-bold text-slate-200">58.4°C</div>
              </div>
            </div>
          </div>

          {/* 11kV Main Busbar Line */}
          <div className="w-1 h-8 bg-amber-400 my-1" />
          <div className="w-full max-w-2xl h-2 bg-amber-400 rounded-full relative my-1 shadow-[0_0_10px_#F59E0B]">
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-widest text-amber-300 uppercase">
              11 kV MAIN DISTRIBUTION BUSBAR
            </span>
          </div>

          {/* Downstream Feeders & Breakers */}
          <div className="w-full max-w-2xl grid grid-cols-2 gap-12 mt-2">
            {/* Feeder 1 - Industrial Load */}
            <div className="flex flex-col items-center">
              <div className="w-1 h-6 bg-amber-400" />
              <div 
                onClick={() => onSelectDevice('GRID_CB_01')}
                className="p-3 rounded-lg bg-[#202326] border border-[#4A5056] hover:border-amber-400 cursor-pointer w-full text-center transition"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200">Breaker CB-01</span>
                  <span className="text-[10px] px-1.5 rounded bg-emerald-950 text-emerald-400">CLOSED</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono-num mt-0.5">GRID_CB_01</div>
                <div className="text-xs text-slate-400 mt-2 flex justify-between">
                  <span>Current:</span>
                  <span className="font-mono-num font-bold text-slate-200">92.4 A</span>
                </div>
              </div>
              <div className="w-1 h-6 bg-slate-700" />
              <div className="text-[11px] font-bold text-slate-400 text-center uppercase tracking-wider">
                Feeder A (Factory & Process)
              </div>
            </div>

            {/* Feeder 2 - Commercial Microgrid */}
            <div className="flex flex-col items-center">
              <div className="w-1 h-6 bg-amber-400" />
              <div 
                onClick={() => onSelectDevice('GRID_CB_02')}
                className="p-3 rounded-lg bg-[#202326] border border-[#4A5056] hover:border-amber-400 cursor-pointer w-full text-center transition"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200">Breaker CB-02</span>
                  <span className="text-[10px] px-1.5 rounded bg-emerald-950 text-emerald-400">CLOSED</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono-num mt-0.5">GRID_CB_02</div>
                <div className="text-xs text-slate-400 mt-2 flex justify-between">
                  <span>Current:</span>
                  <span className="font-mono-num font-bold text-slate-200">38.1 A</span>
                </div>
              </div>
              <div className="w-1 h-6 bg-slate-700" />
              <div className="text-[11px] font-bold text-slate-400 text-center uppercase tracking-wider">
                Feeder B (Building Microgrid)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Quality & Anomaly Operations */}
      <div className="grid grid-cols-2 gap-4">
        {/* Power Quality Telemetry */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Gauge size={14} className="text-amber-400" /> Substation Power Quality Telemetry
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Voltage Total Harmonic Distortion (THD):</span>
              <span className="font-mono-num font-bold text-emerald-400">1.82% (Limit: 5.0%)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Power Factor (cos φ):</span>
              <span className="font-mono-num font-bold text-emerald-400">0.94 Lagging</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Neutral Current Imbalance:</span>
              <span className="font-mono-num font-bold text-slate-200">2.1 A (Normal)</span>
            </div>
          </div>
        </div>

        {/* Protection Trip Testing */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-400" /> Grid Protection & Relay Simulation
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => onInjectFault('GRID_TRAFO_01', 'OVERCURRENT_TRIP', { current: 350.0 })}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Simulate Transformer Overcurrent
            </button>
            <button
              onClick={() => onInjectFault('GRID_TRAFO_01', 'FREQ_DEVIATION', { delta_hz: -0.8 })}
              className="p-2.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Inject Frequency Sag (-0.8 Hz)
            </button>
            <button
              onClick={() => onCommand('GRID_CB_01', 'CLOSE')}
              className="p-2.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Play size={12} /> Close Feeder Breaker CB-01
            </button>
            <button
              onClick={() => onCommand('GRID_CB_01', 'OPEN')}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Square size={12} /> Trip Feeder Breaker CB-01
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};