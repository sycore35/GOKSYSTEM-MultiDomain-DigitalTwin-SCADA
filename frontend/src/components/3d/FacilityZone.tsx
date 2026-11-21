import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Asset, B, CARD_PROJECT, Cy, FieldPanel, M, StackLight, ZoneProps, lamp, tel } from './parts';

/** Bina ve enerji depolama: klima santrali (AHU), batarya konteyneri (BESS), güneş paneli sahası (GES). */

const Ahu: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const fanKw = tel(devices, 'BLD_HVAC_ZONE1', 'fan_power_kw');
  const status = devices.BLD_HVAC_ZONE1?.status;
  const fans = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (fans.current && fanKw > 0.2) fans.current.children.forEach(f => { f.rotation.y += dt * (3 + fanKw); }); });
  const L = 5.2, Hh = 2.0, Dd = 2.0;
  return (
    <group>
      <B p={[0, 0.1, 0]} s={[L + 0.4, 0.2, Dd + 0.4]} m={M.concrete} recv />
      <B p={[0, 0.2 + Hh / 2, 0]} s={[L, Hh, Dd]} m={M.cabinet} />
      {/* panel ek yerleri, servis kapıları ve kolları */}
      {[-1.7, -0.6, 0.6, 1.7].map(x => <B key={x} p={[x, 0.2 + Hh / 2, Dd / 2 + 0.005]} s={[0.03, Hh - 0.1, 0.01]} m={M.machine} cast={false} />)}
      {[-1.15, 0, 1.15].map(x => <group key={x}><B p={[x, 0.2 + Hh / 2, Dd / 2 + 0.01]} s={[0.9, 1.6, 0.01]} m={M.cabinet} cast={false} /><B p={[x + 0.35, 0.2 + Hh / 2, Dd / 2 + 0.04]} s={[0.04, 0.22, 0.04]} m={M.black} cast={false} /></group>)}
      {/* emiş menfezi */}
      {Array.from({ length: 9 }, (_, i) => <B key={i} p={[-L / 2 - 0.02, 0.45 + i * 0.18, 0]} r={[0, 0, 0.5]} s={[0.04, 0.16, Dd - 0.3]} m={M.machine} cast={false} />)}
      {/* kondenser fanları (hava akışı varken döner) */}
      <group ref={fans}>
        {[-1.2, 1.2].map(x => (
          <group key={x} position={[x, 0.2 + Hh + 0.18, 0]}>
            {[0, 1, 2, 3].map(k => <B key={k} r={[0, (k * Math.PI) / 2, 0.25]} p={[Math.cos(k * Math.PI / 2) * 0.28, 0, -Math.sin(k * Math.PI / 2) * 0.28]} s={[0.5, 0.02, 0.18]} m={M.machineDark} cast={false} />)}
          </group>
        ))}
      </group>
      {[-1.2, 1.2].map(x => <group key={x}>
        <Cy p={[x, 0.2 + Hh + 0.18, 0]} rt={0.68} h={0.36} m={M.machine} open />
        <mesh position={[x, 0.2 + Hh + 0.37, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.galvanized}><torusGeometry args={[0.55, 0.012, 6, 24]} /></mesh>
        <mesh position={[x, 0.2 + Hh + 0.37, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.galvanized}><torusGeometry args={[0.3, 0.012, 6, 20]} /></mesh>
      </group>)}
      {/* besleme ve dönüş kanalları binaya */}
      {[[-2.0, 0.7], [2.0, 0.65]].map(([x, w]) => (
        <group key={x}>
          <B p={[x, 0.2 + Hh + 1.0, -0.4]} s={[w, 2.0, 0.7]} m={M.galvanized} />
          <B p={[x, 0.2 + Hh + 2.0, -1.8]} s={[w, 0.7, 3.4]} m={M.galvanized} />
        </group>
      ))}
      {/* zon sıcaklık/nem/CO2 akıllı kartı (GK-S1) direk üzerinde */}
      <B p={[3.3, 0.8, 0.9]} s={[0.06, 1.6, 0.06]} m={M.galvanized} />
      <FieldPanel p={[3.3, 1.75, 0.95]} project={CARD_PROJECT.BLD_HVAC_ZONE1.smart!} smart />
      <StackLight p={[L / 2 - 0.3, 0.2 + Hh + 0.25, Dd / 2 - 0.2]} status={status} />
      <FieldPanel p={[-1.6, 0, 1.75]} project={CARD_PROJECT.BLD_HVAC_ZONE1.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

const Bess: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const soc = Math.max(0, Math.min(100, tel(devices, 'BLD_BMS_BATTERY_01', 'soc_pct')));
  const pkw = tel(devices, 'BLD_BMS_BATTERY_01', 'power_kw');
  const status = devices.BLD_BMS_BATTERY_01?.status;
  const L = 6.06, H = 2.6, D = 2.44;
  const lit = Math.round(soc / 10);
  return (
    <group>
      <B p={[0, 0.1, 0]} s={[L + 0.3, 0.2, D + 0.3]} m={M.concrete} recv />
      <B p={[0, 0.2 + H / 2, 0]} s={[L, H, D]} m={M.container} />
      {/* oluklu duvar nervürleri */}
      {Array.from({ length: 22 }, (_, i) => -L / 2 + 0.2 + i * 0.27).flatMap(x => [-1, 1].map(s => <B key={`${x}${s}`} p={[x, 0.2 + H / 2, s * (D / 2 + 0.02)]} s={[0.1, H - 0.2, 0.04]} m={M.container} cast={false} />))}
      {/* uç kapılar ve kilit çubukları */}
      {[-0.55, 0.55].map(z => <B key={z} p={[L / 2 + 0.01, 0.2 + H / 2, z]} s={[0.02, H - 0.2, 1.05]} m={M.container} cast={false} />)}
      {[-0.85, -0.25, 0.25, 0.85].map(z => <Cy key={z} p={[L / 2 + 0.05, 0.2 + H / 2, z]} rt={0.02} h={H - 0.3} m={M.galvanized} cast={false} />)}
      {/* kendi klima ünitesi */}
      <B p={[-L / 2 - 0.25, 0.2 + H * 0.65, 0]} s={[0.5, 1.0, 1.2]} m={M.white} />
      <Cy p={[-L / 2 - 0.51, 0.2 + H * 0.65, 0]} r={[0, 0, Math.PI / 2]} rt={0.3} h={0.02} m={M.machineDark} />
      {/* şarj durumu LED çubuğu: dolu bölüm sayısı = SOC/10; şarjda mavi, deşarjda yeşil */}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[-1.35 + i * 0.3, 0.2 + H - 0.4, D / 2 + 0.05]} material={lamp(i < lit, pkw < 0 ? 'blue' : 'green')}><planeGeometry args={[0.24, 0.12]} /></mesh>
      ))}
      <mesh position={[1.9, 0.2 + H * 0.55, D / 2 + 0.05]}><circleGeometry args={[0.18, 3]} /><meshStandardMaterial color="#D2A231" /></mesh>
      <StackLight p={[L / 2 - 0.4, 0.2 + H + 0.25, D / 2 - 0.3]} status={status} />
      <FieldPanel p={[L / 2 + 0.9, 0, 0.9]} rotY={-Math.PI / 2} project={CARD_PROJECT.BLD_BMS_BATTERY_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

/** Hücre ızgaralı GES paneli (1,7 × 1,0 m). */
const PvModule: React.FC<{ p: [number, number, number] }> = ({ p }) => {
  const lines = useMemo(() => ({ v: [-0.57, -0.28, 0, 0.28, 0.57], h: [-0.25, 0, 0.25] }), []);
  return (
    <group position={p}>
      <B s={[1.7, 0.04, 1.0]} m={M.pvFrame} />
      <B p={[0, 0.022, 0]} s={[1.64, 0.01, 0.94]} m={M.pv} cast={false} />
      {lines.v.map(x => <B key={x} p={[x, 0.03, 0]} s={[0.008, 0.004, 0.94]} m={M.pvFrame} cast={false} />)}
      {lines.h.map(z => <B key={z} p={[0, 0.03, z]} s={[1.64, 0.004, 0.008]} m={M.pvFrame} cast={false} />)}
    </group>
  );
};

const PvArray: React.FC<{ devices: ZoneProps['devices'] }> = ({ devices }) => {
  const status = devices.BLD_SOLAR_PV_01?.status;
  const tilt = (25 * Math.PI) / 180;
  return (
    <group>
      {[-1.6, 1.6].map(z => (
        <group key={z} position={[0, 0, z]}>
          {[-4.35, -1.45, 1.45, 4.35].map(x => <group key={x}>
            <B p={[x, 0.55, 0.45]} s={[0.08, 1.1, 0.08]} m={M.galvanized} />
            <B p={[x, 1.0, -0.45]} s={[0.08, 2.0, 0.08]} m={M.galvanized} />
            <B p={[x, 0.02, 0]} s={[0.3, 0.04, 1.2]} m={M.concrete} />
          </group>)}
          <group position={[0, 1.55, 0]} rotation={[tilt, 0, 0]}>
            {[-4.35, -2.61, -0.87, 0.87, 2.61, 4.35].map(x => [-0.52, 0.52].map(zz => <PvModule key={`${x}${zz}`} p={[x, 0, zz]} />))}
            {[-0.95, 0.95].map(zz => <B key={zz} p={[0, -0.05, zz]} s={[10.6, 0.06, 0.06]} m={M.galvanized} cast={false} />)}
          </group>
        </group>
      ))}
      {/* invertör ve piranometre direği */}
      <B p={[6.2, 0.9, 0]} s={[0.5, 1.0, 0.8]} m={M.white} />
      <B p={[6.2, 0.2, 0]} s={[0.1, 0.4, 0.1]} m={M.galvanized} />
      <B p={[6.2, 1.5, 2.6]} s={[0.05, 3.0, 0.05]} m={M.galvanized} />
      <mesh position={[6.2, 3.06, 2.6]} material={M.glass}><sphereGeometry args={[0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <Cy p={[6.2, 3.03, 2.6]} rt={0.09} h={0.04} m={M.white} />
      <StackLight p={[6.2, 1.65, -0.3]} status={status} />
      <FieldPanel p={[6.9, 0, 0.9]} rotY={-Math.PI / 2} project={CARD_PROJECT.BLD_SOLAR_PV_01.plc} running={status !== 'MODEL_FAULT'} />
    </group>
  );
};

export const FacilityZone: React.FC<ZoneProps> = ({ devices, onSelectDevice, offsets }) => (
  <group position={[0, 0, 24]} name="FacilityZone">
    <Asset id="BLD_HVAC_ZONE1" p={[-12, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Ahu devices={devices} /></Asset>
    <Asset id="BLD_BMS_BATTERY_01" p={[1, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><Bess devices={devices} /></Asset>
    <Asset id="BLD_SOLAR_PV_01" p={[14, 0, 0]} offsets={offsets} onSelect={onSelectDevice}><PvArray devices={devices} /></Asset>
  </group>
);
