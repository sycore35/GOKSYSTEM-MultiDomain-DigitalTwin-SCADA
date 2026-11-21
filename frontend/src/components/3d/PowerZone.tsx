import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Asset, B, CARD_PROJECT, Cy, FieldPanel, M, Pipe, StackLight, ZoneProps, lamp, tel, useSmoothed } from './parts';

/** Elektrik: şalt sahası (çakıl, çit), yağlı trafo, dış tip kesici, 11 kV boru bara — canlı durumla. */

/** Porselen izolatör: diskli gövde + üst bağlantı ucu. */
const Insulator: React.FC<{ p: [number, number, number]; h?: number; discs?: number }> = ({ p, h = 0.9, discs = 7 }) => (
  <group position={p}>
    <Cy p={[0, h / 2, 0]} rt={0.05} h={h} m={M.porcelain} seg={12} />
    {Array.from({ length: discs }, (_, i) => <Cy key={i} p={[0, 0.1 + i * (h - 0.15) / (discs - 1), 0]} rt={0.11} h={0.035} m={M.porcelain} seg={14} cast={false} />)}
    <Cy p={[0, h + 0.04, 0]} rt={0.045} h={0.08} m={M.copper} seg={10} />
  </group>
);

const Transformer: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const oil = tel(devices, 'GRID_TRAFO_01', 'oil_temp_c');
  const hot = tel(devices, 'GRID_TRAFO_01', 'winding_hotspot_c');
  const status = devices.GRID_TRAFO_01?.status;
  const fans = useRef<THREE.Group>(null);
  const stage = oil > 65 ? (hot > 90 ? 2 : 1) : 0;          // kart ladder'ı ile aynı eşikler
  useFrame((_, dt) => { if (fans.current && stage) fans.current.children.forEach(f => { f.rotation.y += dt * 5 * stage; }); });
  const top = 0.3 + 2.2;
  return (
    <group>
      <B p={[0, 0.15, 0]} s={[3.8, 0.3, 2.8]} m={M.concrete} recv />
      <B p={[0, 0.3 + 1.1, 0]} s={[2.4, 2.2, 1.6]} m={M.oil} />
      <B p={[0, top + 0.04, 0]} s={[2.5, 0.08, 1.7]} m={M.oil} />
      {/* radyatör dilimleri ve altındaki fanlar */}
      {[-1, 1].map(s => (
        <group key={s} position={[0, 0.3, s * 1.18]}>
          {Array.from({ length: 12 }, (_, i) => <B key={i} p={[-1.0 + i * 0.18, 1.05, 0]} s={[0.04, 1.7, 0.6]} m={M.oil} cast={false} />)}
          <B p={[0, 1.95, 0]} s={[2.1, 0.08, 0.12]} m={M.oil} />
          <B p={[0, 0.15, 0]} s={[2.1, 0.08, 0.12]} m={M.oil} />
        </group>
      ))}
      <group ref={fans}>
        {[-0.6, 0.6].flatMap(x => [-1, 1].map(s => (
          <group key={`${x}${s}`} position={[x, 0.32, s * 1.18]}>
            {[0, 1, 2].map(k => <B key={k} r={[0, (k * Math.PI) / 1.5, 0]} s={[0.36, 0.015, 0.07]} m={M.machineDark} cast={false} />)}
          </group>
        )))}
      </group>
      {[-0.6, 0.6].flatMap(x => [-1, 1].map(s => <mesh key={`r${x}${s}`} position={[x, 0.33, s * 1.18]} rotation={[Math.PI / 2, 0, 0]} material={M.galvanized}><torusGeometry args={[0.2, 0.012, 6, 20]} /></mesh>))}
      {/* YG buşingleri (3), AG buşingleri (4) */}
      {[-0.65, 0, 0.65].map(x => <Insulator key={x} p={[x, top + 0.08, -0.4]} h={1.0} discs={8} />)}
      {[-0.75, -0.25, 0.25, 0.75].map(x => <Insulator key={x} p={[x, top + 0.08, 0.5]} h={0.4} discs={3} />)}
      {/* genleşme tankı + Buchholz borusu */}
      {[0.3, 1.1].map(x => <B key={x} p={[x, top + 0.45, 0.15]} s={[0.08, 0.9, 0.08]} m={M.oil} />)}
      <Cy p={[0.7, top + 1.05, 0.15]} r={[0, 0, Math.PI / 2]} rt={0.28} h={1.3} m={M.oil} />
      <Pipe a={[0.2, top + 0.06, 0.15]} b={[0.2, top + 0.85, 0.15]} r={0.04} m={M.oil} flanges={false} />
      <B p={[0.2, top + 0.45, 0.15]} s={[0.16, 0.14, 0.14]} m={M.machine} />
      {/* kumanda kutusu, ikaz levhası */}
      <B p={[1.35, 1.1, 0]} s={[0.12, 0.8, 0.6]} m={M.cabinet} />
      <mesh position={[0, 1.6, 0.81]}><circleGeometry args={[0.16, 3]} /><meshStandardMaterial color="#D2A231" /></mesh>
      <StackLight p={[-1.3, top + 0.4, 0.7]} status={status} />
      <FieldPanel p={[1.6, 0, 1.75]} project={CARD_PROJECT.GRID_TRAFO_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Breaker: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const closed = tel(devices, 'GRID_BREAKER_01', 'state', 1) > 0.5;
  const tripped = tel(devices, 'GRID_BREAKER_01', 'tripped_ansi_code') > 0.5;
  const ang = useSmoothed(closed ? 0 : 1, 4);
  const blades = useRef<THREE.Group>(null);
  const status = devices.GRID_BREAKER_01?.status;
  useFrame(() => { if (blades.current) blades.current.children.forEach(b => { b.rotation.z = -ang.current * 1.1; }); });
  const H = 2.2;
  return (
    <group>
      <B p={[0, 0.12, 0]} s={[1.6, 0.24, 2.4]} m={M.concrete} recv />
      {[-0.6, 0.6].flatMap(x => [-1, 1].map(z => <B key={`${x}${z}`} p={[x, H / 2, z * 0.9]} s={[0.12, H, 0.12]} m={M.galvanized} />))}
      <B p={[0, H, 0]} s={[1.5, 0.12, 2.1]} m={M.galvanized} />
      {/* işletme mekanizması dolabı ve konum bayrağı */}
      <B p={[0, 1.15, 1.0]} s={[0.8, 0.9, 0.35]} m={M.cabinet} />
      <mesh position={[0.18, 1.3, 1.18]} material={closed ? lamp(true, 'red') : lamp(true, 'green')}><planeGeometry args={[0.16, 0.16]} /></mesh>
      <mesh position={[-0.15, 1.3, 1.18]} material={lamp(tripped, 'amber')}><circleGeometry args={[0.05, 12]} /></mesh>
      {/* üç kutup: kesici hücresi + hareketli kontak bıçağı (açıkken kalkar) */}
      <group ref={blades}>
        {[-0.65, 0, 0.65].map(z => (
          <group key={z} position={[0.35, H + 1.1, z]}>
            <B p={[-0.35, 0, 0]} s={[0.7, 0.05, 0.05]} m={M.copper} />
          </group>
        ))}
      </group>
      {[-0.65, 0, 0.65].map(z => (
        <group key={z}>
          <Insulator p={[0.35, H + 0.06, z]} h={1.0} discs={7} />
          <Insulator p={[-0.35, H + 0.06, z]} h={1.0} discs={7} />
          <Cy p={[0.35, H + 1.2, z]} rt={0.09} h={0.18} m={M.galvanized} />
          <Cy p={[-0.35, H + 1.2, z]} rt={0.09} h={0.18} m={M.galvanized} />
        </group>
      ))}
      <StackLight p={[0.6, H + 0.5, 1.2]} status={status} />
      <FieldPanel p={[1.3, 0, 1.4]} rotY={-0.4} project={CARD_PROJECT.GRID_BREAKER_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Busbar: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const status = devices.GRID_BUSBAR_11KV?.status;
  const kv = tel(devices, 'GRID_BUSBAR_11KV', 'voltage_kv');
  const H = 5.0;
  return (
    <group>
      {/* çelik portal */}
      {[-2.6, 2.6].map(z => (
        <group key={z} position={[0, 0, z]}>
          <B p={[0, 0.15, 0]} s={[0.8, 0.3, 0.8]} m={M.concrete} />
          {[-0.18, 0.18].flatMap(x => [-0.18, 0.18].map(zz => <B key={`${x}${zz}`} p={[x, H / 2, zz]} s={[0.06, H, 0.06]} m={M.galvanized} />))}
          {Array.from({ length: 8 }, (_, i) => <B key={i} p={[0, 0.5 + i * 0.6, 0]} r={[0, 0, i % 2 ? 0.7 : -0.7]} s={[0.5, 0.03, 0.4]} m={M.galvanized} cast={false} />)}
        </group>
      ))}
      <B p={[0, H, 0]} s={[0.4, 0.3, 5.6]} m={M.galvanized} />
      {/* izolatörler üzerinde üç faz boru bara (Z ekseni) */}
      {[-0.7, 0, 0.7].map(x => (
        <group key={x}>
          {[-2.0, 0, 2.0].map(z => <Insulator key={z} p={[x, H + 0.15, z]} h={0.75} discs={6} />)}
          <Cy p={[x, H + 0.98, 0]} r={[Math.PI / 2, 0, 0]} rt={0.05} h={5.2} m={M.copper} seg={12} />
        </group>
      ))}
      {/* gerilim gösterge lambaları (bara enerjili) */}
      {[-0.7, 0, 0.7].map(x => <mesh key={x} position={[x, H - 0.25, 2.85]} material={lamp(kv > 1, 'amber')}><sphereGeometry args={[0.06, 10, 8]} /></mesh>)}
      <StackLight p={[0.5, H + 0.2, -2.9]} status={status} />
      <FieldPanel p={[1.2, 0, 2.4]} rotY={-0.6} project={CARD_PROJECT.GRID_BUSBAR_11KV.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

/** Şalt sahası: çakıl zemin, tel çit, iletkenler. */
const Yard: React.FC = () => {
  const W = 20, D = 9, cx = 6;
  const posts: [number, number][] = [];
  for (let x = -W / 2; x <= W / 2 + 0.01; x += 2.5) posts.push([cx + x, -D / 2], [cx + x, D / 2]);
  for (let z = -D / 2 + 2.25; z < D / 2; z += 2.25) posts.push([cx - W / 2, z], [cx + W / 2, z]);
  return (
    <group>
      <mesh position={[cx, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.gravel} receiveShadow><planeGeometry args={[W, D]} /></mesh>
      {posts.map(([x, z], i) => <B key={i} p={[x, 1.1, z]} s={[0.06, 2.2, 0.06]} m={M.galvanized} cast={false} />)}
      <mesh position={[cx, 1.05, -D / 2]} material={M.fence}><planeGeometry args={[W, 2.0]} /></mesh>
      <mesh position={[cx - W / 2, 1.05, 0]} rotation={[0, Math.PI / 2, 0]} material={M.fence}><planeGeometry args={[D, 2.0]} /></mesh>
      <mesh position={[cx + W / 2, 1.05, 0]} rotation={[0, Math.PI / 2, 0]} material={M.fence}><planeGeometry args={[D, 2.0]} /></mesh>
      {[-1, 1].map(s => <mesh key={s} position={[cx + s * (W / 4 + 1), 1.05, D / 2]} material={M.fence}><planeGeometry args={[W / 2 - 2, 2.0]} /></mesh>)}
      {/* trafo YG buşingleri → kesici → bara: üç faz iletken */}
      {[-0.65, 0, 0.65].map((dz, i) => (
        <group key={i}>
          <Pipe a={[[-0.65, 0, 0.65][i], 3.66, -0.4]} b={[7.15, 3.42, dz]} r={0.018} m={M.copper} flanges={false} />
          <Pipe a={[7.85, 3.42, dz]} b={[12 + [-0.7, 0, 0.7][i], 5.98, dz]} r={0.018} m={M.copper} flanges={false} />
        </group>
      ))}
    </group>
  );
};

export const PowerZone: React.FC<ZoneProps> = ({ devices, onSelectDevice, offsets }) => (
  <group position={[-5, 0, -26]} name="PowerZone">
    <Yard />
    <Asset id="GRID_TRAFO_01" p={[0, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Transformer devices={devices} /></Asset>
    <Asset id="GRID_BREAKER_01" p={[7.5, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Breaker devices={devices} /></Asset>
    <Asset id="GRID_BUSBAR_11KV" p={[12, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Busbar devices={devices} /></Asset>
  </group>
);
