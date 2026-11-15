import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DeviceRuntimeState } from '../../types';

interface ProcessZoneProps {
  devices: Record<string, DeviceRuntimeState>;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  offsets?: Record<string, { x: number; y: number; z: number }>;
}

export const ProcessZone: React.FC<ProcessZoneProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  offsets,
}) => {
  const ovr = (id: string, d: [number, number, number]): [number, number, number] => { const o = offsets?.[id]; return o ? [d[0] + o.x, d[1] + o.y, d[2] + o.z] : d; };
  const agitatorRef = useRef<THREE.Group>(null);
  const pumpShaftRef = useRef<THREE.Mesh>(null);

  const tankState = devices['PROC_TANK_01'];
  const pumpState = devices['PROC_PUMP_01'];
  const valveState = devices['PROC_VALVE_01'];

  const tankLevelPct = tankState?.telemetry?.level_pct?.value ?? 68.0; // 0 to 100
  const isPumpRunning = pumpState?.status === 'RUNNING';
  const pumpRpm = pumpState?.telemetry?.rpm?.value ?? 1450.0;

  useFrame((_, delta) => {
    // Agitator shaft rotation in CSTR tank
    if (agitatorRef.current) {
      agitatorRef.current.rotation.y += delta * 3.5;
    }
    // Pump drive shaft rotation
    if (pumpShaftRef.current && isPumpRunning) {
      pumpShaftRef.current.rotation.x += delta * (pumpRpm / 60) * 0.2;
    }
  });

  // Calculate liquid cylinder height (max tank height inside = 3.6m)
  const liquidHeight = Math.max(0.1, (tankLevelPct / 100) * 3.6);

  return (
    <group position={[18, 0, -8]} name="ProcessZone">
      {/* PROC_TANK_01: 10,000L CSTR Chemical Buffer Tank */}
      <group 
        position={ovr('PROC_TANK_01', [0, 0, 0])} 
        userData={{ deviceId: 'PROC_TANK_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('PROC_TANK_01'); }}
        
      >
        {/* Concrete Tank Plinth */}
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[2.8, 3.0, 0.4, 32]} />
          <meshStandardMaterial color="#262B30" roughness={0.8} metalness={0.2} />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'PROC_TANK_01' && (
          <mesh position={[0, 2.7, 0]}>
            <cylinderGeometry args={[2.5, 2.5, 4.8, 32]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Stainless Steel Tank Body */}
        <mesh position={[0, 2.6, 0]} castShadow>
          <cylinderGeometry args={[2.3, 2.3, 4.4, 32]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'PROC_TANK_01' ? '#4A535A' : '#333A40'} 
            roughness={0.25} 
            metalness={0.85} 
          />
        </mesh>

        {/* Dished Top & Bottom Heads */}
        <mesh position={[0, 4.8, 0]}>
          <sphereGeometry args={[2.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3]} />
          <meshStandardMaterial color="#333A40" roughness={0.25} metalness={0.85} />
        </mesh>

        {/* External Sight Glass Level Column (Shows real fluid level) */}
        <group position={[2.45, 2.6, 0]}>
          {/* Transparent Glass Tube */}
          <mesh>
            <cylinderGeometry args={[0.08, 0.08, 3.8, 16]} />
            <meshStandardMaterial 
              color="#E2E8F0" 
              roughness={0.1} 
              metalness={0.9} 
              transparent 
              opacity={0.35} 
            />
          </mesh>
          {/* Real Fluid Level Inside Tube */}
          <mesh position={[0, -1.9 + liquidHeight / 2, 0]}>
            <cylinderGeometry args={[0.07, 0.07, liquidHeight, 16]} />
            <meshStandardMaterial 
              color={tankLevelPct > 90 ? '#EF4444' : '#0284C7'} 
              roughness={0.2} 
              metalness={0.4} 
            />
          </mesh>
        </group>

        {/* Top Agitator Electric Motor & Gearbox */}
        <group position={[0, 5.8, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.35, 0.45, 1.2, 20]} />
            <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.7} />
          </mesh>
          <group position={[0, 0.8, 0]} ref={agitatorRef}>
            <mesh>
              <boxGeometry args={[0.6, 0.2, 0.2]} />
              <meshStandardMaterial color="#E6A23C" roughness={0.4} metalness={0.6} />
            </mesh>
          </group>
        </group>

        {/* Pressure Relief Safety Valve on Head */}
        <mesh position={[1.2, 5.4, 0.8]}>
          <cylinderGeometry args={[0.12, 0.12, 0.8, 16]} />
          <meshStandardMaterial color="#EF4444" roughness={0.3} metalness={0.6} />
        </mesh>

        {/* Inspection Manhole Cover with Bolted Flange */}
        <mesh position={[-1.2, 5.3, 0.6]}>
          <cylinderGeometry args={[0.4, 0.45, 0.15, 20]} />
          <meshStandardMaterial color="#4A5568" roughness={0.3} metalness={0.8} />
        </mesh>

        {/* Tank Status Beacon */}
        <mesh position={[0, 6.7, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial 
            color={
              tankState?.status === 'FAULT' ? '#EF4444' : 
              tankState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* PROC_PUMP_01: Centrifugal Booster Feed Pump */}
      <group 
        position={ovr('PROC_PUMP_01', [-8, 0.15, 2.5])} 
        userData={{ deviceId: 'PROC_PUMP_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('PROC_PUMP_01'); }}
        
      >
        {/* Cast Iron Heavy Base Plate */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[3.2, 0.2, 1.6]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'PROC_PUMP_01' ? '#3B444C' : '#24282D'} 
            roughness={0.6} 
            metalness={0.6} 
          />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'PROC_PUMP_01' && (
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[3.4, 1.2, 1.8]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Centrifugal Volute Casing (Spiral Casing) */}
        <group position={[-0.7, 0.6, 0]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.55, 0.65, 0.6, 24]} />
            <meshStandardMaterial color="#0284C7" roughness={0.35} metalness={0.65} />
          </mesh>
          {/* Discharge Flange Pointing Upwards */}
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.4, 16]} />
            <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
          </mesh>
          {/* Suction Flange Pointing Towards Tank */}
          <mesh position={[-0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.25, 0.25, 0.3, 16]} />
            <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.8} />
          </mesh>
        </group>

        {/* Heavy Induction Motor with Longitudinal Cooling Fins */}
        <group position={[0.8, 0.6, 0]}>
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.48, 0.48, 1.3, 24]} />
            <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Terminal Box */}
          <mesh position={[0, 0.52, 0]}>
            <boxGeometry args={[0.35, 0.22, 0.35]} />
            <meshStandardMaterial color="#373C40" roughness={0.5} metalness={0.5} />
          </mesh>
          {/* Motor Cooling Fan Shroud */}
          <mesh position={[0.72, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.47, 0.47, 0.25, 20]} />
            <meshStandardMaterial color="#0F172A" roughness={0.6} metalness={0.5} />
          </mesh>
        </group>

        {/* Flexible Coupling Guard between Motor and Volute */}
        <mesh position={[0.05, 0.6, 0]} ref={pumpShaftRef} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.26, 0.26, 0.4, 16]} />
          <meshStandardMaterial color="#E6A23C" roughness={0.3} metalness={0.6} />
        </mesh>

        {/* Pump Status Beacon */}
        <mesh position={[-0.7, 1.45, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={
              pumpState?.status === 'FAULT' ? '#EF4444' : 
              pumpState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* PROC_VALVE_01: PID Neutralization Control Valve */}
      <group 
        position={ovr('PROC_VALVE_01', [-8.7, 1.8, 2.5])} 
        userData={{ deviceId: 'PROC_VALVE_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('PROC_VALVE_01'); }}
        
      >
        {/* Globe Valve Body with Flanges */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.28, 0.28, 0.6, 16]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'PROC_VALVE_01' ? '#3B444C' : '#374151'} 
            roughness={0.4} 
            metalness={0.7} 
          />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'PROC_VALVE_01' && (
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.8, 1.4, 0.8]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Valve Bonnet & Stem */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 16]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.2} metalness={0.9} />
        </mesh>

        {/* Pneumatic Diaphragm Actuator Dome */}
        <mesh position={[0, 0.8, 0]} castShadow>
          <sphereGeometry args={[0.42, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#E6A23C" roughness={0.35} metalness={0.4} />
        </mesh>

        {/* Manual Override Handwheel */}
        <mesh position={[0, 1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.22, 0.03, 12, 24]} />
          <meshStandardMaterial color="#DC2626" roughness={0.4} metalness={0.5} />
        </mesh>

        {/* Smart Electro-Pneumatic Positioner Box */}
        <mesh position={[0.28, 0.55, 0]}>
          <boxGeometry args={[0.2, 0.3, 0.2]} />
          <meshStandardMaterial color="#0284C7" roughness={0.3} metalness={0.5} />
        </mesh>

        {/* Valve Status Beacon */}
        <mesh position={[0, 1.35, 0]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial 
            color={
              valveState?.status === 'FAULT' ? '#EF4444' : 
              valveState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* Process Piping Network Connecting Tank, Pump, and Overhead Rack */}
      <group position={[0, 0, 0]}>
        {/* Pipe: Tank Bottom Orifice to Pump Suction */}
        <mesh position={[-4.5, 0.6, 2.5]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 5.2, 16]} />
          <meshStandardMaterial color="#4A5568" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Bolted Coupling Flanges */}
        {[-6.8, -2.1].map((fx) => (
          <mesh key={`flange-${fx}`} position={[fx, 0.6, 2.5]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.32, 0.32, 0.08, 16]} />
            <meshStandardMaterial color="#718096" roughness={0.25} metalness={0.85} />
          </mesh>
        ))}

        {/* Pipe: Valve Outlet Rising to Overhead Pipe Rack */}
        <mesh position={[-8.7, 4.2, 2.5]}>
          <cylinderGeometry args={[0.2, 0.2, 4.2, 16]} />
          <meshStandardMaterial color="#4A5568" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
    </group>
  );
};