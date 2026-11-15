import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DeviceRuntimeState } from '../../types';

interface ProductionZoneProps {
  devices: Record<string, DeviceRuntimeState>;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  offsets?: Record<string, { x: number; y: number; z: number }>;
}

export const ProductionZone: React.FC<ProductionZoneProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  offsets,
}) => {
  const ovr = (id: string, d: [number, number, number]): [number, number, number] => { const o = offsets?.[id]; return o ? [d[0] + o.x, d[1] + o.y, d[2] + o.z] : d; };
  const rollersRef = useRef<THREE.Group>(null);
  const robotWaistRef = useRef<THREE.Group>(null);
  const robotArmRef = useRef<THREE.Group>(null);
  const palletGroupRef = useRef<THREE.Group>(null);

  const conveyorState = devices['FAC_CONVEYOR_01'];
  const robotState = devices['FAC_ROBOT_01'];
  const motorState = devices['FAC_VFD_MOTOR_01'];

  const isConveyorRunning = conveyorState?.status === 'RUNNING';
  const conveyorSpeed = conveyorState?.telemetry?.speed?.value ?? 1.5;
  const isRobotActive = robotState?.status === 'RUNNING' || robotState?.status === 'ACTIVE';

  useFrame((_, delta) => {
    // Conveyor rollers rotation
    if (rollersRef.current && isConveyorRunning) {
      rollersRef.current.children.forEach((roller) => {
        roller.rotation.x += delta * conveyorSpeed * 4;
      });
    }

    // Parts / Pallet advance on conveyor
    if (palletGroupRef.current && isConveyorRunning) {
      palletGroupRef.current.children.forEach((box) => {
        box.position.x += delta * conveyorSpeed * 1.8;
        if (box.position.x > 8.5) {
          box.position.x = -8.5; // loop back to infeed
        }
      });
    }

    // Robotic arm subtle articulation
    if (robotWaistRef.current && isRobotActive) {
      robotWaistRef.current.rotation.y = Math.sin(Date.now() * 0.001) * 0.45;
    }
    if (robotArmRef.current && isRobotActive) {
      robotArmRef.current.rotation.z = -0.2 + Math.sin(Date.now() * 0.0015) * 0.15;
    }
  });

  return (
    <group position={[-20, 0, 5]} name="ProductionZone">
      {/* FAC_CONVEYOR_01: Main Assembly Line Conveyor */}
      <group 
        position={ovr('FAC_CONVEYOR_01', [0, 0, 0])} 
        userData={{ deviceId: 'FAC_CONVEYOR_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('FAC_CONVEYOR_01'); }}
        
      >
        {/* Conveyor Structural Bed */}
        <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
          <boxGeometry args={[18, 0.35, 2.4]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'FAC_CONVEYOR_01' ? '#3B444C' : '#22272B'} 
            roughness={0.4} 
            metalness={0.7} 
          />
        </mesh>

        {/* Selected Highlight Bracket */}
        {selectedDeviceId === 'FAC_CONVEYOR_01' && (
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[18.4, 0.45, 2.8]} />
            <meshBasicMaterial color="#E6A23C" wireframe />
          </mesh>
        )}

        {/* Support Legs */}
        {[-8, -4, 0, 4, 8].map((lx) => (
          <group key={`conv-leg-${lx}`} position={[lx, 0.35, 0]}>
            <mesh position={[0, 0, 1.05]}>
              <boxGeometry args={[0.2, 0.7, 0.2]} />
              <meshStandardMaterial color="#2D3338" roughness={0.5} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, -1.05]}>
              <boxGeometry args={[0.2, 0.7, 0.2]} />
              <meshStandardMaterial color="#2D3338" roughness={0.5} metalness={0.6} />
            </mesh>
          </group>
        ))}

        {/* Dynamic Rotating Rollers */}
        <group ref={rollersRef} position={[0, 0.95, 0]}>
          {Array.from({ length: 24 }).map((_, i) => (
            <mesh key={`roller-${i}`} position={[-8.2 + i * 0.72, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 2.2, 16]} />
              <meshStandardMaterial color="#94A3B8" roughness={0.2} metalness={0.9} />
            </mesh>
          ))}
        </group>

        {/* Conveyor Moving Pallets / Workpieces */}
        <group ref={palletGroupRef} position={[0, 1.25, 0]}>
          {[-6, -1.5, 3, 7.5].map((bx, i) => (
            <group key={`crate-${i}`} position={[bx, 0, 0]}>
              {/* Wooden Pallet */}
              <mesh position={[0, -0.1, 0]}>
                <boxGeometry args={[1.2, 0.12, 1.2]} />
                <meshStandardMaterial color="#8D6E63" roughness={0.8} metalness={0.1} />
              </mesh>
              {/* Workpiece / Machined Housing */}
              <mesh position={[0, 0.25, 0]} castShadow>
                <boxGeometry args={[0.9, 0.6, 0.9]} />
                <meshStandardMaterial color="#4A5568" roughness={0.3} metalness={0.8} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Status Indicator Beacon */}
        <mesh position={[9.1, 1.3, 1.1]}>
          <cylinderGeometry args={[0.08, 0.08, 0.4, 12]} />
          <meshBasicMaterial 
            color={
              conveyorState?.status === 'FAULT' ? '#EF4444' : 
              conveyorState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* FAC_VFD_MOTOR_01: Induction Drive Motor */}
      <group 
        position={ovr('FAC_VFD_MOTOR_01', [-9.6, 0.6, 1.6])} 
        userData={{ deviceId: 'FAC_VFD_MOTOR_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('FAC_VFD_MOTOR_01'); }}
        
      >
        {/* Motor Stator Housing with Cooling Fins */}
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.42, 0.42, 1.1, 24]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'FAC_VFD_MOTOR_01' ? '#3B444C' : '#1E293B'} 
            roughness={0.4} 
            metalness={0.6} 
          />
        </mesh>
        {/* Terminal Connection Box */}
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[0.4, 0.22, 0.35]} />
          <meshStandardMaterial color="#373C40" roughness={0.5} metalness={0.5} />
        </mesh>
        {/* Drive Shaft & Flange Coupling */}
        <mesh position={[0.65, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.3, 16]} />
          <meshStandardMaterial color="#A0AEC0" roughness={0.2} metalness={0.9} />
        </mesh>

        {/* Motor Status Beacon */}
        <mesh position={[0, 0.68, 0]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial 
            color={
              motorState?.status === 'FAULT' ? '#EF4444' : 
              motorState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* FAC_ROBOT_01: 6-DOF Articulated Assembly Robot */}
      <group 
        position={ovr('FAC_ROBOT_01', [2.5, 0, -3.2])} 
        userData={{ deviceId: 'FAC_ROBOT_01' }}
        onClick={(e) => { e.stopPropagation(); onSelectDevice('FAC_ROBOT_01'); }}
        
      >
        {/* Heavy Cast Robot Base */}
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[1.1, 1.3, 0.4, 32]} />
          <meshStandardMaterial 
            color={selectedDeviceId === 'FAC_ROBOT_01' ? '#4A5156' : '#272B2E'} 
            roughness={0.5} 
            metalness={0.7} 
          />
        </mesh>

        {/* Rotating Waist Pedestal */}
        <group ref={robotWaistRef} position={[0, 0.6, 0]}>
          <mesh castShadow position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.75, 0.9, 0.8, 24]} />
            <meshStandardMaterial color="#E6A23C" roughness={0.35} metalness={0.4} />
          </mesh>

          {/* Lower Arm Joint */}
          <group position={[0, 0.8, 0]}>
            <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.45, 0.45, 0.8, 20]} />
              <meshStandardMaterial color="#1E2328" roughness={0.4} metalness={0.8} />
            </mesh>

            {/* Articulating Upper Arm */}
            <group ref={robotArmRef} position={[0, 0, 0]}>
              <mesh position={[0, 1.8, 0]} castShadow>
                <boxGeometry args={[0.65, 3.6, 0.65]} />
                <meshStandardMaterial color="#E6A23C" roughness={0.35} metalness={0.4} />
              </mesh>

              {/* Forearm & Wrist Joint */}
              <group position={[0, 3.6, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.38, 0.38, 0.7, 16]} />
                  <meshStandardMaterial color="#1E2328" roughness={0.4} metalness={0.8} />
                </mesh>
                <mesh position={[1.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.25, 0.32, 2.4, 16]} />
                  <meshStandardMaterial color="#373C40" roughness={0.3} metalness={0.7} />
                </mesh>

                {/* Gripper Tool Head */}
                <group position={[2.7, 0, 0]}>
                  <mesh>
                    <boxGeometry args={[0.35, 0.6, 0.6]} />
                    <meshStandardMaterial color="#E6A23C" roughness={0.4} metalness={0.5} />
                  </mesh>
                  {/* Pneumatic Fingers */}
                  <mesh position={[0.25, 0.18, 0]}>
                    <boxGeometry args={[0.4, 0.1, 0.2]} />
                    <meshStandardMaterial color="#A0AEC0" roughness={0.2} metalness={0.9} />
                  </mesh>
                  <mesh position={[0.25, -0.18, 0]}>
                    <boxGeometry args={[0.4, 0.1, 0.2]} />
                    <meshStandardMaterial color="#A0AEC0" roughness={0.2} metalness={0.9} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>

        {/* Safety Interlock Perimeter Fence */}
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.8, -2.6]}>
            <boxGeometry args={[5.2, 1.6, 0.05]} />
            <meshBasicMaterial color="#E6A23C" wireframe opacity={0.4} transparent />
          </mesh>
          <mesh position={[-2.6, 0.8, 0]}>
            <boxGeometry args={[0.05, 1.6, 5.2]} />
            <meshBasicMaterial color="#E6A23C" wireframe opacity={0.4} transparent />
          </mesh>
        </group>

        {/* Robot Status Beacon */}
        <mesh position={[0, 5.8, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial 
            color={
              robotState?.status === 'FAULT' ? '#EF4444' : 
              robotState?.status === 'WARNING' ? '#E6A23C' : '#22C55E'
            } 
          />
        </mesh>
      </group>

      {/* Industrial CNC Machining Center */}
      <group position={[-6, 0, -4]}>
        <mesh position={[0, 1.8, 0]} castShadow>
          <boxGeometry args={[4.2, 3.6, 3.8]} />
          <meshStandardMaterial color="#20252A" roughness={0.45} metalness={0.6} />
        </mesh>
        {/* Safety Glass Viewing Window */}
        <mesh position={[0, 2.1, 1.92]}>
          <planeGeometry args={[2.4, 1.8]} />
          <meshStandardMaterial color="#374151" roughness={0.1} metalness={0.9} transparent opacity={0.7} />
        </mesh>
        {/* CNC Control Console Panel */}
        <mesh position={[1.8, 1.9, 1.95]}>
          <boxGeometry args={[0.7, 1.1, 0.25]} />
          <meshStandardMaterial color="#E6A23C" roughness={0.4} metalness={0.5} />
        </mesh>
        {/* Tri-Color Stack Light */}
        <group position={[-1.7, 3.8, 1.5]}>
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
            <meshBasicMaterial color="#EF4444" />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
            <meshBasicMaterial color="#E6A23C" />
          </mesh>
          <mesh position={[0, -0.05, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
            <meshBasicMaterial color="#22C55E" />
          </mesh>
        </group>
      </group>

      {/* Warehouse Forklift (Parked at Staging Bay) */}
      <group position={[7, 0, 4.5]} rotation={[0, -Math.PI / 4, 0]}>
        {/* Chassis Body */}
        <mesh position={[0, 0.65, 0]} castShadow>
          <boxGeometry args={[2.2, 0.8, 1.2]} />
          <meshStandardMaterial color="#E6A23C" roughness={0.35} metalness={0.4} />
        </mesh>
        {/* Rear Counterweight */}
        <mesh position={[-0.9, 0.75, 0]}>
          <boxGeometry args={[0.5, 0.9, 1.15]} />
          <meshStandardMaterial color="#1E2328" roughness={0.6} metalness={0.7} />
        </mesh>
        {/* Overhead Safety Roll Cage */}
        <mesh position={[0, 1.6, 0]}>
          <boxGeometry args={[1.3, 1.1, 1.1]} />
          <meshStandardMaterial color="#2C3237" wireframe />
        </mesh>
        {/* Mast Rails */}
        <mesh position={[1.15, 1.4, 0]}>
          <boxGeometry args={[0.15, 2.4, 0.9]} />
          <meshStandardMaterial color="#2C3237" roughness={0.4} metalness={0.8} />
        </mesh>
        {/* Forks */}
        <mesh position={[1.8, 0.12, 0.3]}>
          <boxGeometry args={[1.2, 0.06, 0.15]} />
          <meshStandardMaterial color="#373C40" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[1.8, 0.12, -0.3]}>
          <boxGeometry args={[1.2, 0.06, 0.15]} />
          <meshStandardMaterial color="#373C40" roughness={0.3} metalness={0.8} />
        </mesh>
        {/* Heavy Rubber Wheels */}
        {[-0.6, 0.8].map((wx) => (
          <React.Fragment key={`forklift-wh-${wx}`}>
            <mesh position={[wx, 0.32, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.32, 0.32, 0.22, 16]} />
              <meshStandardMaterial color="#181A1C" roughness={0.9} metalness={0.1} />
            </mesh>
            <mesh position={[wx, 0.32, -0.62]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.32, 0.32, 0.22, 16]} />
              <meshStandardMaterial color="#181A1C" roughness={0.9} metalness={0.1} />
            </mesh>
          </React.Fragment>
        ))}
      </group>
    </group>
  );
};