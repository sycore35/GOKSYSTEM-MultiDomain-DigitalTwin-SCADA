import { useTranslation } from '../i18n';
import React from 'react';
import { 
  Droplet, ArrowRight, Play, Square, RefreshCw, 
  Gauge, AlertTriangle, ShieldCheck, Thermometer, Wind
} from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';

interface ProcessViewProps {
  devices: Record<string, DeviceRuntimeState>;
  alarms: AlarmRecord[];
  onCommand: (device: string, op: string, params?: any) => void;
  onInjectFault: (device: string, fault: string, params?: any) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const ProcessView: React.FC<ProcessViewProps> = ({
  devices,
  alarms,
  onCommand,
  onInjectFault,
  onSelectDevice
}) => {
  const { t } = useTranslation();
  const reactor = devices['PROC_REACTOR_01'];
  const pump = devices['PROC_PUMP_01'];
  const heatex = devices['PROC_HEATEX_01'];

  const levelPct = reactor?.telemetry?.level_pct?.value ?? 74.2;
  const tempC = reactor?.telemetry?.temperature_c?.value ?? 68.5;
  const pressureBar = reactor?.telemetry?.pressure_bar?.value ?? 4.20;

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 bg-[#17191B]">
      {/* Domain Header */}
      <div className="scada-panel p-4 rounded-lg flex items-center justify-between border-l-4 border-l-sky-400">
        <div>
          <div className="flex items-center gap-2">
            <Droplet size={20} className="text-sky-400" />
            <h1 className="text-base font-bold text-slate-100 tracking-wide">
              PROCESS PLANT — CHEMICAL CONTINUOUS REACTOR P&ID WORKSPACE
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Piping and instrumentation diagram (P&ID) showing continuous stirred-tank reactor TK-101, centrifugal feed pump P-101, jacket heating, and pressure relief loops.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Reactor Level</span>
            <div className="text-xl font-bold font-mono-num text-sky-400">{levelPct.toFixed(1)}%</div>
          </div>
          <div className="text-right border-l border-[#373C40] pl-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Core Temp</span>
            <div className="text-xl font-bold font-mono-num text-amber-400">{tempC.toFixed(1)}°C</div>
          </div>
        </div>
      </div>

      {/* P&ID Schematic Layout */}
      <div className="scada-panel p-5 rounded-lg">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Wind size={14} className="text-sky-400" />
          Piping & Instrumentation Diagram (Fluid Flow Loops)
        </h2>

        <div className="bg-[#080B10] border border-[#373C40] rounded-lg p-6 grid grid-cols-3 gap-6 items-center">
          {/* Component 1: Feed Pump P-101 */}
          <div 
            onClick={() => onSelectDevice('PROC_PUMP_01')}
            className="p-4 rounded-lg bg-[#202326] border border-[#4A5056] hover:border-sky-400 cursor-pointer shadow-lg transition"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100">Feed Pump P-101</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {pump?.status || 'RUNNING'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num mb-2">PROC_PUMP_01</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Flow Rate:</span>
                <span className="font-mono-num font-bold text-sky-400">
                  {pump?.telemetry?.flow_rate?.value ? `${pump.telemetry.flow_rate.value.toFixed(1)} m³/h` : '18.4 m³/h'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Discharge Head:</span>
                <span className="font-mono-num font-bold text-slate-200">5.4 bar</span>
              </div>
            </div>
          </div>

          {/* Component 2: Main Chemical Reactor Vessel TK-101 */}
          <div 
            onClick={() => onSelectDevice('PROC_REACTOR_01')}
            className="p-5 rounded-lg bg-[#202326] border-2 border-sky-400 hover:border-sky-300 cursor-pointer shadow-xl transition relative"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100">Reactor Vessel TK-101</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {reactor?.status || 'ACTIVE'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num mb-3">PROC_REACTOR_01</div>

            {/* Vessel Liquid Level Bar Indicator */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Vessel Liquid Fill:</span>
                <span className="font-mono-num font-bold text-sky-300">{levelPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-[#080B10] h-3 rounded-full overflow-hidden border border-[#373C40]">
                <div 
                  className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full transition-all duration-300" 
                  style={{ width: `${Math.min(levelPct, 100)}%` }} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#373C40]">
              <div>
                <span className="text-[10px] text-slate-500">Core Temp:</span>
                <div className="font-mono-num font-bold text-amber-400">{tempC.toFixed(1)}°C</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500">Pressure:</span>
                <div className="font-mono-num font-bold text-slate-200">{pressureBar.toFixed(2)} bar</div>
              </div>
            </div>
          </div>

          {/* Component 3: Heat Exchanger HX-101 */}
          <div 
            onClick={() => onSelectDevice('PROC_HEATEX_01')}
            className="p-4 rounded-lg bg-[#202326] border border-[#4A5056] hover:border-sky-400 cursor-pointer shadow-lg transition"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100">Heat Exchanger HX-101</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {heatex?.status || 'OPTIMAL'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num mb-2">PROC_HEATEX_01</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Thermal Duty:</span>
                <span className="font-mono-num font-bold text-amber-400">420 kW</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Cooling Delta T:</span>
                <span className="font-mono-num font-bold text-slate-200">14.8°C</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Process Control & Fault Simulation */}
      <div className="grid grid-cols-2 gap-4">
        {/* Safety Interlocks */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Gauge size={14} className="text-sky-400" /> Process Critical Interlocks
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">High-High Level Trip Sensor (LAHH-101):</span>
              <span className="font-mono-num font-bold text-emerald-400">ARMED (Trip at 95%)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Overpressure Burst Disc Indicator (PSE-101):</span>
              <span className="font-mono-num font-bold text-emerald-400">INTACT (Rating 10.0 bar)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Agitator Motor Drive:</span>
              <span className="font-mono-num font-bold text-slate-200">120 RPM (Steady)</span>
            </div>
          </div>
        </div>

        {/* Process Anomaly Operations */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-400" /> Chemical Reaction Fault Testing
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => onInjectFault('PROC_REACTOR_01', 'TEMP_RUNAWAY', { delta_temp: 20.0 })}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Exothermic Thermal Runaway (+20°C)
            </button>
            <button
              onClick={() => onInjectFault('PROC_PUMP_01', 'CAVITATION', { flow_loss: 0.5 })}
              className="p-2.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Inject Pump Cavitation (-50% Flow)
            </button>
            <button
              onClick={() => onCommand('PROC_PUMP_01', 'START')}
              className="p-2.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Play size={12} /> Start Feed Pump P-101
            </button>
            <button
              onClick={() => onCommand('PROC_PUMP_01', 'STOP')}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Square size={12} /> Emergency Vent / Stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};