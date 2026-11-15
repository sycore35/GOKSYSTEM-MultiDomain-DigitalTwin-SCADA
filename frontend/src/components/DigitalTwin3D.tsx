import React, { useState, useRef, Suspense, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { RotateCcw, Pencil, MousePointerClick } from 'lucide-react';
import { DeviceRuntimeState, AlarmRecord } from '../types';
import { FactoryArchitecture } from './3d/FactoryArchitecture';
import { ProductionZone } from './3d/ProductionZone';
import { ProcessZone } from './3d/ProcessZone';
import { PowerZone } from './3d/PowerZone';
import { FacilityZone } from './3d/FacilityZone';
import { WorkerPersonnel } from './3d/WorkerPersonnel';
import { Lights, Floor, Normalizer, ZonePlates, AssetLayer, CameraRig, useAssetBoxes } from './3d/Scene';
import { InspectorPanel } from '../platform/InspectorPanel';
import { CustomItems, TwinEditorPanel, TwinItem } from '../platform/TwinEditor';
import { usePoll, useTheme } from '../platform/api';
import { ZONES, DEVICE_META } from '../platform/meta';

interface DigitalTwin3DProps {
  devices: Record<string, DeviceRuntimeState>;
  alarms?: AlarmRecord[];
  onSelectDevice: (deviceId: string) => void;
  selectedDeviceId?: string | null;
  compact?: boolean;
  fill?: boolean;
  onOpenTrends?: (deviceId: string, point?: string) => void;
}

const NARROW = typeof window !== 'undefined' && window.innerWidth < 640;
const K = NARROW ? 1.9 : 1;
const PRESETS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { pos: [34, 40, 62], target: [-2, 0, -2] },
  top: { pos: [0, 74, 0.1], target: [0, 0, -2] },
  front: { pos: [0, 12, 58], target: [0, 2, -2] },
  iso: { pos: [-36, 28, 38], target: [0, 0, -2] },
};

/** Sahne içeriği: Canvas içinde çalışır (useThree). */
const SceneContent: React.FC<{
  devices: Record<string, DeviceRuntimeState>; activeZone: string; selectedId: string | null; compact: boolean; dark: boolean;
  onSelect: (id: string) => void; offsets: Record<string, { x: number; y: number; z: number }>;
  layoutItems: TwinItem[]; editFocus: string | null; pickCustom: (it: TwinItem) => void; controlsRef: React.MutableRefObject<any>;
}> = ({ devices, activeZone, selectedId, compact, dark, onSelect, offsets, layoutItems, editFocus, pickCustom, controlsRef }) => {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const boxes = useAssetBoxes();
  const [stamp, setStamp] = useState(0);
  const findId = (obj: THREE.Object3D | null): string | null => { let o: THREE.Object3D | null = obj; while (o) { if ((o.userData as any)?.deviceId) return (o.userData as any).deviceId; o = o.parent; } return null; };
  const hover = (id: string | null) => { setHoverId(id); document.body.style.cursor = id ? 'pointer' : ''; };
  const sel = (id: string) => { setStamp(s => s + 1); onSelect(id); };
  const focus = useMemo(() => { const b = boxes.find(x => x.id === selectedId); return b ? new THREE.Vector3(b.center.x, 0, b.center.z) : null; }, [boxes, selectedId]);
  const common = { devices, selectedDeviceId: selectedId, onSelectDevice: sel, offsets };
  return (
    <>
      <Lights dark={dark} />
      <Floor dark={dark} />
      <Normalizer />
      <group onPointerOver={(e) => { e.stopPropagation(); hover(findId(e.object)); }} onPointerOut={() => hover(null)}>
        <FactoryArchitecture />
        {(activeZone === 'all' || activeZone === 'production') && <ProductionZone {...common} />}
        {(activeZone === 'all' || activeZone === 'process') && <ProcessZone {...common} />}
        {(activeZone === 'all' || activeZone === 'power') && <PowerZone {...common} />}
        {(activeZone === 'all' || activeZone === 'facility') && <FacilityZone {...common} />}
        <CustomItems items={layoutItems} selectedId={editFocus || selectedId} onSelect={pickCustom} />
        {(activeZone === 'all' || activeZone === 'personnel') && <WorkerPersonnel />}
      </group>
      <ZonePlates dark={dark} boxes={boxes} />
      <AssetLayer boxes={boxes.filter(b => activeZone === 'all' || zoneOf(b.id) === activeZone)} devices={devices} selectedId={selectedId} hoverId={hoverId}
        compact={compact || NARROW} dark={dark} onSelect={sel} onHover={hover} />
      <CameraRig target={focus} stamp={stamp} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={8} maxDistance={130} target={[-2, 0, -2]} />
    </>
  );
};

const ZONE_OF: Record<string, string> = { Üretim: 'production', Proses: 'process', Enerji: 'power', Tesis: 'facility' };
const zoneOf = (id: string) => ZONE_OF[DEVICE_META[id]?.zone || ''] || 'all';

