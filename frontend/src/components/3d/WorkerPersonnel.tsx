import React from 'react';

export const WorkerPersonnel: React.FC = () => {
  return (
    <group name="WorkerPersonnel">
      {/* Worker 1: QA Inspector at Conveyor Station */}
      <group position={[-16, 0, 8.5]} rotation={[0, -Math.PI / 4, 0]}>
        {/* Steel-Toe Safety Boots */}
        <mesh position={[-0.15, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.32]} />
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </mesh>
        <mesh position={[0.15, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.32]} />
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </mesh>

        {/* Dark Work Trousers */}
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.42, 0.8, 0.26]} />
          <meshStandardMaterial color="#1E293B" roughness={0.7} />
        </mesh>

        {/* High-Vis Orange Safety Vest with Silver Reflective Stripe */}
        <mesh position={[0, 1.25, 0]}>
          <boxGeometry args={[0.48, 0.65, 0.28]} />
          <meshStandardMaterial color="#EA580C" roughness={0.6} />
        </mesh>
        {/* Silver Reflective Bands */}
        <mesh position={[0, 1.25, 0.145]}>
          <planeGeometry args={[0.44, 0.08]} />
          <meshBasicMaterial color="#E2E8F0" />
        </mesh>

        {/* Head & White Safety Hard Hat */}
        <mesh position={[0, 1.68, 0]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.5} />
        </mesh>
        {/* Hard Hat */}
        <mesh position={[0, 1.76, 0]}>
          <sphereGeometry args={[0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.2} metalness={0.3} />
        </mesh>

        {/* Handheld SCADA Diagnostic Tablet */}
        <mesh position={[0.2, 1.15, 0.28]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.28, 0.02, 0.38]} />
          <meshStandardMaterial color="#00D2FF" roughness={0.2} metalness={0.8} />
        </mesh>
      </group>

      {/* Worker 2: Process Maintenance Engineer near Pump & Tank */}
      <group position={[12, 0, -4]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Boots */}
        <mesh position={[-0.15, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.32]} />
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </mesh>
        <mesh position={[0.15, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.32]} />
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </mesh>
        {/* Trousers */}
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.42, 0.8, 0.26]} />
          <meshStandardMaterial color="#1E293B" roughness={0.7} />
        </mesh>
        {/* High-Vis Yellow Safety Vest */}
        <mesh position={[0, 1.25, 0]}>
          <boxGeometry args={[0.48, 0.65, 0.28]} />
          <meshStandardMaterial color="#CA8A04" roughness={0.6} />
        </mesh>
        {/* Hard Hat (Industrial Yellow) */}
        <mesh position={[0, 1.76, 0]}>
          <sphereGeometry args={[0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#FACC15" roughness={0.2} metalness={0.3} />
        </mesh>
      </group>

      {/* Worker 3: Electrical Specialist in Substation Bay */}
      <group position={[6, 0, -22]} rotation={[0, Math.PI / 4, 0]}>
        {/* Boots */}
        <mesh position={[-0.15, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.32]} />
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </mesh>
        <mesh position={[0.15, 0.1, 0]}>
          <boxGeometry args={[0.16, 0.2, 0.32]} />
          <meshStandardMaterial color="#1F2937" roughness={0.8} />
        </mesh>
        {/* Work Overalls */}
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[0.45, 1.4, 0.26]} />
          <meshStandardMaterial color="#1E3A8A" roughness={0.6} />
        </mesh>
        {/* Hard Hat (Blue) */}
        <mesh position={[0, 1.76, 0]}>
          <sphereGeometry args={[0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2563EB" roughness={0.2} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
};