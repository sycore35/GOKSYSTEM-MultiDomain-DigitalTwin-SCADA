import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DeviceRuntimeState } from '../../types';
import { DEVICE_META, keyValue, statusTone, statusTr, TONE_COLOR } from '../../platform/meta';

/** Nötr endüstriyel aydınlatma: hemisfer + yönlü ışık (yumuşak gölge) + prosedürel ortam haritası. */
export const Lights: React.FC<{ dark: boolean }> = ({ dark }) => {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    (scene as any).environmentIntensity = dark ? 0.55 : 0.7;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene, dark]);
  return (
    <>
      <hemisphereLight args={['#FFFFFF', dark ? '#59616A' : '#A9AFB6', dark ? 0.9 : 1.0]} />
      <directionalLight position={[34, 56, 26]} intensity={dark ? 1.5 : 1.7} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-radius={5} shadow-bias={-0.0004} shadow-normalBias={0.04}
        shadow-camera-near={5} shadow-camera-far={160} shadow-camera-left={-55} shadow-camera-right={55} shadow-camera-top={55} shadow-camera-bottom={-55} />
      <directionalLight position={[-30, 25, -20]} intensity={0.35} color="#DDE6EE" />
    </>
  );
};

/** Açık gri zemin + ince metre ızgarası. */
export const Floor: React.FC<{ dark: boolean }> = ({ dark }) => {
  const base = dark ? '#A5ACB3' : '#D6D9DD';
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 100]} />
        <meshStandardMaterial color={base} roughness={0.95} metalness={0} />
      </mesh>
      <gridHelper args={[100, 50, dark ? '#8E959C' : '#BFC4C9', dark ? '#989FA6' : '#C9CDD2']} position={[0, 0.005, 0]} />
    </group>
  );
};

/** Malzemeleri açık, mat endüstriyel tonlara çeker (yüksek metalik + ortam yok = simsiyah sorununu çözer). */
export const Normalizer: React.FC = () => {
  const { scene } = useThree();
  const tick = useRef(0);
  const light = useMemo(() => new THREE.Color('#C3C9CF'), []);
  useFrame(() => {
    if ((tick.current++ % 12) !== 0) return;
    scene.traverse((o: any) => {
      if (!o.isMesh) return;
      const mats: any[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.isMeshBasicMaterial && m.wireframe) { o.visible = false; continue; }   // eski seçim çerçeveleri
        if (!m.isMeshStandardMaterial) continue;
        const u = m.userData;
        if (!u.gokNorm || !m.color.equals(u.gokNorm)) {
          const c = m.color.clone();
          const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          const k = lum < 0.5 ? 0.5 : 0.15;            // koyu parçalar daha çok açılır
          c.lerp(light, k);
          m.color.copy(c); u.gokNorm = c.clone();
          m.metalness = Math.min(m.metalness, 0.22);
          m.roughness = Math.max(m.roughness, 0.5);
          if (m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = Math.min(m.emissiveIntensity, 0.6);
          m.needsUpdate = true;
        }
      }
    });
  });
  return null;
};

export interface AssetBox { id: string; center: THREE.Vector3; size: THREE.Vector3; top: number }

