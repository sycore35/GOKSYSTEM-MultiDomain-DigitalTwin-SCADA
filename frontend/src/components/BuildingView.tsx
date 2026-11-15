import { useTranslation } from '../i18n';
import React from 'react';
import { 
  Building, Sun, BatteryCharging, Zap, ArrowRight, 
  Play, Square, RefreshCw, Gauge, AlertTriangle, Wind
} from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';

interface BuildingViewProps {
  devices: Record<string, DeviceRuntimeState>;
  alarms: AlarmRecord[];
  onCommand: (device: string, op: string, params?: any) => void;
  onInjectFault: (device: string, fault: string, params?: any) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const BuildingView: React.FC<BuildingViewProps> = ({
  devices,
  alarms,
  onCommand,
  onInjectFault,
  onSelectDevice
}) => {
  const { t } = useTranslation();
  const hvac = devices['BLD_HVAC_01'];
  const solar = devices['BLD_SOLAR_01'];
  const bess = devices['BLD_BESS_01'];

  const solarKw = solar?.telemetry?.power_kw?.value ?? 124.5;
  const hvacKw = hvac?.telemetry?.power_kw?.value ?? 160.0;
  const batterySoc = bess?.telemetry?.soc_pct?.value ?? 82.0;

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto p-4 space-y-4 bg-[#17191B]">
      {/* Domain Header */}
      <div className="scada-panel p-4 rounded-lg flex items-center justify-between border-l-4 border-l-emerald-400">
        <div>
          <div className="flex items-center gap-2">
            <Building size={20} className="text-emerald-400" />
            <h1 className="text-base font-bold text-slate-100 tracking-wide">
              SMART BUILDING — COMMERCIAL MICROGRID & FACILITY ENERGY WORKSPACE
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Commercial building energy management system integrating rooftop solar PV generation, lithium battery storage (BESS), central HVAC chillers, and net-zero energy balance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Solar Generation</span>
            <div className="text-xl font-bold font-mono-num text-emerald-400">{solarKw.toFixed(1)} kW</div>
          </div>
          <div className="text-right border-l border-[#373C40] pl-3">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Battery SOC</span>
            <div className="text-xl font-bold font-mono-num text-[#E6A23C]">{batterySoc.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* Microgrid Energy Flow Schematic */}
      <div className="scada-panel p-5 rounded-lg">
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Zap size={14} className="text-emerald-400" />
          Microgrid Energy Balance & Generation Topology
        </h2>

        <div className="bg-[#080B10] border border-[#373C40] rounded-lg p-6 grid grid-cols-3 gap-6 items-center">
          {/* Node 1: Rooftop Solar PV */}
          <div 
            onClick={() => onSelectDevice('BLD_SOLAR_01')}
            className="p-4 rounded-lg bg-[#202326] border border-[#4A5056] hover:border-emerald-400 cursor-pointer shadow-lg transition"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <Sun size={14} className="text-amber-400" /> Solar PV Canopy
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {solar?.status || 'GENERATING'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num mb-2">BLD_SOLAR_01</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Active Power:</span>
                <span className="font-mono-num font-bold text-emerald-400">{solarKw.toFixed(1)} kW</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Irradiance:</span>
                <span className="font-mono-num font-bold text-slate-200">820 W/m²</span>
              </div>
            </div>
          </div>

          {/* Node 2: Central BESS Battery Storage */}
          <div 
            onClick={() => onSelectDevice('BLD_BESS_01')}
            className="p-5 rounded-lg bg-[#202326] border-2 border-emerald-400 hover:border-emerald-300 cursor-pointer shadow-xl transition"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <BatteryCharging size={14} className="text-emerald-400" /> Battery Storage BESS
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {bess?.status || 'STANDBY'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num mb-3">BLD_BESS_01 (500 kWh Pack)</div>

            {/* Battery State-of-Charge Bar */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>State of Charge (SOC):</span>
                <span className="font-mono-num font-bold text-emerald-300">{batterySoc.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-[#080B10] h-3 rounded-full overflow-hidden border border-[#373C40]">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-300" 
                  style={{ width: `${Math.min(batterySoc, 100)}%` }} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#373C40]">
              <div>
                <span className="text-[10px] text-slate-500">Mode:</span>
                <div className="font-mono-num font-bold text-slate-200">Peak Shaving</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500">Cell Temp:</span>
                <div className="font-mono-num font-bold text-slate-200">26.4°C</div>
              </div>
            </div>
          </div>

          {/* Node 3: HVAC Chiller Plant */}
          <div 
            onClick={() => onSelectDevice('BLD_HVAC_01')}
            className="p-4 rounded-lg bg-[#202326] border border-[#4A5056] hover:border-emerald-400 cursor-pointer shadow-lg transition"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <Wind size={14} className="text-[#E6A23C]" /> Central HVAC Chiller
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                {hvac?.status || 'RUNNING'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-num mb-2">BLD_HVAC_01</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Thermal Demand:</span>
                <span className="font-mono-num font-bold text-[#E6A23C]">{hvacKw.toFixed(1)} kW</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Chiller COP:</span>
                <span className="font-mono-num font-bold text-slate-200">4.82</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Facility Operations & Fault Testing */}
      <div className="grid grid-cols-2 gap-4">
        {/* Comfort Index & Environmental Telemetry */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Gauge size={14} className="text-emerald-400" /> Indoor Environmental Quality (IEQ)
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Indoor Air Comfort Rating:</span>
              <span className="font-mono-num font-bold text-emerald-400">96% (ASHRAE 55 Optimal)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Zone CO2 Level:</span>
              <span className="font-mono-num font-bold text-slate-200">485 ppm (Clean Air)</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-[#202326] border border-[#373C40]">
              <span className="text-slate-400">Net Facility Grid Import:</span>
              <span className="font-mono-num font-bold text-[#E6A23C]">35.5 kW (Near Zero Net)</span>
            </div>
          </div>
        </div>

        {/* Energy Management Commands */}
        <div className="scada-panel p-4 rounded-lg">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" /> Microgrid Islanding & Fault Simulation
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => onInjectFault('BLD_SOLAR_01', 'CLOUD_COVER', { drop_ratio: 0.8 })}
              className="p-2.5 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> Cloud Cover Sudden Sag (-80%)
            </button>
            <button
              onClick={() => onInjectFault('BLD_BESS_01', 'CELL_HOTSPOT', { temp_rise: 15.0 })}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <RefreshCw size={12} /> BESS Cell Thermal Hotspot
            </button>
            <button
              onClick={() => onCommand('BLD_HVAC_01', 'START')}
              className="p-2.5 rounded bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Play size={12} /> Optimize HVAC Chillers
            </button>
            <button
              onClick={() => onCommand('BLD_HVAC_01', 'STOP')}
              className="p-2.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Square size={12} /> Demand Response Shed Load
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};