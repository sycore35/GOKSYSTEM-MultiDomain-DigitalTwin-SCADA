import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DeviceRuntimeState } from '../../types';

interface FacilityZoneProps {
  devices: Record<string, DeviceRuntimeState>;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  offsets?: Record<string, { x: number; y: number; z: number }>;
}

export const FacilityZone: React.FC<FacilityZoneProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  offsets,
}) => {
  const ovr = (id: string, d: [number, number, number]): [number, number, number] => { const o = offsets?.[id]; return o ? [d[0] + o.x, d[1] + o.y, d[2] + o.z] : d; };
  const fansRef = useRef<THREE.Group>(null);

  const hvacState = devices['BLD_HVAC_ZONE1'];
  const batteryState = devices['BLD_BMS_BATTERY_01'];
  const solarState = devices['BLD_SOLAR_PV_01'];

  const isHvacRunning = hvacState?.status === 'RUNNING' || hvacState?.status === 'ACTIVE';

  useFrame((_, delta) => {
    if (fansRef.current && isHvacRunning) {
      fansRef.current.children.forEach((fan) => {
        fan.rotation.y += delta * 8;
      });
    }
  });

  return (
    <group position={[0, 0, 24]} name="FacilityZone">
      {/* BLD_HVAC_ZONE1: Air Handling Chiller & Compressor Package */}
      <group 
        position={ovr('BLD_HVAC_ZONE1', [-12, 0, 0])} 
        userData={{ deviceId: 'BLD_HVAC_ZONE1' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('BLD_HVAC_ZONE1'); }}
        
      >
        {/* Chiller Main Enclosure */}
        <mesh position={[0, 2.0, 0]} castShadow>
          <boxGeometry args={[7.2, 4.0, 4.2]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'BLD_HVAC_ZONE1' ? '#3B444C' : '#24292E'} 
            roughness={0.5} 
            metalness={0.5} 
          />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'BLD_HVAC_ZONE1' && (
          <mesh position={[0, 2.0, 0]}>
            <boxGeometry args={[7.5, 4.3, 4.5]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Side Ventilation Louvers */}
        {[-1.6, 1.6].map((lx) => (
          <mesh key={`louv-${lx}`} position={[lx, 1.8, 2.12]}>
            <boxGeometry args={[2.8, 2.4, 0.05]} />
            <meshStandardMaterial color="#1E2327" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}

        {/* Twin Rooftop Condenser Exhaust Fan Cages */}
        <group ref={fansRef} position={[0, 4.2, 0]}>
          {[-1.8, 1.8].map((fx) => (
            <group key={`fan-${fx}`} position={[fx, 0, 0]}>
              {/* Fan Shroud Ring */}
              <mesh>
                <cylinderGeometry args={[1.1, 1.1, 0.4, 24]} />
                <meshStandardMaterial color="#373C40" roughness={0.3} metalness={0.7} />
              </mesh>
              {/* Spinning 4-Blade Fan Propeller */}
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[1.8, 0.05, 0.25]} />
                <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.6} />
              </mesh>
              <mesh position={[0, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[1.8, 0.05, 0.25]} />
                <meshStandardMaterial color="#1E293B" roughness={0.4} metalness={0.6} />
              </mesh>
            </group>
          ))}
        </group>

        {/* HVAC Status Beacon */}
        <mesh position={[0, 4.8, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={
              hvacState?.status === 'FAULT' ? '#EF4444' : 
              hvacState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* BLD_BMS_BATTERY_01: 250 kWh LiFePO4 Energy Storage (BESS) */}
      <group 
        position={ovr('BLD_BMS_BATTERY_01', [2, 0, 0])} 
        userData={{ deviceId: 'BLD_BMS_BATTERY_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('BLD_BMS_BATTERY_01'); }}
        
      >
        {/* BESS Enclosure Container */}
        <mesh position={[0, 1.8, 0]} castShadow>
          <boxGeometry args={[5.2, 3.6, 2.8]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'BLD_BMS_BATTERY_01' ? '#3B444C' : '#20252A'} 
            roughness={0.45} 
            metalness={0.55} 
          />
        </mesh>

        {/* Selected Highlight Wireframe */}
        {selectedDeviceId === 'BLD_BMS_BATTERY_01' && (
          <mesh position={[0, 1.8, 0]}>
            <boxGeometry args={[5.5, 3.9, 3.1]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Safety Decals & Green Branding Band */}
        <mesh position={[0, 2.6, 1.42]}>
          <boxGeometry args={[4.8, 0.25, 0.05]} />
          <meshBasicMaterial color="#22C55E" />
        </mesh>

        {/* Battery Status Beacon */}
        <mesh position={[0, 3.8, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={
              batteryState?.status === 'FAULT' ? '#EF4444' : 
              batteryState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* BLD_SOLAR_PV_01: 150 kW Solar PV Canopy Array */}
      <group 
        position={ovr('BLD_SOLAR_PV_01', [14, 0, 0])} 
        userData={{ deviceId: 'BLD_SOLAR_PV_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('BLD_SOLAR_PV_01'); }}
        
      >
        {/* Steel Canopy Support Posts */}
        {[-3.5, 3.5].map((px) => (
          <group key={`pv-post-${px}`} position={[px, 2.5, 0]}>
            <mesh>
              <cylinderGeometry args={[0.18, 0.18, 5.0, 16]} />
              <meshStandardMaterial color="#4A5568" roughness={0.3} metalness={0.8} />
            </mesh>
          </group>
        ))}

        {/* Angled Photovoltaic Panel Array (Tilted towards South at 22 deg) */}
        <group position={[0, 5.2, 0]} rotation={[0.38, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[11, 0.12, 6.4]} />
            <meshStandardMaterial color="#1E3A8A" roughness={0.15} metalness={0.9} />
          </mesh>

          {/* Aluminium Modular Framing Grid */}
          {selectedDeviceId === 'BLD_SOLAR_PV_01' && (
            <mesh>
              <boxGeometry args={[11.2, 0.2, 6.6]} />
              <meshBasicMaterial color="#E6A23C" wireframe />
            </mesh>
          )}
        </group>

        {/* Inverter Cabinet on Leg */}
        <mesh position={[-3.5, 2.2, 0.4]}>
          <boxGeometry args={[0.8, 1.2, 0.5]} />
          <meshStandardMaterial color="#E6A23C" roughness={0.4} metalness={0.6} />
        </mesh>

        {/* Solar Status Beacon */}
        <mesh position={[0, 6.8, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={
              solarState?.status === 'FAULT' ? '#EF4444' : 
              solarState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>
    </group>
  );
};