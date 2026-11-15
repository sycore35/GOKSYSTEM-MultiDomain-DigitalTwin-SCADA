import React from 'react';

/** Sade, açık renkli tesis kabuğu: kolonlar yalnızca çevrede, boru köprüsü düşük; bölge zeminleri Scene.tsx'te çizilir. */
export const FactoryArchitecture: React.FC = () => {
  return (
    <group name="FactoryArchitecture">
      {[-46, -23, 0, 23, 46].map((x) => (
        <group key={x}>
          {[-40, 40].map((z) => (
            <group key={z} position={[x, 0, z]}>
              <mesh position={[0, 4, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.7, 8, 0.7]} />
                <meshStandardMaterial color="#9AA2AA" roughness={0.7} metalness={0.1} />
              </mesh>
              <mesh position={[0, 0.1, 0]} receiveShadow>
                <boxGeometry args={[1.5, 0.2, 1.5]} />
                <meshStandardMaterial color="#8A929A" roughness={0.8} metalness={0.1} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* Boru köprüsü (proses bölgesinden merkeze) */}
      <group position={[2, 4.2, -15]}>
        <mesh castShadow><boxGeometry args={[40, 0.3, 1.0]} /><meshStandardMaterial color="#8A929A" roughness={0.7} metalness={0.1} /></mesh>
        {[-18, 0, 18].map((px) => (
          <mesh key={px} position={[px, -2.1, 0]} castShadow><boxGeometry args={[0.35, 4.2, 0.9]} /><meshStandardMaterial color="#8A929A" roughness={0.7} metalness={0.1} /></mesh>
        ))}
        {[[-0.25, 0.16, '#7B8794'], [0.1, 0.2, '#6E7C8B'], [0.4, 0.14, '#8793A0']].map(([z, r, c], i) => (
          <mesh key={i} position={[0, 0.45, z as number]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[r as number, r as number, 40, 16]} />
            <meshStandardMaterial color={c as string} roughness={0.5} metalness={0.2} />
          </mesh>
        ))}
      </group>
    </group>
  );
};