/** Sahnedeki userData.deviceId taşıyan grupların sınır kutularını (1 sn'de bir) okur. */
export function useAssetBoxes(): AssetBox[] {
  const { scene } = useThree();
  const [boxes, setBoxes] = useState<AssetBox[]>([]);
  useEffect(() => {
    const read = () => {
      const out: AssetBox[] = [];
      scene.traverse((o) => {
        const id = (o.userData as any)?.deviceId;
        if (!id) return;
        const b = new THREE.Box3().setFromObject(o);
        if (b.isEmpty()) return;
        const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
        out.push({ id, center: c, size: s, top: b.max.y });
      });
      setBoxes(prev => {
        const same = prev.length === out.length && prev.every((p, i) => p.id === out[i].id && p.center.distanceTo(out[i].center) < 0.15 && p.size.distanceTo(out[i].size) < 0.3);
        return same ? prev : out;
      });
    };
    const t0 = setTimeout(read, 400);
    const t = setInterval(read, 1500);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [scene]);
  return boxes;
}

const ZONE_DEFS = [
  { name: 'ProductionZone', label: 'ÜRETİM HATTI' },
  { name: 'ProcessZone', label: 'PROSES' },
  { name: 'PowerZone', label: 'ELEKTRİK' },
  { name: 'FacilityZone', label: 'BİNA VE HVAC' },
];

/** Bölge zemin plakaları, ince sınır çizgileri ve zemin etiketleri. */
export const ZonePlates: React.FC<{ dark: boolean; boxes: AssetBox[] }> = ({ dark, boxes }) => {
  const { scene } = useThree();
  const [zones, setZones] = useState<{ label: string; cx: number; cz: number; w: number; d: number }[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      const out: typeof zones = [];
      ZONE_DEFS.forEach(z => {
        const o = scene.getObjectByName(z.name); if (!o) return;
        const b = new THREE.Box3();
        o.children.forEach(ch => { if ((ch.userData as any)?.deviceId) b.expandByObject(ch); });
        if (b.isEmpty()) b.setFromObject(o);
        const w = b.max.x - b.min.x + 5, d = b.max.z - b.min.z + 5;
        out.push({ label: z.label, cx: (b.max.x + b.min.x) / 2, cz: (b.max.z + b.min.z) / 2, w, d });
      });
      setZones(out);
    }, 500);
    return () => clearTimeout(t);
  }, [scene, boxes.length]);
  const line = dark ? '#6F777F' : '#8C939A';
  return (
    <group>
      {zones.map(z => (
        <group key={z.label} position={[z.cx, 0.02, z.cz]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[z.w, z.d]} />
            <meshStandardMaterial color={dark ? '#B7BDC3' : '#E8EAEC'} roughness={0.95} />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(z.w, z.d)]} />
            <lineBasicMaterial color={line} />
          </lineSegments>
          <Html position={[-z.w / 2 + 0.6, 0.05, z.d / 2 - 0.6]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
            <div className="g3-zone">{z.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
};

const EDGE_CACHE = new Map<string, THREE.EdgesGeometry>();
const edgesFor = (s: THREE.Vector3) => {
  const key = `${s.x.toFixed(1)}|${s.y.toFixed(1)}|${s.z.toFixed(1)}`;
  let g = EDGE_CACHE.get(key);
  if (!g) { g = new THREE.EdgesGeometry(new THREE.BoxGeometry(s.x, s.y, s.z)); EDGE_CACHE.set(key, g); }
  return g;
};

interface LayerProps {
  boxes: AssetBox[];
  devices: Record<string, DeviceRuntimeState>;
  selectedId: string | null;
  hoverId: string | null;
  compact: boolean;
  dark: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** Her varlık için: yüzen etiket (tag + anahtar değer), hover/seçim ve yalnızca anormalde durum renkli kontur. */
/** Yakın varlıkların etiketleri üst üste binmesin: yatayda yakın olanları kademeli olarak yükselt. */
const labelLift = (boxes: AssetBox[]): Record<string, number> => {
  const out: Record<string, number> = {}; const placed: AssetBox[] = [];
  [...boxes].sort((a, b) => a.top - b.top || a.center.x - b.center.x).forEach(b => {
    const near = placed.filter(p => Math.hypot(p.center.x - b.center.x, p.center.z - b.center.z) < 12).length;
    out[b.id] = Math.min(near, 3) * 1.8; placed.push(b);
  });
  return out;
};

export const AssetLayer: React.FC<LayerProps> = ({ boxes, devices, selectedId, hoverId, compact, dark, onSelect, onHover }) => {
  const lift = React.useMemo(() => labelLift(boxes), [boxes]);
  return (
  <group>
    {boxes.map(b => {
      const d = devices[b.id]; const meta = DEVICE_META[b.id]; if (!meta) return null;
      const tone = statusTone(d?.status);
      const abnormal = tone === 'bad' || tone === 'warn';
      const isSel = selectedId === b.id, isHov = hoverId === b.id;
      const color = abnormal ? TONE_COLOR[tone] : isSel ? '#4DA3D4' : dark ? '#FFFFFF' : '#1A1D21';
      const kv = keyValue(b.id, d);
      const pad = 0.35;
      const size = new THREE.Vector3(b.size.x + pad, b.size.y + pad, b.size.z + pad);
      return (
        <group key={b.id}>
          {(abnormal || isSel || isHov) && (
            <group position={b.center}>
              <mesh><boxGeometry args={[size.x, size.y, size.z]} /><meshBasicMaterial color={color} transparent opacity={isHov || isSel ? 0.14 : 0.08} depthWrite={false} /></mesh>
              <lineSegments geometry={edgesFor(size)}><lineBasicMaterial color={color} /></lineSegments>
            </group>
          )}
          <Html position={[b.center.x, b.top + 0.9 + (lift[b.id] ?? 0), b.center.z]} center zIndexRange={isSel || isHov ? [40, 31] : [30, 10]} distanceFactor={undefined} style={{ pointerEvents: 'auto' }}>
            <button type="button" className={`g3-label ${isSel ? 'sel' : ''} ${isHov ? 'hov' : ''} ${compact ? 'sm' : ''}`} data-tone={abnormal ? tone : undefined}
              onClick={(e) => { e.stopPropagation(); onSelect(b.id); }} onMouseEnter={() => onHover(b.id)} onMouseLeave={() => onHover(null)}
              aria-label={`${meta.name}: ${statusTr(d?.status)}. Ayrıntı için tıklayın`}>
              <span className="g3-dot" data-tone={abnormal ? tone : undefined} />
              <span className="g3-tag">{meta.short}</span>
              {kv && <span className="g3-val">{kv.text}<i>{kv.unit}</i></span>}
              {!compact && (isSel || isHov) && <span className="g3-name">{meta.name}</span>}
            </button>
          </Html>
        </group>
      );
    })}
  </group>
  );
};

/** Seçilen varlığa kamerayı (hedefle birlikte) yumuşakça kaydırır. */
export const CameraRig: React.FC<{ target: THREE.Vector3 | null; stamp: number }> = ({ target, stamp }) => {
  const controls = useThree(s => s.controls) as any;
  const camera = useThree(s => s.camera);
  const until = useRef(0);
  useEffect(() => { until.current = performance.now() + 1200; }, [stamp]);
  useFrame(() => {
    if (!controls || !target || performance.now() > until.current) return;
    const delta = target.clone().sub(controls.target).multiplyScalar(0.12);
    controls.target.add(delta); camera.position.add(delta); controls.update();
  });
  return null;
};
