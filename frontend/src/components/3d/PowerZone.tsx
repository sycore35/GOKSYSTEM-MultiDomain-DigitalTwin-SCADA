import React from 'react';
import { DeviceRuntimeState } from '../../types';

interface PowerZoneProps {
  devices: Record<string, DeviceRuntimeState>;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  offsets?: Record<string, { x: number; y: number; z: number }>;
}

export const PowerZone: React.FC<PowerZoneProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  offsets,
}) => {
  const ovr = (id: string, d: [number, number, number]): [number, number, number] => { const o = offsets?.[id]; return o ? [d[0] + o.x, d[1] + o.y, d[2] + o.z] : d; };
  const trafoState = devices['GRID_TRAFO_01'];
  const breakerState = devices['GRID_BREAKER_01'];
  const busbarState = devices['GRID_BUSBAR_11KV'];

  return (
    <group position={[-5, 0, -26]} name="PowerZone">
      {/* GRID_TRAFO_01: 11kV Distribution Power Transformer */}
      <group 
        position={ovr('GRID_TRAFO_01', [0, 0, 0])} 
        userData={{ deviceId: 'GRID_TRAFO_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('GRID_TRAFO_01'); }}
        
      >
        {/* Concrete Foundation Sump / Oil Containment Pit */}
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[7.2, 0.5, 6.2]} />
          <meshStandardMaterial color="#22272B" roughness={0.8} metalness={0.2} />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'GRID_TRAFO_01' && (
          <mesh position={[0, 2.8, 0]}>
            <boxGeometry args={[6.8, 5.2, 5.4]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Main Transformer Oil Tank */}
        <mesh position={[0, 2.4, 0]} castShadow>
          <boxGeometry args={[5.2, 3.8, 3.8]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'GRID_TRAFO_01' ? '#3B444C' : '#2A3036'} 
            roughness={0.4} 
            metalness={0.7} 
          />
        </mesh>

        {/* External Corrugated Radiator Cooling Banks */}
        {[-2.8, 2.8].map((rx) => (
          <group key={`radiator-${rx}`} position={[rx, 2.3, 0]}>
            {Array.from({ length: 9 }).map((_, i) => (
              <mesh key={`fin-${i}`} position={[0, 0, -1.5 + i * 0.38]}>
                <boxGeometry args={[0.55, 3.2, 0.08]} />
                <meshStandardMaterial color="#373E45" roughness={0.45} metalness={0.65} />
              </mesh>
            ))}
          </group>
        ))}

        {/* Conservator Oil Expansion Tank (Cylinder on Top) */}
        <mesh position={[0, 4.8, -1.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.55, 0.55, 4.2, 20]} />
          <meshStandardMaterial color="#333A40" roughness={0.4} metalness={0.6} />
        </mesh>

        {/* Buchholz Protective Relay */}
        <mesh position={[0, 4.4, -0.6]}>
          <boxGeometry args={[0.35, 0.35, 0.4]} />
          <meshStandardMaterial color="#E6A23C" roughness={0.3} metalness={0.6} />
        </mesh>

        {/* High-Voltage Ceramic Bushings (11kV Ribbed Insulators) */}
        {[-1.5, 0, 1.5].map((bx, i) => (
          <group key={`hv-bushing-${i}`} position={[bx, 4.5, 0.9]}>
            <mesh>
              <cylinderGeometry args={[0.18, 0.32, 1.6, 16]} />
              <meshStandardMaterial color="#92400E" roughness={0.3} metalness={0.4} />
            </mesh>
            {/* Copper Bus Terminal Cap */}
            <mesh position={[0, 0.9, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.25, 12]} />
              <meshStandardMaterial color="#F59E0B" roughness={0.2} metalness={0.9} />
            </mesh>
          </group>
        ))}

        {/* Transformer Status Beacon */}
        <mesh position={[0, 5.8, 0]}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshBasicMaterial 
            color={
              trafoState?.status === 'FAULT' ? '#EF4444' : 
              trafoState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* GRID_BREAKER_01: 11kV Incomer Vacuum Circuit Breaker (VCB) */}
      <group 
        position={ovr('GRID_BREAKER_01', [7.5, 0, 0])} 
        userData={{ deviceId: 'GRID_BREAKER_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('GRID_BREAKER_01'); }}
        
      >
        {/* Switchgear Cubicle Body */}
        <mesh position={[0, 2.2, 0]} castShadow>
          <boxGeometry args={[2.4, 4.4, 2.2]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'GRID_BREAKER_01' ? '#3B444C' : '#202529'} 
            roughness={0.4} 
            metalness={0.6} 
          />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'GRID_BREAKER_01' && (
          <mesh position={[0, 2.2, 0]}>
            <boxGeometry args={[2.6, 4.6, 2.4]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Drawout VCB Breaker Carriage Panel */}
        <mesh position={[0, 1.8, 1.12]}>
          <boxGeometry args={[1.8, 2.1, 0.1]} />
          <meshStandardMaterial color="#2B3238" roughness={0.45} metalness={0.5} />
        </mesh>

        {/* Mechanical Close/Trip Status Indicator Flag */}
        <mesh position={[0, 2.4, 1.2]}>
          <boxGeometry args={[0.4, 0.25, 0.05]} />
          <meshBasicMaterial color={breakerState?.status === 'OPEN' ? '#22C55E' : '#EF4444'} />
        </mesh>

        {/* Breaker Status Beacon */}
        <mesh position={[0, 4.6, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={
              breakerState?.status === 'TRIPPED' ? '#EF4444' : 
              breakerState?.status === 'CLOSED' ? '#22C55E' : '#E6A23C'
            } 
          />
        </mesh>
      </group>

      {/* GRID_BUSBAR_11KV: Main Switchgear Control Cabinet Lineup */}
      <group 
        position={ovr('GRID_BUSBAR_11KV', [12, 0, 0])} 
        userData={{ deviceId: 'GRID_BUSBAR_11KV' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('GRID_BUSBAR_11KV'); }}
        
      >
        {/* Line of 3 Rittal-Style Industrial Control Cabinets */}
        {[-1.2, 0, 1.2].map((cx, idx) => (
          <group key={`cab-${idx}`} position={[cx, 2.1, 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.15, 4.2, 1.8]} />
              <meshStandardMaterial 
                color={selectedDeviceId === 'GRID_BUSBAR_11KV' ? '#3B444C' : '#23282D'} 
                roughness={0.4} 
                metalness={0.6} 
              />
            </mesh>
            {/* Door Handles & Mimic Display Screen */}
            <mesh position={[0, 1.0, 0.92]}>
              <boxGeometry args={[0.7, 0.5, 0.05]} />
              <meshStandardMaterial color="#0A0E14" roughness={0.2} metalness={0.8} />
            </mesh>
            <mesh position={[0.4, 0, 0.92]}>
              <boxGeometry args={[0.08, 0.4, 0.08]} />
              <meshStandardMaterial color="#A0AEC0" roughness={0.2} metalness={0.9} />
            </mesh>
          </group>
        ))}

        {/* Status Beacon */}
        <mesh position={[0, 4.4, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={
              busbarState?.status === 'FAULT' ? '#EF4444' : 
              busbarState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>
    </group>
  );
};