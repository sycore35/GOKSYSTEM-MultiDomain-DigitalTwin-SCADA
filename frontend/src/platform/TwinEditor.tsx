import React, { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { api } from './api';
import { Btn, Field, useTr } from './ui';

export interface TwinItem { item_id: string; device_id: string; bind_device: string; kind: string; label: string; x: number; y: number; z: number; rot_y: number; scale: number; color: string; custom: number }

/** 3D rendering of user-added devices (persisted via /api/v1/twin/items). */
export const CustomItems: React.FC<{ items: TwinItem[]; selectedId: string | null; onSelect: (item: TwinItem) => void }> = ({ items, selectedId, onSelect }) => (
  <group name="CustomDevices">
    {items.filter(i => i.custom).map(i => {
      const sel = selectedId === i.item_id || (i.bind_device && selectedId === i.bind_device);
      return (
        <group key={i.item_id} position={[i.x, i.y, i.z]} rotation={[0, (i.rot_y * Math.PI) / 180, 0]} scale={i.scale} onClick={e => { e.stopPropagation(); onSelect(i); }}>
          {i.kind === 'MOTOR' && <mesh castShadow position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 1.1, 20]} /><meshStandardMaterial color={i.color} metalness={0.5} roughness={0.5} /></mesh>}
          {i.kind === 'PUMP' && <group><mesh castShadow position={[0, 0.45, 0]}><sphereGeometry args={[0.5, 20, 16]} /><meshStandardMaterial color={i.color} metalness={0.4} roughness={0.5} /></mesh><mesh position={[0.7, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.15, 0.15, 0.8, 12]} /><meshStandardMaterial color={i.color} /></mesh></group>}
          {i.kind === 'VALVE' && <group><mesh castShadow position={[0, 0.4, 0]}><boxGeometry args={[0.5, 0.5, 0.5]} /><meshStandardMaterial color={i.color} /></mesh><mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.08, 0.08, 0.6, 10]} /><meshStandardMaterial color="#999" /></mesh></group>}
          {i.kind === 'TANK' && <mesh castShadow position={[0, 1.2, 0]}><cylinderGeometry args={[0.9, 0.9, 2.4, 24]} /><meshStandardMaterial color={i.color} metalness={0.3} roughness={0.6} /></mesh>}
          {i.kind === 'SENSOR' && <mesh castShadow position={[0, 0.3, 0]}><cylinderGeometry args={[0.12, 0.12, 0.6, 12]} /><meshStandardMaterial color={i.color} emissive={i.color} emissiveIntensity={0.3} /></mesh>}
          {i.kind === 'PLC_CABINET' && <mesh castShadow position={[0, 1, 0]}><boxGeometry args={[0.9, 2, 0.5]} /><meshStandardMaterial color={i.color} metalness={0.2} roughness={0.7} /></mesh>}
          {i.kind === 'TRANSFORMER' && <mesh castShadow position={[0, 0.9, 0]}><boxGeometry args={[1.6, 1.8, 1.2]} /><meshStandardMaterial color={i.color} metalness={0.4} roughness={0.6} /></mesh>}
          {i.kind === 'BOX' && <mesh castShadow position={[0, 0.5, 0]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={i.color} /></mesh>}
          {sel && <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.1, 1.3, 32]} /><meshBasicMaterial color="#E6A23C" /></mesh>}
          <Html position={[0, 2.6, 0]} center distanceFactor={26} style={{ pointerEvents: 'none' }}>
            <div style={{ background: 'rgba(20,22,25,.85)', color: '#E8EAEC', font: '11px monospace', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>{i.label}</div>
          </Html>
        </group>);
    })}
  </group>
);

