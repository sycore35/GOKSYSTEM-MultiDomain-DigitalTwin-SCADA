import React, { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { DeviceRuntimeState } from '../../types';

/**
 * Ortak 3B parça kütüphanesi: paylaşılan malzemeler (tek örnek, bellek ve çizim çağrısı tasarrufu) ve
 * tekrar kullanılan endüstriyel parçalar (boru, flanş, sinyal kulesi, saha panosu).
 * Renkler gerçek tesis tonlarıdır ama soluk tutulur; durum rengi yalnızca sinyal kulelerinde ve etiket katmanında.
 */

const std = (color: string, roughness = 0.6, metalness = 0.2, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const M = {
  machine: std('#5B6670', 0.55, 0.35),        // RAL 7031 makine grisi
  machineDark: std('#3A4148', 0.6, 0.35),
  motor: std('#3D5A78', 0.5, 0.35),           // RAL 5009 motor mavisi
  safety: std('#D2A231', 0.5, 0.15),          // emniyet sarısı (koruyucular, korkuluk)
  robot: std('#D9822B', 0.45, 0.2),           // robot turuncusu
  stainless: std('#B9C1C8', 0.32, 0.75),
  galvanized: std('#98A1A8', 0.45, 0.6),
  pipe: std('#8E99A3', 0.4, 0.55),
  cabinet: std('#C8CCCF', 0.55, 0.15),        // RAL 7035 pano gri
  rubber: std('#24272A', 0.9, 0.0),
  plastic: std('#2C3135', 0.7, 0.05),
  concrete: std('#6F757B', 0.95, 0.0),
  copper: std('#B4794B', 0.35, 0.8),
  porcelain: std('#7A4E3A', 0.35, 0.05),      // kahverengi porselen izolatör
  oil: std('#56636E', 0.5, 0.4),              // trafo kazanı
  pv: std('#1C2E4A', 0.25, 0.4),
  pvFrame: std('#A9B1B8', 0.35, 0.7),
  container: std('#D7DADC', 0.6, 0.25),
  wood: std('#8B6B4A', 0.85, 0.0),
  product: std('#6E7F8E', 0.4, 0.5),
  glass: std('#9FB7C8', 0.05, 0.1, { transparent: true, opacity: 0.25, depthWrite: false }),
  liquid: std('#3E8FB0', 0.15, 0.1, { transparent: true, opacity: 0.85 }),
  shellGlass: std('#C9D2D9', 0.2, 0.6, { transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  black: std('#16191C', 0.8, 0.1),
  white: std('#E6E8EA', 0.6, 0.05),
  gravel: std('#55595E', 1, 0),
  fence: std('#8C959C', 0.6, 0.5, { transparent: true, opacity: 0.45, depthWrite: false }),
};

const LAMP = {
  green: new THREE.MeshStandardMaterial({ color: '#2E9B67', emissive: '#2E9B67', emissiveIntensity: 1.4, roughness: 0.3 }),
  amber: new THREE.MeshStandardMaterial({ color: '#E3A21A', emissive: '#E3A21A', emissiveIntensity: 1.5, roughness: 0.3 }),
  red: new THREE.MeshStandardMaterial({ color: '#E5484D', emissive: '#E5484D', emissiveIntensity: 1.6, roughness: 0.3 }),
  blue: new THREE.MeshStandardMaterial({ color: '#4DA3D4', emissive: '#4DA3D4', emissiveIntensity: 1.3, roughness: 0.3 }),
  off: new THREE.MeshStandardMaterial({ color: '#3B4045', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.9 }),
};
export const lamp = (on: boolean, c: 'green' | 'amber' | 'red' | 'blue') => (on ? LAMP[c] : LAMP.off);

type V3 = [number, number, number];

export const B: React.FC<{ p?: V3; s: V3; m: THREE.Material; r?: V3; cast?: boolean; recv?: boolean }> = ({ p = [0, 0, 0], s, m, r, cast = true, recv = false }) => (
  <mesh position={p} rotation={r} material={m} castShadow={cast} receiveShadow={recv}><boxGeometry args={s} /></mesh>
);

/** Silindir; varsayılan ekseni Y'dir (r ile döndürülür). */
export const Cy: React.FC<{ p?: V3; rt: number; rb?: number; h: number; m: THREE.Material; r?: V3; seg?: number; cast?: boolean; open?: boolean }> =
  ({ p = [0, 0, 0], rt, rb, h, m, r, seg = 24, cast = true, open = false }) => (
    <mesh position={p} rotation={r} material={m} castShadow={cast}><cylinderGeometry args={[rt, rb ?? rt, h, seg, 1, open]} /></mesh>
  );

const UP = new THREE.Vector3(0, 1, 0);
/** a'dan b'ye düz boru (eksen ne olursa olsun) ve iki ucunda flanş. */
export const Pipe: React.FC<{ a: V3; b: V3; r?: number; m?: THREE.Material; flanges?: boolean }> = ({ a, b, r = 0.12, m = M.pipe, flanges = true }) => {
  const { mid, len, quat } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return { mid: va.clone().add(vb).multiplyScalar(0.5), len: dir.length(), quat: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()) };
  }, [a[0], a[1], a[2], b[0], b[1], b[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group position={mid} quaternion={quat}>
      <mesh material={m} castShadow><cylinderGeometry args={[r, r, len, 16]} /></mesh>
      {flanges && [-1, 1].map(k => <mesh key={k} position={[0, k * (len / 2 - 0.04), 0]} material={M.galvanized}><cylinderGeometry args={[r * 1.7, r * 1.7, 0.08, 16]} /></mesh>)}
    </group>
  );
};

/** Boru dirseği (köşe küresi). */
export const Elbow: React.FC<{ p: V3; r?: number }> = ({ p, r = 0.12 }) => <mesh position={p} material={M.pipe}><sphereGeometry args={[r * 1.05, 16, 12]} /></mesh>;

/** Üç katlı sinyal kulesi: yeşil = çalışıyor, amber = uyarı, kırmızı = arıza. */
export const StackLight: React.FC<{ p: V3; status?: string }> = ({ p, status }) => {
  const fault = status === 'FAULT' || status === 'MODEL_FAULT' || status === 'TRIPPED';
  const warn = status === 'WARNING';
  const run = status === 'RUNNING';
  return (
    <group position={p}>
      <Cy p={[0, -0.25, 0]} rt={0.025} h={0.5} m={M.galvanized} cast={false} />
      <Cy p={[0, 0.06, 0]} rt={0.07} h={0.12} m={lamp(run, 'green')} cast={false} seg={14} />
      <Cy p={[0, 0.19, 0]} rt={0.07} h={0.12} m={lamp(warn, 'amber')} cast={false} seg={14} />
      <Cy p={[0, 0.32, 0]} rt={0.07} h={0.12} m={lamp(fault, 'red')} cast={false} seg={14} />
      <Cy p={[0, 0.4, 0]} rt={0.05} h={0.04} m={M.plastic} cast={false} seg={14} />
    </group>
  );
};

/** Varlığın saha kartlarının KiCad projeleri (goksystem/modules/hardware.py SHORT ile aynı). */
export const CARD_PROJECT: Record<string, { plc: string; smart?: string }> = {
  FAC_CONVEYOR_01: { plc: 'gk_p1_knv01' }, FAC_ROBOT_01: { plc: 'gk_p1_rob01' },
  FAC_VFD_MOTOR_01: { plc: 'gk_p1_mot01', smart: 'gk_s1_mot01' }, PROC_TANK_01: { plc: 'gk_p1_tnk01' },
  PROC_PUMP_01: { plc: 'gk_p1_pmp01', smart: 'gk_s1_pmp01' }, PROC_VALVE_01: { plc: 'gk_p1_van01' },
  GRID_TRAFO_01: { plc: 'gk_p1_trf01' }, GRID_BREAKER_01: { plc: 'gk_p1_kes01' }, GRID_BUSBAR_11KV: { plc: 'gk_p1_bar01' },
  BLD_HVAC_ZONE1: { plc: 'gk_p1_hvc01', smart: 'gk_s1_hvc01' }, BLD_SOLAR_PV_01: { plc: 'gk_p1_ges01' },
  BLD_BMS_BATTERY_01: { plc: 'gk_p1_bat01' },
};

// Tüm kart dokularını modül yüklenirken paralel başlat (bileşenler sırayla keşfedip şelale oluşturmasın)
Object.values(CARD_PROJECT).forEach(c => [c.plc, c.smart].forEach(p => p && useTexture.preload(`/boards/${p}/thumb.jpg`)));

const useBoardTexture = (project: string) => {
  const tex = useTexture(`/boards/${project}/thumb.jpg`);
  return useMemo(() => {
    const t = tex.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(0.76, 0.62);                    // render kenarlarındaki arka planı kırp
    t.offset.set(0.12, 0.19);
    t.needsUpdate = true;
    return t;
  }, [tex]);
};

/**
 * Saha panosu: ayaklı IP65 pano, cam kapı ardında varlığın gerçek GK kartı (KiCad render'ı),
 * üstünde RUN lambası. Kart görüntüsü /boards/<proje>/thumb.jpg'den gelir.
 */
type PanelProps = { p: V3; rotY?: number; project: string; running?: boolean; smart?: boolean };

/** Doku gelene kadar boş pano gösterir; sahnenin geri kalanı kart görüntüsünü beklemez. */
export const FieldPanel: React.FC<PanelProps> = (props) => (
  <Suspense fallback={<FieldPanelBody {...props} tex={null} />}><FieldPanelTextured {...props} /></Suspense>
);
const FieldPanelTextured: React.FC<PanelProps> = (props) => <FieldPanelBody {...props} tex={useBoardTexture(props.project)} />;

const FieldPanelBody: React.FC<PanelProps & { tex: THREE.Texture | null }> = ({ p, rotY = 0, running = true, smart, tex }) => {
  const w = smart ? 0.5 : 0.62, h = smart ? 0.42 : 0.5;
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      {!smart && <><B p={[0, 0.45, -0.02]} s={[0.06, 0.9, 0.06]} m={M.galvanized} /><B p={[0, 0.02, -0.02]} s={[0.4, 0.04, 0.3]} m={M.galvanized} /></>}
      <group position={[0, smart ? 0 : 1.15, 0]}>
        <B s={[w + 0.12, h + 0.14, 0.22]} m={M.cabinet} />
        <mesh position={[0, 0, 0.112]}><planeGeometry args={[w, h]} /><meshStandardMaterial map={tex} color={tex ? '#ffffff' : '#1f4d36'} roughness={0.6} metalness={0.1} /></mesh>
        <mesh position={[0, 0, 0.118]} material={M.glass}><planeGeometry args={[w + 0.04, h + 0.04]} /></mesh>
        <mesh position={[(w + 0.12) / 2 - 0.05, (h + 0.14) / 2 - 0.05, 0.115]} material={lamp(running, smart ? 'blue' : 'green')}><circleGeometry args={[0.022, 12]} /></mesh>
        {smart && <Cy p={[w / 2, (h + 0.14) / 2 + 0.1, 0]} rt={0.012} h={0.22} m={M.black} cast={false} seg={8} />}
      </group>
    </group>
  );
};

/** Telemetri değerine yumuşak yaklaşan sayı (100 ms'lik WebSocket güncellemeleri arasında akıcı hareket). */
export function useSmoothed(target: number, rate = 6): React.MutableRefObject<number> {
  const v = useRef(target);
  useFrame((_, dt) => { v.current += (target - v.current) * Math.min(1, dt * rate); });
  return v;
}

export const tel = (devices: Record<string, DeviceRuntimeState>, id: string, pt: string, fallback = 0): number => {
  const x = devices[id]?.telemetry?.[pt]?.value;
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
};

/** Seçim/konum için standart varlık grubu: userData.deviceId, tıklama ve düzenleyici ofseti. */
export const Asset: React.FC<{ id: string; p: V3; offsets?: Record<string, { x: number; y: number; z: number }>; onSelect: (id: string) => void; rotY?: number; children: React.ReactNode }> =
  ({ id, p, offsets, onSelect, rotY = 0, children }) => {
    const o = offsets?.[id];
    const pos: V3 = o ? [p[0] + o.x, p[1] + o.y, p[2] + o.z] : p;
    return <group position={pos} rotation={[0, rotY, 0]} userData={{ deviceId: id }} onClick={(e) => { e.stopPropagation(); onSelect(id); }}>{children}</group>;
  };

export interface ZoneProps {
  devices: Record<string, DeviceRuntimeState>;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  offsets?: Record<string, { x: number; y: number; z: number }>;
}
