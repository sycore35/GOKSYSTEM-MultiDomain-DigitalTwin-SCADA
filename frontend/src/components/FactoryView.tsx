import { useTranslation } from '../i18n';
import React from 'react';
import { 
  Factory, ArrowRight, Play, Square, RefreshCw, 
  Cpu, AlertTriangle, ShieldCheck, Gauge, Zap
} from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';

interface FactoryViewProps {
  devices: Record<string, DeviceRuntimeState>;
  alarms: AlarmRecord[];
  onCommand: (device: string, op: string, params?: any) => void;
  onInjectFault: (device: string, fault: string, params?: any) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const FactoryView: React.FC<FactoryViewProps> = ({
  devices,
  alarms,
  onCommand,
  onInjectFault,
  onSelectDevice
}) => {
  const { t } = useTranslation();
  const conveyor = devices['FAC_CONVEYOR_01'];
  const robot = devices['FAC_ROBOT_01'];
  const cnc = devices['FAC_CNC_01'];
  const inspect = devices['FAC_INSPECT_01'];

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'RUNNING': return 'text-emerald-400 bg-emerald-950 border-emerald-800';
      case 'WARNING': return 'text-amber-400 bg-amber-950 border-amber-800';
      case 'FAULT':
      case 'TRIPPED': return 'text-rose-400 bg-rose-950 border-rose-800';
      default: return 'text-slate-400 bg-slate-900 border-slate-700';
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 bg-[#17191B]">
      {/* Domain Header */}
      <div className="scada-panel p-4 rounded-lg flex items-center justify-between border-l-4 border-l-cyan-400">
        <div>
          <div className="flex items-center gap-2">
            <Factory size={20} className="text-[#E6A23C]" />
            <h1 className="text-base font-bold text-slate-100 tracking-wide">
              SMART FACTORY — AUTOMATED PRODUCTION WORKSPACE
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time cyber-physical automation cell tracking CNC milling operations, 6-axis robotic transfer, conveyor kinematics, and automated optical inspection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Cell OEE</span>
            <div className="text-xl font-bold font-mono-num text-emerald-400">88.4%</div>
          </div>
          <div className="text-right border-l border-[#373C40] pl-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Parts</span>
            <div className="text-xl font-bold font-mono-num text-[#E6A23C]">1,482 pcs</div>
          </div>
        </div>
      </div>

      {/* Production Flow Diagram */}
      <div className="scada-panel p-4 rounded-lg">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Cpu size={14} className="text-[#E6A23C]" />
          Sequential Line Flow Topology
        </h2>

        <div className="grid grid-cols-4 gap-3 relative">
          {/* Station 1: Conveyor Infeed */}
          <div 
            onClick={() => onSelectDevice('FAC_CONVEYOR_01')}
            className="bg-[#202326] p-4 rounded-lg border border-[#4A5056] hover:border-cyan-400 cursor-pointer transition flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-200">1. Conveyor Infeed</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${getStatusColor(conveyor?.status)}`}>
                  {conveyor?.status || 'RUNNING'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num mb-3">FAC_CONVEYOR_01</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Belt Speed:</span>
                  <span className="font-mono-num font-bold text-slate-200">
                    {conveyor?.telemetry?.speed?.value ? `${conveyor.telemetry.speed.value.toFixed(2)} m/s` : '1.20 m/s'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Motor Current:</span>
                  <span className="font-mono-num font-bold text-[#E6A23C]">
                    {conveyor?.telemetry?.current?.value ? `${conveyor.telemetry.current.value.toFixed(1)} A` : '14.2 A'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-[#373C40] text-[10px] text-slate-500 flex justify-between">
              <span>Drive: Variable VFD</span>
              <span className="text-[#E6A23C] font-semibold">Inspect →</span>
            </div>
          </div>

          {/* Station 2: CNC Milling */}
          <div 
            onClick={() => onSelectDevice('FAC_CNC_01')}
            className="bg-[#202326] p-4 rounded-lg border border-[#4A5056] hover:border-cyan-400 cursor-pointer transition flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-200">2. CNC Precision Cell</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${getStatusColor(cnc?.status)}`}>
                  {cnc?.status || 'RUNNING'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num mb-3">FAC_CNC_01</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Spindle Speed:</span>
                  <span className="font-mono-num font-bold text-slate-200">
                    {cnc?.telemetry?.spindle_rpm?.value ? `${cnc.telemetry.spindle_rpm.value.toFixed(0)} RPM` : '8,400 RPM'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tool Wear:</span>
                  <span className="font-mono-num font-bold text-amber-400">
                    {cnc?.telemetry?.tool_wear_pct?.value ? `${cnc.telemetry.tool_wear_pct.value.toFixed(1)}%` : '18.4%'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-[#373C40] text-[10px] text-slate-500 flex justify-between">
              <span>5-Axis Machining</span>
              <span className="text-[#E6A23C] font-semibold">Inspect →</span>
            </div>
          </div>

          {/* Station 3: Robotic Arm Assembly */}
          <div 
            onClick={() => onSelectDevice('FAC_ROBOT_01')}
            className="bg-[#202326] p-4 rounded-lg border border-[#4A5056] hover:border-cyan-400 cursor-pointer transition flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-200">3. Robotic Assembly</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${getStatusColor(robot?.status)}`}>
                  {robot?.status || 'RUNNING'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num mb-3">FAC_ROBOT_01</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Joint 1 Angle:</span>
                  <span className="font-mono-num font-bold text-slate-200">
                    {robot?.telemetry?.joint1_angle?.value ? `${robot.telemetry.joint1_angle.value.toFixed(1)}°` : '42.5°'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cycle Time:</span>
                  <span className="font-mono-num font-bold text-[#E6A23C]">
                    {robot?.telemetry?.cycle_time?.value ? `${robot.telemetry.cycle_time.value.toFixed(2)}s` : '3.82s'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-[#373C40] text-[10px] text-slate-500 flex justify-between">
              <span>6-Axis Articulated</span>
              <span className="text-[#E6A23C] font-semibold">Inspect →</span>
            </div>
          </div>

          {/* Station 4: Quality Inspection */}
          <div 
            onClick={() => onSelectDevice('FAC_INSPECT_01')}
            className="bg-[#202326] p-4 rounded-lg border border-[#4A5056] hover:border-cyan-400 cursor-pointer transition flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-200">4. Optical Inspection</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold border ${getStatusColor(inspect?.status)}`}>
                  {inspect?.status || 'RUNNING'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono-num mb-3">FAC_INSPECT_01</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Pass Rate:</span>
                  <span className="font-mono-num font-bold text-emerald-400">99.2%</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Defects Caught:</span>
                  <span className="font-mono-num font-bold text-rose-400">12 pcs</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-[#373C40] text-[10px] text-slate-500 flex justify-between">
              <span>AOI Vision Camera</span>
              <span className="text-[#E6A23C] font-semibold">Inspect →</span>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Controls & Engineering Anomaly Injection */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cell Telemetry Parameters */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Gauge size={14} className="text-[#E6A23C]" /> Cell Telemetry Parameters
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Conveyor Motor Thermal Dissipation:</span>
              <span className="font-mono-num font-bold text-slate-200">48.2°C (Limit: 85°C)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">CNC Spindle Vibration RMS:</span>
              <span className="font-mono-num font-bold text-emerald-400">1.42 mm/s (Healthy)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Line Conveyor Interlock State:</span>
              <span className="font-mono-num font-bold text-emerald-400">ENGAGED (Normal)</span>
            </div>
          </div>
        </div>

        {/* Fault Injection Test Suite */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" /> Engineering Anomaly Injection
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => onInjectFault('FAC_CONVEYOR_01', 'BELT_SLIP', { slip_ratio: 0.35 })}
              className="p-2.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Inject Conveyor Slip (+35%)
            </button>
            <button
              onClick={() => onInjectFault('FAC_CNC_01', 'SPINDLE_OVERHEAT', { temp_delta: 25.0 })}
              className="p-2.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Inject CNC Thermal Runaway
            </button>
            <button
              onClick={() => onCommand('FAC_CONVEYOR_01', 'START')}
              className="p-2.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Play size={12} /> Start Full Line Sequence
            </button>
            <button
              onClick={() => onCommand('FAC_CONVEYOR_01', 'STOP')}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Square size={12} /> Emergency E-Stop All Cells
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};