export const DigitalTwin3D: React.FC<DigitalTwin3DProps> = ({ devices, onSelectDevice, selectedDeviceId, compact = false, fill = false, onOpenTrends }) => {
  const controlsRef = useRef<any>(null);
  const [activeZone, setActiveZone] = useState<string>('all');
  const [preset, setPreset] = useState<string>('overview');
  const theme = useTheme();
  const dark = theme === 'dark';
  const [editMode, setEditMode] = useState(false);
  const [editFocus, setEditFocus] = useState<string | null>(null);
  const layoutPoll = usePoll<{ items: TwinItem[]; kinds: string[]; devices: { device_id: string; name: string }[] }>('/twin/layout', 0);
  const layout = layoutPoll.data;
  const offsets: Record<string, { x: number; y: number; z: number }> = {};
  (layout?.items || []).forEach(i => { if (!i.custom && i.device_id) offsets[i.device_id] = { x: i.x, y: i.y, z: i.z }; });
  const pickCustom = useCallback((it: TwinItem) => {
    if (editMode) setEditFocus(it.item_id);
    if (it.bind_device) onSelectDevice(it.bind_device);
  }, [editMode, onSelectDevice]);

  const go = (p: string) => {
    const c = controlsRef.current; if (!c) return;
    const v = PRESETS[p]; c.object.position.set(v.pos[0] * K, v.pos[1] * K, v.pos[2] * K); c.target.set(...v.target); c.update(); setPreset(p);
  };
  const bg = dark ? '#262B31' : '#E9EBED';
  const sel = selectedDeviceId || null;
  const height = fill ? 'h-full min-h-[460px]' : compact ? 'h-[560px] sm:h-[620px]' : 'h-[640px]';

  return (
    <div className={`g3-wrap flex flex-col w-full ${height} overflow-hidden`} style={{ border: '1px solid var(--p-border)', borderRadius: 4, background: 'var(--p-surface)' }}>
      {/* Araç çubuğu: sahnenin üstünde, onu örtmez */}
      <div className="g3-bar">
        <div className="g3-seg" role="group" aria-label="Kamera">
          {[['overview', 'Genel'], ['top', 'Üstten'], ['front', 'Önden'], ['iso', 'İzometrik']].map(([k, l]) => (
            <button key={k} aria-pressed={preset === k} onClick={() => go(k)}>{l}</button>
          ))}
        </div>
        <label className="g3-sel"><span className="sr-only">Bölge</span>
          <select value={activeZone} onChange={e => setActiveZone(e.target.value)} aria-label="Bölge filtresi">
            {ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </label>
        <button className="g3-btn" onClick={() => go('overview')} aria-label="Kamerayı sıfırla" title="Kamerayı sıfırla"><RotateCcw size={15} /></button>
        {!compact && <button className="g3-btn" aria-pressed={editMode} onClick={() => setEditMode(m => !m)}><Pencil size={15} /><span>Düzenle</span></button>}
        <span className="g3-hint"><MousePointerClick size={15} />{sel ? 'Seçili ekipman sağda' : 'Ayrıntı için ekipmana tıklayın'}</span>
      </div>

      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0"><Canvas camera={{ position: PRESETS.overview.pos.map(x => x * K) as [number, number, number], fov: 40, near: 0.1, far: 600 }} shadows dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          onCreated={({ gl }) => { gl.shadowMap.type = THREE.PCFSoftShadowMap; }}
          onPointerMissed={(e: any) => { if (e?.target?.closest?.('.g3-label, .g3-insp')) return; if (!editMode) onSelectDevice(''); }}
          className="w-full h-full">
          <color attach="background" args={[bg]} />
          <fog attach="fog" args={[bg, 90, 230]} />
          <Suspense fallback={null}>
            <SceneContent devices={devices} activeZone={activeZone} selectedId={sel} compact={compact} dark={dark} onSelect={onSelectDevice}
              offsets={offsets} layoutItems={layout?.items || []} editFocus={editFocus} pickCustom={pickCustom} controlsRef={controlsRef} />
          </Suspense>
        </Canvas></div>

        <div className="g3-legend" aria-label="Gösterge">
          <span><i className="g3-dot" />Normal</span>
          <span><i className="g3-dot" data-tone="warn" />Uyarı</span>
          <span><i className="g3-dot" data-tone="bad" />Arıza / alarm</span>
        </div>

        {editMode ? (
          <TwinEditorPanel layout={layout || null} focusId={editFocus} onFocus={setEditFocus} onChanged={() => layoutPoll.reload()} onClose={() => { setEditMode(false); setEditFocus(null); }} />
        ) : sel ? (
          <InspectorPanel deviceId={sel} onClose={() => onSelectDevice('')} onOpenTrends={onOpenTrends} />
        ) : null}
      </div>
    </div>
  );
};
