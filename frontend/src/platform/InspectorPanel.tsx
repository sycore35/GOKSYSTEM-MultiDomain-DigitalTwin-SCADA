import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, ExternalLink, ChevronDown } from 'lucide-react';
import { api, usePoll } from './api';
import { LineChart } from './ui';
import { DEVICE_META, unitTr, fmtNum, statusTone, statusTr, deviceName } from './meta';

export const POINT_TR: Record<string, string> = {
  speed: 'Hız', target_speed: 'Hedef hız', load_kg: 'Yük', part_count: 'Parça sayısı', pull_cord_tripped: 'Acil çekme ipi', sensor_entry: 'Giriş sensörü',
  joint1_deg: 'Eklem 1', joint2_deg: 'Eklem 2', joint3_deg: 'Eklem 3', payload_kg: 'Taşınan yük', light_curtain_ok: 'Işık perdesi',
  rpm: 'Devir', temperature_c: 'Sıcaklık', vibration_rms: 'Titreşim', current_a: 'Akım', frequency_hz: 'Frekans', power_kw: 'Aktif güç',
  power_factor: 'Güç faktörü', efficiency_pct: 'Verim', torque_nm: 'Tork',
  v_primary_kv: 'Primer gerilim', v_secondary_v: 'Sekonder gerilim', load_kva: 'Yük', oil_temp_c: 'Yağ sıcaklığı', winding_hotspot_c: 'Sargı sıcak noktası',
  state: 'Konum', current_l1_a: 'Akım L1', tripped_ansi_code: 'Açma kodu', voltage_kv: 'Gerilim', total_p_mw: 'Aktif güç', total_q_mvar: 'Reaktif güç',
  level_pct: 'Seviye', volume_liters: 'Hacim', temp_c: 'Sıcaklık', ph_value: 'pH', ph_setpoint: 'pH hedefi',
  flow_m3h: 'Debi', discharge_press_bar: 'Çıkış basıncı', cavitation_risk: 'Kavitasyon riski', position_pct: 'Konum',
  current_temp_c: 'Oda sıcaklığı', target_temp_c: 'Hedef sıcaklık', humidity_pct: 'Nem', co2_ppm: 'CO₂', fan_power_kw: 'Fan gücü',
  irradiance_wm2: 'Işınım', output_kw: 'Çıkış gücü', daily_yield_kwh: 'Günlük üretim', soc_pct: 'Şarj durumu', cell_max_v: 'Maks. hücre', cell_min_v: 'Min. hücre', balancing_active: 'Dengeleme', sensor_exit: 'Çıkış sensörü', sensor_height_low: 'Alçak yükseklik sensörü', sensor_height_high: 'Yüksek yükseklik sensörü', pallet_detected: 'Palet algılandı', optical_height_mm: 'Optik yükseklik', measured_weight_kg: 'Ölçülen ağırlık', vibration_fft_185hz_amp: 'Titreşim FFT 185 Hz',
};
const pt = (p: string) => POINT_TR[p] || p.replace(/_/g, ' ');

