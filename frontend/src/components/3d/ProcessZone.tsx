import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Asset, B, CARD_PROJECT, Cy, Elbow, FieldPanel, M, Pipe, StackLight, ZoneProps, tel, useSmoothed } from './parts';

/** Proses: karıştırıcılı reaktör tankı, santrifüj pompa, pnömatik kontrol vanası ve aralarındaki boru hattı. */

const SHELL_Y0 = 1.4, SHELL_H = 3.6, R = 1.6;

/** Dairesel platform korkuluğu: yay boyunca dikmeler ve iki kat ray (ψ dünya açısı, radyan). */
const PlatformRail: React.FC<{ y: number; r: number; from: number; to: number; n?: number }> = ({ y, r, from, to, n = 9 }) => {
  const pts = Array.from({ length: n + 1 }, (_, i) => from + (to - from) * i / n).map(a => [Math.cos(a) * r, Math.sin(a) * r] as [number, number]);
  return (
    <group position={[0, y, 0]}>
      {pts.map(([x, z], i) => <B key={i} p={[x, 0.5, z]} s={[0.04, 1.0, 0.04]} m={M.safety} cast={false} />)}
      {pts.slice(1).map(([x, z], i) => {
        const [px, pz] = pts[i]; const len = Math.hypot(x - px, z - pz);
        return [0.5, 1.0].map(h => <B key={`${i}-${h}`} p={[(x + px) / 2, h, (z + pz) / 2]} r={[0, -Math.atan2(z - pz, x - px), 0]} s={[len, 0.04, 0.04]} m={M.safety} cast={false} />);
      })}
    </group>
  );
};