const KINDS = ['MOTOR', 'PUMP', 'VALVE', 'TANK', 'SENSOR', 'PLC_CABINET', 'TRANSFORMER', 'BOX'];
type Draft = { item_id?: string; device_id: string; bind_device: string; kind: string; label: string; x: number; y: number; z: number; rot_y: number; scale: number; color: string };
const NEW: Draft = { device_id: '', bind_device: '', kind: 'MOTOR', label: 'New device', x: 0, y: 0, z: 0, rot_y: 0, scale: 1, color: '#7A8A99' };

/** Edit panel: add custom devices, move/rotate/rename them, offset built-in devices; everything persists server-side. */
export const TwinEditorPanel: React.FC<{ layout: { items: TwinItem[]; devices: { device_id: string; name: string }[] } | null; focusId: string | null; onChanged: () => void; onFocus: (id: string | null) => void; onClose: () => void }> = ({ layout, focusId, onChanged, onFocus, onClose }) => {
  const tr = useTr();
  const [d, setD] = useState<Draft>(NEW);
  const [builtin, setBuiltin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    if (!focusId || !layout) return;
    const it = layout.items.find(i => i.item_id === focusId);
    if (it) { setD({ ...it }); setBuiltin(it.custom ? '' : it.device_id); }
  }, [focusId, layout]);
  const set = (k: keyof Draft, v: any) => setD(p => ({ ...p, [k]: v }));
  const num = (k: keyof Draft, label: string, step = 0.5) => (
    <Field label={label}><div className="flex gap-1"><button type="button" className="p-btn" aria-label={`${label} -`} onClick={() => set(k, +(Number(d[k]) - step).toFixed(2))} style={{ padding: 0, width: 32, justifyContent: 'center' }}>−</button>
      <input type="number" step="any" className="p-in" style={{ width: 70 }} value={d[k] as number} onChange={e => set(k, Number(e.target.value))} />
      <button type="button" className="p-btn" aria-label={`${label} +`} onClick={() => set(k, +(Number(d[k]) + step).toFixed(2))} style={{ padding: 0, width: 32, justifyContent: 'center' }}>+</button></div></Field>);
  const save = async () => {
    try {
      const body: any = { ...d };
      let saved: any;
      if (builtin) saved = await api(`/twin/items/DEV:${builtin}`, { method: 'PUT', body: { x: d.x, y: d.y, z: d.z, label: builtin } });
      else if (d.item_id) saved = await api(`/twin/items/${d.item_id}`, { method: 'PUT', body });
      else saved = await api('/twin/items', { body });
      setMsg({ ok: true, t: tr('Saved to server', 'Sunucuya kaydedildi') }); onChanged(); onFocus(saved.item_id);
    } catch (e: any) { setMsg({ ok: false, t: e.message }); }
  };
  const del = async () => { if (!d.item_id) return; try { await api(`/twin/items/${d.item_id}`, { method: 'DELETE' }); setD(NEW); setBuiltin(''); onFocus(null); setConfirmDel(false); onChanged(); } catch (e: any) { setMsg({ ok: false, t: e.message }); } };
  const reset = async () => { try { await api('/twin/reset', { method: 'POST' }); setD(NEW); setBuiltin(''); onFocus(null); onChanged(); } catch (e: any) { setMsg({ ok: false, t: e.message }); } };
  return (
    <aside aria-label={tr('Digital twin editor', 'Dijital ikiz editörü')} className="absolute top-3 right-3 bottom-3 w-[min(360px,calc(100%-24px))] p-card p-3 z-[60] overflow-y-auto font-mono" style={{ background: 'var(--p-surface)' }}>
      <div className="flex items-center justify-between mb-2"><h2 className="text-xs font-bold uppercase" style={{ color: 'var(--p-text)' }}>{tr('Twin editor', 'İkiz editörü')}</h2><Btn onClick={onClose}>{tr('Done', 'Bitti')}</Btn></div>
      <div className="space-y-2">
        <Field label={tr('Edit', 'Düzenle')}>
          <select className="p-in" value={focusId || (builtin ? `DEV:${builtin}` : '')} onChange={e => {
            const v = e.target.value; setMsg(null); setConfirmDel(false);
            if (!v) { setD(NEW); setBuiltin(''); onFocus(null); }
            else if (v.startsWith('DEV:')) { const id = v.slice(4); const ov = layout?.items.find(i => i.device_id === id && !i.custom); setBuiltin(id); setD({ ...NEW, ...(ov || {}), device_id: id, label: id, x: ov?.x ?? 0, y: ov?.y ?? 0, z: ov?.z ?? 0 }); onFocus(ov?.item_id || null); }
            else { setBuiltin(''); onFocus(v); } }}>
            <option value="">{tr('+ New custom device', '+ Yeni özel cihaz')}</option>
            <optgroup label={tr('Custom devices', 'Özel cihazlar')}>{layout?.items.filter(i => i.custom).map(i => <option key={i.item_id} value={i.item_id}>{i.label} ({i.item_id})</option>)}</optgroup>
            <optgroup label={tr('Built-in devices (offset)', 'Yerleşik cihazlar (kaydırma)')}>{layout?.devices.map(x => <option key={x.device_id} value={`DEV:${x.device_id}`}>{x.device_id}</option>)}</optgroup>
          </select>
        </Field>
        {!builtin && <>
          <Field label={tr('Label', 'Etiket')}><input className="p-in" value={d.label} onChange={e => set('label', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr('Kind', 'Tür')}><select className="p-in" value={d.kind} onChange={e => set('kind', e.target.value)}>{KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
            <Field label={tr('Color', 'Renk')}><input type="color" className="p-in" style={{ padding: 2 }} value={d.color} onChange={e => set('color', e.target.value)} /></Field>
          </div>
          <Field label={tr('Bind to live device (inspector data)', 'Canlı cihaza bağla (denetçi verisi)')}><select className="p-in" value={d.bind_device} onChange={e => set('bind_device', e.target.value)}><option value="">-</option>{layout?.devices.map(x => <option key={x.device_id} value={x.device_id}>{x.device_id}</option>)}</select></Field>
        </>}
        {builtin && <div className="text-[10px]" style={{ color: 'var(--p-muted)' }}>{tr('Offsets are added to the built-in position of', 'Kaydırma değerleri şu yerleşik konuma eklenir')} {builtin}.</div>}
        <div className="grid grid-cols-1 gap-2">{num('x', builtin ? 'ΔX (m)' : 'X (m)')}{num('y', builtin ? 'ΔY (m)' : 'Y (m)')}{num('z', builtin ? 'ΔZ (m)' : 'Z (m)')}{!builtin && <>{num('rot_y', tr('Rotation (°)', 'Dönüş (°)'), 15)}{num('scale', tr('Scale', 'Ölçek'), 0.1)}</>}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Btn variant="primary" onClick={save}>{d.item_id || builtin ? tr('Save', 'Kaydet') : tr('Add to scene', 'Sahneye ekle')}</Btn>
          {d.item_id && (confirmDel ? <Btn variant="danger" onClick={del}>{tr('Confirm', 'Onayla')}</Btn> : <Btn variant="danger" onClick={() => setConfirmDel(true)}>{builtin ? tr('Reset position', 'Konumu sıfırla') : tr('Delete', 'Sil')}</Btn>)}
          <Btn onClick={reset}>{tr('Reset all', 'Tümünü sıfırla')}</Btn>
        </div>
        {msg && <div role={msg.ok ? 'status' : 'alert'} className="text-[11px]" style={{ color: msg.ok ? 'var(--p-ok)' : 'var(--p-bad)' }}>{msg.t}</div>}
        <p className="text-[10px]" style={{ color: 'var(--p-dim)' }}>{tr('Click a custom device in the scene to select it. Layout is stored in the platform database.', 'Seçmek için sahnedeki özel cihaza tıklayın. Yerleşim platform veritabanında saklanır.')}</p>
      </div>
    </aside>
  );
};
