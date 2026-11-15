import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Panel } from '../platform/kit';

// Kalıcı, hash zincirli denetim kaydı (/api/v1/audit/log). Sunucu açılışı dahil her olay burada.
interface ChainRecord { id: number; ts: number; actor: string; role: string; action: string; target: string; status: string; hash: string }
interface ChainVerify { valid: boolean; records: number; broken_at_id: number | null }

const ACTION_TR: Record<string, string> = {
  SERVER_START: 'Sunucu başlatıldı', SERVER_STOP: 'Sunucu durduruldu', LOGIN: 'Oturum açıldı', LOGOUT: 'Oturum kapatıldı',
  COMMAND: 'Operatör komutu', FAULT_INJECT: 'Arıza enjekte edildi', SCENARIO_RUN: 'Senaryo başlatıldı', SCENARIO_STOP: 'Senaryo durduruldu',
  ALARM_ACK: 'Alarm onaylandı', ALARM_ACK_ALL: 'Tüm alarmlar onaylandı', ALARM_SHELVE: 'Alarm rafa kaldırıldı', ALARM_UNSHELVE: 'Alarm raftan alındı',
  ALARM_CONFIG: 'Alarm ayarı değişti', PID_LIVE_TUNE: 'PID canlı ayar', PID_DISTURBANCE: 'PID bozucu etki', PLC_RUN: 'PLC çalıştırıldı', PLC_STOP: 'PLC durduruldu',
  PLC_FORCE: 'PLC zorlama', PLC_PROGRAM_LOAD: 'PLC programı yüklendi', PLC_PROGRAM_DEFAULT: 'Varsayılan PLC programı', PLC_WRITE_MODE: 'PLC yazma modu',
  PROTOCOL_SIM_START: 'Protokol sim. başladı', PROTOCOL_SIM_STOP: 'Protokol sim. durdu', PROTOCOL_SIM_WRITE_MODE: 'Protokol yazma modu',
  ASSET_CREATE: 'Varlık eklendi', ASSET_UPDATE: 'Varlık güncellendi', ASSET_DELETE: 'Varlık silindi', USER_UPSERT: 'Kullanıcı kaydedildi',
  TWIN_ITEM_SAVE: 'İkiz öğesi kaydedildi', TWIN_ITEM_DELETE: 'İkiz öğesi silindi', TWIN_RESET: 'İkiz sıfırlandı', ENERGY_RESET: 'Enerji sayaçları sıfırlandı',
  PERMISSION_DENIED: 'Yetki reddedildi', FACTORYIO_CONFIG: 'Factory I/O ayarı', FACTORYIO_COMMAND: 'Factory I/O komutu', FACTORYIO_COMMAND_MODE: 'Factory I/O komut modu',
};
const fmtTime = (ts: number) => new Date(ts * 1000).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' });
const ok = (s: string) => s === 'OK' || s === 'SUCCESS';

export const EventAuditView: React.FC = () => {
  const [logs, setLogs] = useState<ChainRecord[]>([]);
  const [chain, setChain] = useState<ChainVerify | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([fetch('/api/v1/audit/log?limit=200'), fetch('/api/v1/audit/verify')]);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLogs(await r.json()); if (v.ok) setChain(await v.json()); setErr('');
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const chainBadge = chain && (
    <span className="p-badge" data-tone={chain.valid ? undefined : 'bad'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {chain.valid ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
      {chain.valid ? `Zincir doğrulandı · ${chain.records} kayıt` : `Zincir bozuk · #${chain.broken_at_id}`}
    </span>);
  return (
    <Panel title={`Denetim kayıtları (${logs.length})`} right={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{chainBadge}
      <button className="p-btn" onClick={load}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Yenile</button></span>} flush>
      {err ? <p className="p-4" role="alert" style={{ color: 'var(--p-bad)' }}>Kayıtlar alınamadı: {err}</p>
        : logs.length === 0 ? <p className="p-4" style={{ color: 'var(--p-muted)' }}>Henüz kayıt yok.</p> : (
          <div className="overflow-x-auto"><table className="p-tbl">
            <thead><tr><th>Zaman</th><th>Kişi</th><th>Rol</th><th>Eylem</th><th>Hedef</th><th>Sonuç</th><th>Hash</th></tr></thead>
            <tbody>{logs.map(l => (
              <tr key={l.id}><td className="font-value">{fmtTime(l.ts)}</td><td>{l.actor}</td><td>{l.role}</td>
                <td title={l.action}>{ACTION_TR[l.action] ?? l.action}</td><td>{l.target}</td>
                <td><span className="p-badge" data-tone={ok(l.status) ? undefined : 'bad'}>{ok(l.status) ? 'Başarılı' : l.status === 'REJECTED' || l.status === 'DENIED' ? 'Reddedildi' : l.status}</span></td>
                <td className="font-value" style={{ color: 'var(--p-muted)' }}>{(l.hash || '').slice(0, 10)}</td></tr>
            ))}</tbody></table></div>)}
    </Panel>
  );
};