const Tank: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const level = useSmoothed(Math.max(0, Math.min(100, tel(devices, 'PROC_TANK_01', 'level_pct'))), 2);
  const status = devices.PROC_TANK_01?.status;
  const liquid = useRef<THREE.Mesh>(null);
  const surface = useRef<THREE.Mesh>(null);
  const impeller = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const h = Math.max(0.02, SHELL_H * level.current / 100);
    if (liquid.current) { liquid.current.scale.y = h; liquid.current.position.y = SHELL_Y0 + h / 2; }
    if (surface.current) surface.current.position.y = SHELL_Y0 + h;
    if (impeller.current) impeller.current.rotation.y += dt * 2.2;
  });
  return (
    <group>
      {/* ayaklar ve çaprazlar */}
      {[0, 1, 2, 3].map(k => {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        return <group key={k}><B p={[Math.cos(a) * 1.35, 0.8, Math.sin(a) * 1.35]} s={[0.16, 1.6, 0.16]} m={M.galvanized} /><B p={[Math.cos(a) * 1.35, 0.02, Math.sin(a) * 1.35]} s={[0.4, 0.04, 0.4]} m={M.galvanized} /></group>;
      })}
      {/* gövde (yarı saydam) + başlıklar */}
      <mesh position={[0, SHELL_Y0 + SHELL_H / 2, 0]} material={M.shellGlass}><cylinderGeometry args={[R, R, SHELL_H, 40, 1, true]} /></mesh>
      <mesh position={[0, SHELL_Y0, 0]} scale={[1, 0.32, 1]} material={M.stainless} castShadow><sphereGeometry args={[R, 36, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /></mesh>
      <mesh position={[0, SHELL_Y0 + SHELL_H, 0]} scale={[1, 0.32, 1]} material={M.stainless} castShadow><sphereGeometry args={[R, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      {[0.6, 1.8, 3.0].map(y => <mesh key={y} position={[0, SHELL_Y0 + y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.stainless}><torusGeometry args={[R + 0.01, 0.035, 8, 48]} /></mesh>)}
      {/* sıvı: gerçek seviyeyle yükselir */}
      <mesh ref={liquid} position={[0, SHELL_Y0 + 1, 0]} material={M.liquid}><cylinderGeometry args={[R - 0.05, R - 0.05, 1, 40]} /></mesh>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} position={[0, SHELL_Y0 + 1, 0]}><circleGeometry args={[R - 0.05, 40]} /><meshStandardMaterial color="#5FB0CF" roughness={0.1} metalness={0.2} transparent opacity={0.9} /></mesh>
      {/* karıştırıcı: motor, dişli kutusu, mil, pervane */}
      <Cy p={[0, SHELL_Y0 + SHELL_H + 0.75, 0]} rt={0.24} h={0.5} m={M.motor} />
      <B p={[0, SHELL_Y0 + SHELL_H + 0.4, 0]} s={[0.5, 0.25, 0.5]} m={M.motor} />
      <group ref={impeller}>
        <Cy p={[0, SHELL_Y0 + SHELL_H / 2 + 0.3, 0]} rt={0.04} h={SHELL_H} m={M.stainless} cast={false} />
        {[0, 1, 2, 3].map(k => <B key={k} p={[Math.cos(k * Math.PI / 2) * 0.35, SHELL_Y0 + 0.5, Math.sin(k * Math.PI / 2) * 0.35]} r={[0.5, -k * Math.PI / 2, 0]} s={[0.55, 0.03, 0.16]} m={M.stainless} cast={false} />)}
      </group>
      {/* üst platform, korkuluk, merdiven */}
      <mesh position={[0, SHELL_Y0 + SHELL_H + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={M.galvanized}><ringGeometry args={[R - 0.2, R + 0.5, 40, 1, -0.6, 2.3]} /></mesh>
      <PlatformRail y={SHELL_Y0 + SHELL_H + 0.5} r={R + 0.46} from={-1.7} to={0.6} />
      <group position={[R + 0.35, 0, 0.0]}>
        {[-0.22, 0.22].map(z => <B key={z} p={[0, (SHELL_Y0 + SHELL_H + 0.5) / 2, z]} s={[0.05, SHELL_Y0 + SHELL_H + 0.5, 0.05]} m={M.galvanized} />)}
        {Array.from({ length: 16 }, (_, i) => <B key={i} p={[0, 0.3 + i * 0.33, 0]} s={[0.04, 0.03, 0.44]} m={M.galvanized} cast={false} />)}
      </group>
      {/* enstrümanlar: radar seviye vericisi, pH probu, sıcaklık */}
      <Cy p={[0.7, SHELL_Y0 + SHELL_H + 0.55, -0.5]} rt={0.09} rb={0.16} h={0.28} m={M.white} />
      <Cy p={[-R - 0.12, SHELL_Y0 + 1.0, 0.4]} r={[0, 0, Math.PI / 2.4]} rt={0.04} h={0.45} m={M.plastic} />
      <B p={[-R - 0.12, SHELL_Y0 + 1.75, -0.5]} s={[0.16, 0.2, 0.12]} m={M.white} />
      {/* alt çıkış nozulu */}
      <Cy p={[0, 0.98, 0]} rt={0.14} h={0.3} m={M.stainless} />
      <StackLight p={[-0.9, SHELL_Y0 + SHELL_H + 1.0, 1.0]} status={status} />
      <FieldPanel p={[2.6, 0, 2.0]} rotY={-0.5} project={CARD_PROJECT.PROC_TANK_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Pump: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const rpm = tel(devices, 'PROC_PUMP_01', 'rpm');
  const status = devices.PROC_PUMP_01?.status;
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.x += Math.min(rpm / 60, 2.2) * Math.PI * 2 * dt; });
  return (
    <group>
      <B p={[0, 0.07, 0]} s={[2.1, 0.14, 0.75]} m={M.machineDark} recv />
      {/* motor (-x) */}
      <group position={[-0.55, 0.52, 0]}>
        <Cy r={[0, 0, Math.PI / 2]} rt={0.27} h={0.8} m={M.motor} />
        {Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2).map(a => <B key={a} p={[0, Math.cos(a) * 0.28, Math.sin(a) * 0.28]} r={[a, 0, 0]} s={[0.72, 0.045, 0.02]} m={M.motor} cast={false} />)}
        <Cy p={[-0.5, 0, 0]} r={[0, 0, Math.PI / 2]} rt={0.28} h={0.2} m={M.motor} />
        <B p={[0, 0.32, 0]} s={[0.24, 0.12, 0.22]} m={M.motor} />
        <B p={[0, -0.33, 0]} s={[0.6, 0.12, 0.5]} m={M.motor} />
      </group>
      {/* kaplin (döner) ve koruyucu */}
      <group ref={spin} position={[0.0, 0.52, 0]}>
        <Cy r={[0, 0, Math.PI / 2]} rt={0.11} h={0.16} m={M.galvanized} />
        <B p={[0, 0.1, 0]} s={[0.17, 0.04, 0.04]} m={M.black} cast={false} />
      </group>
      <mesh position={[0.0, 0.52, 0]} rotation={[0, 0, Math.PI / 2]} material={M.safety}><cylinderGeometry args={[0.18, 0.18, 0.32, 16, 1, true, 0, Math.PI]} /></mesh>
      {/* yatak gövdesi ve salyangoz */}
      <Cy p={[0.32, 0.52, 0]} r={[0, 0, Math.PI / 2]} rt={0.13} h={0.4} m={M.machine} />
      <B p={[0.32, 0.25, 0]} s={[0.3, 0.3, 0.34]} m={M.machine} />
      <group position={[0.72, 0.56, 0]}>
        <Cy r={[0, 0, Math.PI / 2]} rt={0.38} h={0.32} m={M.machine} />
        <mesh rotation={[0, Math.PI / 2, 0]} material={M.machine}><torusGeometry args={[0.3, 0.12, 12, 28, Math.PI * 1.4]} /></mesh>
        <Cy p={[0.28, 0, 0]} r={[0, 0, Math.PI / 2]} rt={0.13} h={0.26} m={M.machine} />
        <Cy p={[0.43, 0, 0]} r={[0, 0, Math.PI / 2]} rt={0.21} h={0.05} m={M.galvanized} />
        <Cy p={[0, 0.48, 0]} rt={0.11} h={0.24} m={M.machine} />
        <Cy p={[0, 0.62, 0]} rt={0.19} h={0.05} m={M.galvanized} />
      </group>
      <FieldPanel p={[0.32, 0.55, 0.36]} project={CARD_PROJECT.PROC_PUMP_01.smart!} smart />
      <StackLight p={[-1.0, 1.0, -0.3]} status={status} />
      <FieldPanel p={[-0.4, 0, 1.25]} project={CARD_PROJECT.PROC_PUMP_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Valve: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const pos = useSmoothed(Math.max(0, Math.min(100, tel(devices, 'PROC_VALVE_01', 'position_pct'))), 3);
  const status = devices.PROC_VALVE_01?.status;
  const stem = useRef<THREE.Group>(null);
  useFrame(() => { if (stem.current) stem.current.position.y = 0.35 + 0.16 * pos.current / 100; });
  const Y = 2.4;
  return (
    <group>
      {/* boru desteği */}
      <B p={[0, (Y - 0.2) / 2, 0]} s={[0.12, Y - 0.2, 0.12]} m={M.galvanized} />
      <B p={[0, 0.02, 0]} s={[0.4, 0.04, 0.4]} m={M.galvanized} />
      <group position={[0, Y, 0]}>
        {/* glob gövde ve flanşlar (boru ekseni X) */}
        <mesh material={M.machine} castShadow><sphereGeometry args={[0.22, 20, 16]} /></mesh>
        {[-1, 1].map(s => <Cy key={s} p={[s * 0.27, 0, 0]} r={[0, 0, Math.PI / 2]} rt={0.22} h={0.06} m={M.galvanized} />)}
        {/* bonnet, boyunduruk, mil, aktüatör */}
        <Cy p={[0, 0.26, 0]} rt={0.1} h={0.16} m={M.machine} />
        {[-1, 1].map(s => <B key={s} p={[s * 0.11, 0.5, 0]} s={[0.04, 0.4, 0.06]} m={M.machine} />)}
        <group ref={stem}><Cy rt={0.022} h={0.3} m={M.stainless} /><B p={[0, -0.02, 0.05]} s={[0.07, 0.02, 0.06]} m={M.safety} /></group>
        <Cy p={[0, 0.78, 0]} rt={0.32} h={0.12} m={M.motor} />
        <mesh position={[0, 0.84, 0]} scale={[1, 0.45, 1]} material={M.motor}><sphereGeometry args={[0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        {/* pozisyoner */}
        <B p={[0.22, 0.5, 0.0]} s={[0.16, 0.2, 0.14]} m={M.white} />
        <Cy p={[0.31, 0.5, 0]} r={[0, 0, Math.PI / 2]} rt={0.04} h={0.02} m={M.black} />
      </group>
      <StackLight p={[0.5, Y + 1.0, 0]} status={status} />
      <FieldPanel p={[0.1, 0, 1.0]} project={CARD_PROJECT.PROC_VALVE_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

/** Tank → pompa emişi → pompa basma → kontrol vanası → tank üst girişi. */
const Piping: React.FC = () => {
  const r = 0.11;
  return (
    <group>
      <Pipe a={[0, 0.83, 0]} b={[0, 0.5, 0]} r={r} />
      <Elbow p={[0, 0.5, 0]} r={r} />
      <Pipe a={[0, 0.5, 0]} b={[0, 0.5, 2.8]} r={r} />
      <Elbow p={[0, 0.5, 2.8]} r={r} />
      <Pipe a={[0, 0.5, 2.8]} b={[-4.32, 0.56, 2.8]} r={r} />
      <Pipe a={[-4.78, 1.21, 2.8]} b={[-4.78, 2.4, 2.8]} r={r} />
      <Elbow p={[-4.78, 2.4, 2.8]} r={r} />
      <Pipe a={[-4.78, 2.4, 2.8]} b={[-3.6, 2.4, 2.8]} r={r} />
      <Pipe a={[-3.0, 2.4, 2.8]} b={[-2.0, 2.4, 2.8]} r={r} />
      <Elbow p={[-2.0, 2.4, 2.8]} r={r} />
      <Pipe a={[-2.0, 2.4, 2.8]} b={[-2.0, 6.0, 2.8]} r={r} />
      <Elbow p={[-2.0, 6.0, 2.8]} r={r} />
      <Pipe a={[-2.0, 6.0, 2.8]} b={[-2.0, 6.0, 0.6]} r={r} />
      <Elbow p={[-2.0, 6.0, 0.6]} r={r} />
      <Pipe a={[-2.0, 6.0, 0.6]} b={[-0.9, 6.0, 0.6]} r={r} />
      <Elbow p={[-0.9, 6.0, 0.6]} r={r} />
      <Pipe a={[-0.9, 6.0, 0.6]} b={[-0.9, 5.35, 0.6]} r={r} />
      {/* boru askısı */}
      <B p={[-2.0, 1.2, 3.25]} s={[0.1, 2.4, 0.1]} m={M.galvanized} />
      <B p={[-2.0, 2.3, 3.0]} s={[0.1, 0.06, 0.5]} m={M.galvanized} />
    </group>
  );
};

export const ProcessZone: React.FC<ZoneProps> = ({ devices, onSelectDevice, offsets }) => (
  <group position={[18, 0, -8]} name="ProcessZone">
    <Asset id="PROC_TANK_01" p={[0, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Tank devices={devices} /></Asset>
    <Asset id="PROC_PUMP_01" p={[-5.5, 0, 2.8]} offsets={offsets} onSelect={onSelectDevice}><Pump devices={devices} /></Asset>
    <Asset id="PROC_VALVE_01" p={[-3.3, 0, 2.8]} offsets={offsets} onSelect={onSelectDevice}><Valve devices={devices} /></Asset>
    <Piping />
  </group>
);
