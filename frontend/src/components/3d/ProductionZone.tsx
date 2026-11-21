import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Asset, B, CARD_PROJECT, Cy, FieldPanel, M, StackLight, ZoneProps, lamp, tel, useSmoothed } from './parts';

/** Üretim hattı: bant konveyör, tahrik motoru (VFD), 6 eksenli robot hücresi, CNC ve forklift — canlı telemetriyle. */

const D2R = Math.PI / 180;

const Conveyor: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const speed = tel(devices, 'FAC_CONVEYOR_01', 'speed');
  const cord = tel(devices, 'FAC_CONVEYOR_01', 'pull_cord_tripped') > 0.5;
  const status = devices.FAC_CONVEYOR_01?.status;
  const products = useRef<THREE.Group>(null);
  const pulleys = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (products.current) products.current.children.forEach(c => { c.position.x += speed * dt; if (c.position.x > 8.4) c.position.x -= 16.8; });
    if (pulleys.current) pulleys.current.children.forEach(c => { c.rotation.y -= speed / 0.17 * dt; });
  });
  const L = 18;
  return (
    <group>
      {/* gövde: C profiller, ayaklar, çaprazlar */}
      {[-1, 1].map(s => <B key={s} p={[0, 0.86, s * 0.98]} s={[L, 0.24, 0.07]} m={M.machine} />)}
      {[-8, -4, 0, 4, 8].map(x => (
        <group key={x} position={[x, 0, 0]}>
          {[-1, 1].map(s => <group key={s}><B p={[0, 0.38, s * 0.9]} s={[0.09, 0.76, 0.09]} m={M.machine} /><B p={[0, 0.01, s * 0.9]} s={[0.22, 0.02, 0.22]} m={M.galvanized} /></group>)}
          <B p={[0, 0.3, 0]} s={[0.06, 0.06, 1.8]} m={M.machineDark} />
        </group>
      ))}
      {/* bant (üst ve dönüş) */}
      <B p={[0, 0.99, 0]} s={[L - 0.2, 0.03, 1.8]} m={M.rubber} recv />
      <B p={[0, 0.64, 0]} s={[L - 0.4, 0.02, 1.7]} m={M.rubber} />
      {/* baş ve kuyruk tamburları */}
      <group ref={pulleys}>
        {[-L / 2 + 0.1, L / 2 - 0.1].map(x => (
          <group key={x} position={[x, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh material={M.galvanized} castShadow><cylinderGeometry args={[0.17, 0.17, 1.84, 20]} /></mesh>
            <B s={[0.05, 1.86, 0.33]} m={M.machineDark} cast={false} />
          </group>
        ))}
      </group>
      {/* yan korkuluklar */}
      {[-1, 1].map(s => <group key={s}>
        <B p={[0, 1.22, s * 0.95]} s={[L - 0.6, 0.04, 0.04]} m={M.galvanized} />
        {[-8, -4, 0, 4, 8].map(x => <B key={x} p={[x, 1.1, s * 0.95]} s={[0.04, 0.24, 0.04]} m={M.galvanized} />)}
      </group>)}
      {/* acil çekme ipi: tetiklenince kırmızı */}
      {[-8.5, -4.25, 0, 4.25, 8.5].map(x => <B key={x} p={[x, 0.75, 1.32]} s={[0.05, 1.5, 0.05]} m={M.safety} />)}
      <mesh position={[0, 1.42, 1.32]} rotation={[0, 0, Math.PI / 2]} material={cord ? lamp(true, 'red') : M.safety}><cylinderGeometry args={[0.018, 0.018, 17, 6]} /></mesh>
      <B p={[-8.5, 1.42, 1.38]} s={[0.16, 0.22, 0.1]} m={M.safety} />
      {/* giriş fotoseli */}
      {[-1, 1].map(s => <B key={s} p={[-7.4, 1.18, s * 1.06]} s={[0.08, 0.14, 0.08]} m={M.plastic} />)}
      <mesh position={[-7.4, 1.18, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.006, 0.006, 2.1, 4]} /><meshBasicMaterial color="#E5484D" transparent opacity={0.5} /></mesh>
      {/* ürünler: palet + işlenmiş gövde, gerçek bant hızıyla akar */}
      <group ref={products}>
        {[-7, -3.6, -0.2, 3.2, 6.6].map((x, i) => (
          <group key={i} position={[x, 1.01, 0]}>
            <B p={[0, 0.05, 0]} s={[0.9, 0.1, 0.9]} m={M.wood} />
            <B p={[0, 0.34, 0]} s={[0.62, 0.46, 0.62]} m={M.product} />
            <Cy p={[0, 0.6, 0]} rt={0.14} h={0.08} m={M.stainless} />
          </group>
        ))}
      </group>
      {/* tahrik dişli kutusu (baş tamburu) */}
      <B p={[-L / 2 + 0.1, 0.82, 1.3]} s={[0.5, 0.42, 0.5]} m={M.motor} />
      <StackLight p={[L / 2 - 0.3, 1.55, -1.1]} status={status} />
      <FieldPanel p={[5.6, 0, 1.75]} project={CARD_PROJECT.FAC_CONVEYOR_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Motor: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const rpm = tel(devices, 'FAC_VFD_MOTOR_01', 'rpm');
  const status = devices.FAC_VFD_MOTOR_01?.status;
  const spin = useRef<THREE.Group>(null);
  const fan = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const w = Math.min(rpm / 60, 2.2) * Math.PI * 2 * dt;      // görsel hız sınırlı (yüksek devirde örnekleme kırılmasın)
    if (spin.current) spin.current.rotation.y += w;
    if (fan.current) fan.current.rotation.z += w;
  });
  const fins = useMemo(() => Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2), []);
  return (
    <group>
      <B p={[0, 0.25, 0]} s={[0.8, 0.5, 1.0]} m={M.machineDark} recv />
      <group position={[0, 0.82, 0]}>
        {/* gövde (eksen Z: dişli kutusuna doğru) */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={M.motor} castShadow><cylinderGeometry args={[0.3, 0.3, 0.82, 28]} /></mesh>
        {fins.map(a => <B key={a} p={[Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0]} r={[0, 0, a]} s={[0.05, 0.02, 0.74]} m={M.motor} cast={false} />)}
        {/* fan kapağı ve dönen fan */}
        <mesh position={[0, 0, 0.53]} rotation={[Math.PI / 2, 0, 0]} material={M.motor}><cylinderGeometry args={[0.31, 0.31, 0.24, 28, 1, true]} /></mesh>
        <mesh position={[0, 0, 0.66]} rotation={[0, 0, 0]}><torusGeometry args={[0.25, 0.012, 6, 28]} /><meshStandardMaterial color="#2C3135" /></mesh>
        <mesh position={[0, 0, 0.66]}><torusGeometry args={[0.14, 0.012, 6, 20]} /><meshStandardMaterial color="#2C3135" /></mesh>
        <group ref={fan} position={[0, 0, 0.6]}>
          {[0, 1, 2, 3, 4, 5].map(k => <B key={k} r={[0, 0, (k * Math.PI) / 3]} p={[Math.cos((k * Math.PI) / 3) * 0.13, Math.sin((k * Math.PI) / 3) * 0.13, 0]} s={[0.22, 0.05, 0.015]} m={M.plastic} cast={false} />)}
        </group>
        {/* klemens kutusu ve kablo borusu */}
        <B p={[0, 0.36, 0.05]} s={[0.24, 0.14, 0.3]} m={M.motor} />
        <Cy p={[0.16, 0.36, 0.05]} r={[0, 0, Math.PI / 2]} rt={0.03} h={0.1} m={M.plastic} />
        {/* mil, dönen kaplin ve emniyet sarısı kaplin koruyucusu */}
        <group ref={spin} position={[0, 0, -0.62]} rotation={[Math.PI / 2, 0, 0]}>
          <Cy rt={0.05} h={0.42} m={M.stainless} />
          <Cy p={[0, -0.08, 0]} rt={0.12} h={0.12} m={M.galvanized} />
          <B p={[0.09, -0.08, 0]} s={[0.04, 0.13, 0.04]} m={M.black} cast={false} />
        </group>
        <mesh position={[0, 0.02, -0.66]} rotation={[Math.PI / 2, 0, 0]} material={M.safety}><cylinderGeometry args={[0.2, 0.2, 0.42, 20, 1, true, 0, Math.PI]} /></mesh>
      </group>
      {/* akıllı kart (GK-S1) ve rulman titreşim sensörü */}
      <FieldPanel p={[0.45, 0.3, 0.15]} rotY={Math.PI / 2} project={CARD_PROJECT.FAC_VFD_MOTOR_01.smart!} smart />
      <Cy p={[0.24, 0.88, -0.3]} r={[0, 0, Math.PI / 2]} rt={0.035} h={0.06} m={M.stainless} />
      <StackLight p={[-0.3, 1.55, 0.45]} status={status} />
      <FieldPanel p={[1.35, 0, 0.1]} rotY={-Math.PI / 2} project={CARD_PROJECT.FAC_VFD_MOTOR_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Robot: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const j1 = useSmoothed(tel(devices, 'FAC_ROBOT_01', 'joint1_deg'));
  const j2 = useSmoothed(tel(devices, 'FAC_ROBOT_01', 'joint2_deg'));
  const j3 = useSmoothed(tel(devices, 'FAC_ROBOT_01', 'joint3_deg'));
  const load = tel(devices, 'FAC_ROBOT_01', 'payload_kg') > 0.5;
  const curtainOk = tel(devices, 'FAC_ROBOT_01', 'light_curtain_ok', 1) > 0.5;
  const status = devices.FAC_ROBOT_01?.status;
  const turret = useRef<THREE.Group>(null), shoulder = useRef<THREE.Group>(null), elbow = useRef<THREE.Group>(null);
  useFrame(() => {
    if (turret.current) turret.current.rotation.y = -Math.PI / 2 + j1.current * D2R;   // 0° = konveyöre bakar
    if (shoulder.current) shoulder.current.rotation.z = -j2.current * D2R;
    if (elbow.current) elbow.current.rotation.z = -Math.PI / 2 - j3.current * D2R;
  });
  const F = 2.3;           // çit yarı genişliği
  const posts: [number, number][] = [[-F, -F], [0, -F], [F, -F], [-F, 0], [F, 0], [-F, F], [F, F], [-0.8, F], [0.8, F]];
  return (
    <group>
      {/* taban ve döner gövde */}
      <Cy p={[0, 0.18, 0]} rt={0.5} rb={0.58} h={0.36} m={M.machineDark} />
      <group ref={turret} position={[0, 0.36, 0]}>
        <Cy p={[0, 0.24, 0]} rt={0.42} rb={0.46} h={0.48} m={M.robot} />
        <B p={[-0.38, 0.3, 0]} s={[0.3, 0.34, 0.36]} m={M.robot} />
        <group ref={shoulder} position={[0, 0.6, 0]}>
          <Cy r={[Math.PI / 2, 0, 0]} rt={0.24} h={0.56} m={M.machineDark} />
          <B p={[0, 0.8, 0.18]} s={[0.26, 1.7, 0.18]} m={M.robot} />
          <B p={[0, 0.8, -0.18]} s={[0.26, 1.7, 0.18]} m={M.robot} />
          <group ref={elbow} position={[0, 1.6, 0]}>
            <Cy r={[Math.PI / 2, 0, 0]} rt={0.2} h={0.5} m={M.machineDark} />
            <B p={[0, 0.7, 0]} s={[0.24, 1.4, 0.24]} m={M.robot} />
            <group position={[0, 1.42, 0]}>
              <Cy r={[Math.PI / 2, 0, 0]} rt={0.12} h={0.3} m={M.machineDark} />
              <Cy p={[0.18, 0, 0]} r={[0, 0, Math.PI / 2]} rt={0.09} h={0.22} m={M.galvanized} />
              <B p={[0.34, 0, 0]} s={[0.1, 0.3, 0.26]} m={M.machineDark} />
              {[-1, 1].map(s => <B key={s} p={[0.46, s * 0.1, 0]} s={[0.16, 0.04, 0.12]} m={M.stainless} />)}
              {load && <B p={[0.5, 0, 0]} s={[0.24, 0.16, 0.24]} m={M.product} />}
            </group>
          </group>
        </group>
      </group>
      {/* emniyet çiti, konveyör tarafında ışık perdeli açıklık */}
      {posts.map(([x, z], i) => <B key={i} p={[x, 1.0, z]} s={[0.07, 2.0, 0.07]} m={M.safety} />)}
      <mesh position={[0, 1.05, -F]} material={M.fence}><planeGeometry args={[2 * F, 1.8]} /></mesh>
      <mesh position={[-F, 1.05, 0]} rotation={[0, Math.PI / 2, 0]} material={M.fence}><planeGeometry args={[2 * F, 1.8]} /></mesh>
      <mesh position={[F, 1.05, 0]} rotation={[0, Math.PI / 2, 0]} material={M.fence}><planeGeometry args={[2 * F, 1.8]} /></mesh>
      {[-1, 1].map(s => <mesh key={s} position={[s * (F + 0.8) / 2, 1.05, F]} material={M.fence}><planeGeometry args={[F - 0.8, 1.8]} /></mesh>)}
      {[-0.8, 0.8].map(x => <B key={x} p={[x, 0.95, F + 0.08]} s={[0.06, 1.7, 0.06]} m={M.black} />)}
      {[0.35, 0.65, 0.95, 1.25, 1.55].map(y => (
        <mesh key={y} position={[0, y, F + 0.08]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.006, 0.006, 1.6, 4]} />
          <meshBasicMaterial color={curtainOk ? '#4DA3D4' : '#E5484D'} transparent opacity={curtainOk ? 0.35 : 0.9} />
        </mesh>
      ))}
      {/* robot kontrol dolabı ve PLC panosu çit dışında */}
      <B p={[F + 0.9, 0.85, -1.2]} s={[0.8, 1.7, 0.6]} m={M.cabinet} />
      <B p={[F + 0.9, 1.3, -0.89]} s={[0.5, 0.3, 0.02]} m={M.black} cast={false} />
      <FieldPanel p={[F + 0.9, 0, 0.2]} rotY={Math.PI / 2} project={CARD_PROJECT.FAC_ROBOT_01.plc} running={status !== 'MODEL_FAULT'} />
      <StackLight p={[-F, 2.25, F]} status={status} />
    </group>
  );
};

/** Ortam ekipmanı (telemetrisi yok): CNC işleme merkezi ve forklift. */
const Ambient: React.FC = () => (
  <>
    <group position={[-6, 0, -4.4]}>
      <B p={[0, 1.4, 0]} s={[4.0, 2.8, 2.6]} m={M.cabinet} recv />
      <B p={[0, 2.9, 0]} s={[4.0, 0.2, 2.6]} m={M.machine} />
      <B p={[-0.5, 1.55, 1.31]} s={[2.2, 1.4, 0.02]} m={M.machineDark} cast={false} />
      <mesh position={[-0.5, 1.6, 1.33]} material={M.glass}><planeGeometry args={[1.8, 1.0]} /></mesh>
      <B p={[1.55, 1.6, 1.35]} s={[0.6, 0.9, 0.12]} m={M.machineDark} />
      <B p={[1.55, 1.75, 1.42]} s={[0.46, 0.34, 0.01]} m={M.black} cast={false} />
      <B p={[-2.4, 0.5, 0.6]} s={[0.8, 1.0, 1.2]} m={M.machine} />
      <StackLight p={[1.8, 3.05, 1.0]} status="RUNNING" />
    </group>
    <group position={[7.2, 0, 4.6]} rotation={[0, -Math.PI / 4, 0]}>
      <B p={[0, 0.62, 0]} s={[2.0, 0.7, 1.1]} m={M.safety} />
      <B p={[-0.85, 0.72, 0]} s={[0.45, 0.9, 1.08]} m={M.machineDark} />
      {[[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]].map(([x, z], i) => <B key={i} p={[x * 1.2, 1.6, z]} s={[0.06, 1.3, 0.06]} m={M.machineDark} />)}
      <B p={[0, 2.25, 0]} s={[1.3, 0.06, 1.1]} m={M.machineDark} />
      <B p={[1.1, 1.3, 0]} s={[0.12, 2.3, 0.85]} m={M.machineDark} />
      {[-0.28, 0.28].map(z => <B key={z} p={[1.7, 0.1, z]} s={[1.1, 0.05, 0.13]} m={M.galvanized} />)}
      {[-0.55, 0.75].flatMap(x => [-0.6, 0.6].map(z => <Cy key={`${x}${z}`} p={[x, 0.3, z]} r={[Math.PI / 2, 0, 0]} rt={0.3} h={0.22} m={M.rubber} />))}
    </group>
  </>
);

export const ProductionZone: React.FC<ZoneProps> = ({ devices, onSelectDevice, offsets }) => (
  <group position={[-20, 0, 5]} name="ProductionZone">
    <Asset id="FAC_CONVEYOR_01" p={[0, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Conveyor devices={devices} /></Asset>
    <Asset id="FAC_VFD_MOTOR_01" p={[-8.9, 0, 2.35]} offsets={offsets} onSelect={onSelectDevice}><Motor devices={devices} /></Asset>
    <Asset id="FAC_ROBOT_01" p={[2.5, 0, -3.6]} offsets={offsets} onSelect={onSelectDevice}><Robot devices={devices} /></Asset>
    <Ambient />
  </group>
);