const Spark: React.FC<{ pts: { t: number; v: number }[]; color: string }> = ({ pts, color }) => {
  if (!pts || pts.length < 2) return <div style={{ height: 28 }} />;
  const W = 120, H = 28;
  const vs = pts.map(p => p.v); let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const d = pts.map(p => `${(((p.t - t0) / Math.max(1, t1 - t0)) * W).toFixed(1)},${(H - 2 - ((p.v - lo) / (hi - lo)) * (H - 4)).toFixed(1)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 28 }} aria-hidden="true"><polyline points={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
};

const H: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mb-2"><h3 style={{ font: '600 12px var(--font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--p-dim)', margin: 0 }}>{children}</h3>{right}</div>
);

/** Tıkla-denetle paneli: veriler /api/v1/inspector/{id} (canlı motor verisi + ms halka tamponu trendi). */
export const InspectorPanel: React.FC<{ deviceId: string; onClose: () => void; onOpenTrends?: (id: string, point?: string) => void }> = ({ deviceId, onClose, onOpenTrends }) => {
  const { data, error, loading, reload } = usePoll<any>(`/inspector/${encodeURIComponent(deviceId)}?window_s=120`, 1000);
  const [metric, setMetric] = useState<string>('');
  const [showAll, setShowAll] = useState(false);
  const [msg, setMsg] = useState('');
  const meta = DEVICE_META[deviceId];

  const ack = async (id: string) => {
    try { await api(`/alarms/${id}/ack`, { method: 'POST' }); setMsg('Alarm onaylandı.'); reload(); } catch (e: any) { setMsg(e.message); }
  };

  const trendPts: string[] = data ? Object.keys(data.trend) : [];
  const km: Record<string, any> = data?.key_metrics || {};
  const stateByPoint: Record<string, any> = {};
  Object.values(km).forEach((m: any) => { stateByPoint[m.point] = m; });
  const cards = trendPts.slice(0, 6);
  const sel = metric && trendPts.includes(metric) ? metric : (meta?.key && trendPts.includes(meta.key) ? meta.key : trendPts[0] || '');
  const selSeries = data && sel ? data.trend[sel] || [] : [];
  const tone = statusTone(data?.status);
  const bannerTone = data?.alarms?.length ? 'bad' : tone;

  return (
    <aside role="dialog" aria-label={`Varlık denetçisi: ${deviceName(deviceId)}`} className="g3-insp">
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid var(--p-border)' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2" style={{ color: 'var(--p-dim)', fontSize: 12 }}>
              <span className="font-value" style={{ fontWeight: 600, color: 'var(--p-muted)' }}>{meta?.short || deviceId}</span><span>·</span><span>{meta?.zone || data?.device?.domain}</span>
            </div>
            <h2 style={{ font: '600 18px/1.25 var(--font-ui)', margin: '2px 0 0' }} className="truncate">{meta?.name || data?.device?.name || deviceId}</h2>
            <div className="font-value truncate" style={{ fontSize: 12, color: 'var(--p-dim)' }}>{deviceId}</div>
          </div>
          <button className="icon-btn shrink-0" onClick={onClose} aria-label="Denetçiyi kapat"><X size={18} /></button>
        </div>
        {data && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-[3px]" style={{
            background: bannerTone === 'bad' ? 'var(--p-bad-bg)' : bannerTone === 'warn' ? 'var(--p-warn-bg)' : 'var(--p-sunken)',
            border: `1px solid ${bannerTone === 'bad' ? 'var(--p-bad)' : bannerTone === 'warn' ? 'var(--p-warn)' : 'var(--p-border)'}` }}>
            {bannerTone === 'ok' ? <CheckCircle2 size={16} style={{ color: 'var(--p-dim)' }} /> : <AlertTriangle size={16} style={{ color: bannerTone === 'bad' ? 'var(--p-bad)' : 'var(--p-warn)' }} />}
            <span style={{ fontWeight: 600, fontSize: 14 }}>{statusTr(data.status)}</span>
            <span className="ml-auto" style={{ fontSize: 13, color: 'var(--p-muted)' }}>{data.alarms.length ? `${data.alarms.length} aktif alarm` : 'Alarm yok'}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {loading && !data && <p style={{ color: 'var(--p-muted)' }}>Yükleniyor…</p>}
        {error && !data && <p role="alert" style={{ color: 'var(--p-bad)' }}>Hata: {error}</p>}
        {data && (<>
          <section>
            <H>Canlı değerler</H>
            <div className="grid grid-cols-2 gap-2">
              {cards.map(p => {
                const tv = data.telemetry[p]; const st = stateByPoint[p]; const bad = st && st.alarm_state && st.alarm_state !== 'NORMAL';
                const col = bad ? 'var(--p-bad)' : 'var(--p-muted)';
                return (
                  <button key={p} onClick={() => setMetric(p)} aria-pressed={sel === p} className="text-left p-3 rounded-[3px] transition-colors"
                    style={{ background: bad ? 'var(--p-bad-bg)' : 'var(--p-raised)', border: `1px solid ${sel === p ? 'var(--p-accent)' : bad ? 'var(--p-bad)' : 'var(--p-border)'}`, boxShadow: sel === p ? 'inset 0 -2px 0 var(--p-accent)' : undefined }}>
                    <div className="truncate" style={{ fontSize: 12, color: 'var(--p-muted)' }}>{pt(p)}</div>
                    <div className="font-value" style={{ fontSize: 22, lineHeight: 1.2, color: bad ? 'var(--p-bad)' : 'var(--p-text)' }}>
                      {tv ? fmtNum(tv.value, Math.abs(tv.value) >= 1000 ? 0 : Math.abs(tv.value) >= 100 ? 1 : 2) : '—'}
                      <span style={{ fontSize: 12, color: 'var(--p-dim)', marginLeft: 4, fontFamily: 'var(--font-ui)' }}>{unitTr(tv?.unit)}</span>
                    </div>
                    <Spark pts={data.trend[p]} color={bad ? 'var(--p-bad)' : 'var(--p-dim)'} />
                    {bad && <div style={{ fontSize: 12, color: col }}>Limit aşıldı{st.limit != null ? ` (${st.limit})` : ''}</div>}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <H right={onOpenTrends && sel ? <button className="inline-flex items-center gap-1 text-[13px]" style={{ color: 'var(--p-accent)' }} onClick={() => onOpenTrends(deviceId, sel)}>Analizörde aç <ExternalLink size={13} /></button> : undefined}>
              Trend · {pt(sel)} · son {data.trend_window_s} sn
            </H>
            {selSeries.length > 1
              ? <LineChart title={`${deviceName(deviceId)} ${pt(sel)}`} height={140} series={[{ name: pt(sel), unit: data.trend_units[sel], points: selSeries }]} />
              : <p style={{ color: 'var(--p-muted)', fontSize: 13 }}>Trend doluyor (motor duraklatıldı ya da yeni başladı).</p>}
          </section>

          {data.alarms.length > 0 && (
            <section>
              <H>Aktif alarmlar</H>
              {data.alarms.map((a: any) => (
                <div key={a.alarm_id} className="p-3 rounded-[3px] mb-2" style={{ background: 'var(--p-bad-bg)', border: '1px solid var(--p-bad)' }}>
                  <div className="flex items-center justify-between gap-2"><b style={{ fontSize: 14 }}>P{a.priority} · {a.message}</b><span className="p-badge" data-tone="bad">{statusTr(a.state)}</span></div>
                  <div className="font-value" style={{ fontSize: 13, color: 'var(--p-muted)' }}>{fmtNum(a.current_value, 2)} / limit {fmtNum(a.setpoint_or_limit, 2)}</div>
                  {(a.state === 'UNACK_ALARM' || a.state === 'RTN_UNACK') && <button className="p-btn mt-2" onClick={() => ack(a.alarm_id)}>Onayla</button>}
                </div>
              ))}
            </section>
          )}
          {msg && <div role="status" style={{ fontSize: 13, color: 'var(--p-muted)' }}>{msg}</div>}

          {data.health && (
            <section>
              <H>Sağlık indeksi (tahmin)</H>
              <div className="p-3 rounded-[3px]" style={{ background: 'var(--p-raised)', border: '1px solid var(--p-border)' }}>
                <div className="flex items-baseline justify-between"><span className="font-value" style={{ fontSize: 26 }}>{data.health.health_index}<span style={{ fontSize: 13, color: 'var(--p-dim)' }}> / 100</span></span><span className="p-badge" data-tone={statusTone(data.health.status) === 'ok' ? undefined : statusTone(data.health.status)}>{statusTr(data.health.status)}</span></div>
                <div className="mt-2 h-1.5 rounded-sm" style={{ background: 'var(--p-sunken)' }}><div className="h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(100, data.health.health_index))}%`, background: data.health.health_index < 50 ? 'var(--p-bad)' : data.health.health_index < 75 ? 'var(--p-warn)' : 'var(--p-dim)' }} /></div>
                {data.health.explanation.map((e: string, i: number) => <div key={i} style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 4 }}>• {e}</div>)}
                <div style={{ fontSize: 12, color: 'var(--p-dim)', marginTop: 6 }}>Kalibre edilmemiş mühendislik tahminidir.</div>
              </div>
            </section>
          )}

          <section>
            <H>Çalışma geçmişi</H>
            {data.alarm_history.length === 0
              ? <p style={{ color: 'var(--p-muted)', fontSize: 13 }}>Bu oturumda alarm geçişi kaydı yok. Cihaz kesintisiz normal çalışıyor.</p>
              : <ol className="space-y-2" style={{ borderLeft: '1px solid var(--p-border-strong)', marginLeft: 4 }}>
                  {data.alarm_history.slice(0, 8).map((e: any) => (
                    <li key={e.seq} className="pl-3 relative" style={{ fontSize: 13 }}>
                      <span className="dot absolute" style={{ left: -5, top: 6, width: 9, height: 9 }} data-tone={statusTone(e.to_state) === 'ok' ? undefined : statusTone(e.to_state)} />
                      <div><b>{statusTr(e.to_state)}</b> <span style={{ color: 'var(--p-muted)' }}>{e.alarm_id}</span></div>
                      <div className="font-value" style={{ fontSize: 12, color: 'var(--p-dim)' }}>{new Date(e.wall_time * 1000).toLocaleTimeString('tr-TR')}{e.operator ? ` · ${e.operator}` : ''}</div>
                    </li>
                  ))}
                </ol>}
          </section>

          <section>
            <button className="flex items-center gap-1 text-[13px] font-medium" style={{ color: 'var(--p-accent)' }} aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>
              <ChevronDown size={14} style={{ transform: showAll ? 'rotate(180deg)' : undefined, transition: 'transform 180ms' }} />Tüm telemetri ({Object.keys(data.telemetry).length})
            </button>
            {showAll && <ul className="mt-2">{Object.entries(data.telemetry).map(([k, v]: [string, any]) => (
              <li key={k} className="flex justify-between gap-3 py-1" style={{ fontSize: 13, borderBottom: '1px solid var(--p-border)' }}>
                <span style={{ color: 'var(--p-muted)' }}>{pt(k)}</span><span className="font-value">{fmtNum(v.value, 2)} {unitTr(v.unit)}</span></li>))}</ul>}
          </section>
        </>)}
      </div>
    </aside>
  );
};
