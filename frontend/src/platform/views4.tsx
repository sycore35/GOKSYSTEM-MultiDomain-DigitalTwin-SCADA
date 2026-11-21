import React, { useEffect, useState } from 'react';
import { api, getToken, setToken, usePoll } from './api';
import { Badge, Btn, Card, Field, Notice, Page, State, Table, toneFor, useTr } from './ui';

export const useOperator = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => { const h = () => setTick(t => t + 1); window.addEventListener('gok-auth', h); return () => window.removeEventListener('gok-auth', h); }, []);
  return usePoll<any>(`/auth/me?_=${tick}`, 0);
};

export const LoginBox: React.FC = () => {
  const tr = useTr();
  const me = useOperator();
  const [u, setU] = useState('operator'), [pin, setPin] = useState(''), [err, setErr] = useState(''), [open, setOpen] = useState(false);
  const login = async (e: React.FormEvent) => { e.preventDefault(); try { const r = await api('/auth/login', { body: { username: u, pin } }); setToken(r.token); setPin(''); setErr(''); setOpen(false); } catch (x: any) { setErr(x.message); } };
  const loggedIn = !!getToken() && me.data;
  return (
    <div className="text-[10px] font-mono" style={{ color: 'var(--p-muted)' }}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate" title={me.data?.username}>{me.data ? `${me.data.username} · ${me.data.role}` : '...'}</span>
        {loggedIn ? <button className="underline" onClick={async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ } setToken(null); }}>{tr('Logout', 'Çıkış')}</button>
          : <button className="underline" aria-expanded={open} onClick={() => setOpen(o => !o)}>{tr('Login', 'Giriş')}</button>}
      </div>
      {open && !loggedIn && <form onSubmit={login} className="mt-1 space-y-1">
        <select aria-label="user" className="p-in w-full" value={u} onChange={e => setU(e.target.value)}>{['viewer', 'operator', 'engineer', 'admin'].map(x => <option key={x}>{x}</option>)}</select>
        <input aria-label="PIN" type="password" autoComplete="off" className="p-in w-full" placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />
        <Btn type="submit" variant="primary" className="w-full">{tr('Sign in', 'Giriş yap')}</Btn>
        {err && <div role="alert" style={{ color: 'var(--p-bad)' }}>{err}</div>}</form>}
    </div>
  );
};

export const OperatorsView: React.FC = () => {
  const tr = useTr();
  const mode = usePoll<any>('/auth/mode', 0);
  const me = useOperator();
  const canManage = !!me.data?.permissions?.includes('MANAGE_USERS');
  const users = usePoll<any[]>(canManage ? '/operators' : null, 0);     // yetkisizken 403 isteği gönderme
  const [filter, setFilter] = useState('');
  const log = usePoll<any[]>(`/audit/log?limit=100${filter ? `&action=${encodeURIComponent(filter)}` : ''}`, 3000);
  const chain = usePoll<any>('/audit/verify', 5000);
  const [nu, setNu] = useState({ username: '', display: '', role: 'OPERATOR', pin: '' }), [msg, setMsg] = useState('');
  const add = async (e: React.FormEvent) => { e.preventDefault(); try { await api('/operators', { body: nu }); setMsg(tr('Saved', 'Kaydedildi')); setNu({ ...nu, username: '', pin: '' }); users.reload(); } catch (x: any) { setMsg(x.message); } };
  return (
    <Page title={tr('Operator Management', 'Operatör Yönetimi')} subtitle={tr('Roles, permissions, sessions and a hash-chained audit trail', 'Roller, yetkiler, oturumlar ve hash zincirli denetim izi')}>
      {mode.data && <Notice tone={mode.data.auth_required ? 'info' : 'warn'}>{mode.data.auth_required ? tr('Authentication required for mutating calls.', 'Değiştirici çağrılar için kimlik doğrulama zorunlu.') : tr(`Open demo mode: unauthenticated requests act as ${mode.data.default_role}. Start with GOKSYSTEM_AUTH_REQUIRED=1 to enforce login. This is a simulator access layer, not a hardened identity system.`, `Açık demo modu: kimliksiz istekler ${mode.data.default_role} olarak çalışır. Girişi zorlamak için GOKSYSTEM_AUTH_REQUIRED=1 ile başlatın. Bu bir simülatör erişim katmanıdır, sertleştirilmiş kimlik sistemi değildir.`)}</Notice>}
      <div className="grid xl:grid-cols-3 gap-3">
        <Card title={tr('Role permissions', 'Rol yetkileri')}>
          {mode.data && Object.entries<string[]>(mode.data.roles).map(([r, p]) => <div key={r} className="mb-2 text-[11px] font-mono"><b style={{ color: me.data?.role === r ? 'var(--p-accent)' : 'var(--p-text)' }}>{r}</b><div style={{ color: 'var(--p-dim)' }}>{p.join(', ')}</div></div>)}
        </Card>
        <Card title={tr('Users', 'Kullanıcılar')}>
          {!canManage || users.error ? <div className="text-[11px] font-mono" style={{ color: 'var(--p-warn)' }}>{tr('User list needs MANAGE_USERS (log in as admin).', 'Kullanıcı listesi MANAGE_USERS gerektirir (admin ile girin).')}</div> :
            <Table head={[tr('User', 'Kullanıcı'), tr('Role', 'Rol'), tr('Active', 'Aktif')]}>{users.data?.map(u => <tr key={u.username}><td>{u.username}</td><td>{u.role}</td><td>{u.active ? '✔' : '✖'}</td></tr>)}</Table>}
          {canManage && !users.error && <form onSubmit={add} className="grid grid-cols-2 gap-2 mt-3">
            <Field label={tr('Username', 'Kullanıcı adı')}><input required className="p-in" value={nu.username} onChange={e => setNu({ ...nu, username: e.target.value })} /></Field>
            <Field label={tr('Role', 'Rol')}><select className="p-in" value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value })}>{['VIEWER', 'OPERATOR', 'ENGINEER', 'ADMIN'].map(r => <option key={r}>{r}</option>)}</select></Field>
            <Field label="PIN (min 4)"><input required type="password" minLength={4} autoComplete="new-password" className="p-in" value={nu.pin} onChange={e => setNu({ ...nu, pin: e.target.value })} /></Field>
            <div className="flex items-end"><Btn variant="primary" type="submit">{tr('Add / update', 'Ekle / güncelle')}</Btn></div></form>}
          {msg && <div role="status" className="text-[11px] font-mono mt-1" style={{ color: 'var(--p-muted)' }}>{msg}</div>}
        </Card>
        <Card title={tr('Audit chain integrity', 'Denetim zinciri bütünlüğü')}>
          {chain.data && <><Badge tone={chain.data.valid ? 'ok' : 'bad'}>{chain.data.valid ? tr('CHAIN VALID', 'ZİNCİR GEÇERLİ') : `BROKEN @${chain.data.broken_at_id}`}</Badge><div className="text-[11px] font-mono mt-1" style={{ color: 'var(--p-muted)' }}>{chain.data.records} {tr('records', 'kayıt')}. {tr('Tamper-evident (SHA-256 chain), not tamper-proof.', 'Kurcalamayı belli eder (SHA-256 zinciri), engellemez.')}</div></>}
        </Card>
      </div>
      <Card title={tr('Event history / audit trail', 'Olay geçmişi / denetim izi')} right={<input aria-label={tr('Filter action', 'Eylem filtrele')} className="p-in" placeholder={tr('filter action...', 'eylem filtrele...')} value={filter} onChange={e => setFilter(e.target.value)} />}>
        <State loading={log.loading && !log.data} error={log.error} empty={!!log.data && log.data.length === 0} />
        {log.data && log.data.length > 0 && <div className="max-h-[420px] overflow-y-auto"><Table head={[tr('Time', 'Zaman'), tr('Actor', 'Kim'), tr('Role', 'Rol'), tr('Action', 'Eylem'), tr('Target', 'Hedef'), tr('Status', 'Durum'), tr('Details', 'Ayrıntı')]}>
          {log.data.map(r => <tr key={r.id}><td>{new Date(r.ts * 1000).toLocaleTimeString()}</td><td>{r.actor}</td><td>{r.role}</td><td>{r.action}</td><td>{r.target}</td><td><Badge tone={r.status === 'OK' ? 'ok' : 'bad'}>{r.status}</Badge></td><td className="text-[10px]" style={{ color: 'var(--p-dim)' }}>{JSON.stringify(r.details).slice(0, 90)}</td></tr>)}</Table></div>}
      </Card>
    </Page>
  );
};

const MAP = [
  ['FC02 DI', '0 motor running · 1 any alarm · 2 breaker closed · 3 pull-cord tripped · 4 pump running · 5 critical alarm · 6 PLC run · 7 sim running'],
  ['FC01/05/15 Coil', '0 conveyor run · 1 E-stop (1=E_STOP, 0=RESET) · 2 pump run · 3 ack-all alarms (write 1)'],
  ['FC04 IR', '0 speed×100 · 1 rpm · 2 motor T×10 · 3 current×10 · 4 vibration×100 · 5 tank level×10 · 6 pH×100 · 7 trafo kVA · 8 site P×10 kW · 9 pump T×10 · 10 pump I×10 · 11 solar×10 · 12 SOC×10 · 13 alarms · 14 unack · 15 sim time'],
  ['FC03/06/16 HR', '0 speed setpoint×100 · 1 valve position×10 · 2 HVAC setpoint×10'],
];
export const ProtocolView: React.FC = () => {
  const tr = useTr();
  const { data, error, loading, reload } = usePoll<any>('/protocol-sim', 1500);
  const fio = usePoll<any>('/factoryio/status', 2000);
  const [port, setPort] = useState(5020), [msg, setMsg] = useState('');
  const [fh, setFh] = useState({ mode: 'mock', host: '127.0.0.1', port: 502 });
  const act = async (p: string, body?: any) => { try { await api(p, { body: body ?? {} }); setMsg(''); reload(); fio.reload(); } catch (e: any) { setMsg(e.message); } };
  return (
    <Page title={tr('Protocol Simulator', 'Protokol Simülatörü')} subtitle={tr('Modbus TCP server on 127.0.0.1 backed by live plant data; Factory I/O client configuration', '127.0.0.1 üzerinde canlı tesis verisiyle Modbus TCP sunucusu; Factory I/O istemci ayarı')}>
      <State loading={loading && !data} error={error} />
      {data && <Card title="Modbus TCP server" right={<Badge tone={data.running ? 'ok' : 'dim'}>{data.running ? `LISTENING ${data.host}:${data.port}` : 'STOPPED'}</Badge>}>
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Port (loopback)"><input type="number" className="p-in" style={{ width: 100 }} value={port} onChange={e => setPort(Number(e.target.value))} disabled={data.running} /></Field>
          {data.running ? <Btn variant="danger" onClick={() => act('/protocol-sim/stop')}>{tr('Stop', 'Durdur')}</Btn> : <Btn variant="primary" onClick={() => act('/protocol-sim/start', { port })}>{tr('Start', 'Başlat')}</Btn>}
          <label className="flex items-center gap-2 text-[11px] font-mono min-h-[36px]" style={{ color: 'var(--p-text)' }}><input type="checkbox" checked={data.write_enabled} onChange={e => act('/protocol-sim/write-mode', { enabled: e.target.checked })} />{tr('Allow writes (commands the plant)', 'Yazmaya izin ver (tesise komut verir)')}</label>
        </div>
        <div className="text-[11px] font-mono mt-2" style={{ color: 'var(--p-muted)' }}>{tr('Clients', 'İstemci')}: {data.clients} · {tr('requests', 'istek')}: {data.stats.requests} · {tr('exceptions', 'istisna')}: {data.stats.exceptions} · {tr('writes ok/rejected', 'yazma ok/red')}: {data.stats.writes_accepted}/{data.stats.writes_rejected}</div>
        <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--p-dim)' }}>{data.opc_ua}</div>
      </Card>}
      <Card title={tr('Register map (0-based addresses)', 'Register haritası (0 tabanlı adresler)')}><Table head={[tr('Table', 'Tablo'), tr('Map', 'Harita')]}>{MAP.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</Table>
        <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--p-dim)' }}>{tr('Rejected writes return exception 04 (slave device failure).', 'Reddedilen yazmalar 04 istisnası (slave device failure) döndürür.')}</div></Card>
      <Card title={tr('Factory I/O client adapter', 'Factory I/O istemci adaptörü')} right={fio.data && <Badge tone={toneFor(fio.data.connected ? 'ONLINE' : 'FAULT')}>{fio.data.state}</Badge>}>
        {fio.data && <div className="text-[11px] font-mono mb-2" style={{ color: 'var(--p-muted)' }}>{fio.data.mode} · polls {fio.data.poll_count} · {tr('errors', 'hata')} {fio.data.error_count} · {fio.data.hardware_status}{fio.data.last_error ? ` · ${fio.data.last_error}` : ''}</div>}
        <div className="flex flex-wrap gap-3 items-end">
          <Field label="Mode"><select className="p-in" value={fh.mode} onChange={e => setFh({ ...fh, mode: e.target.value })}><option value="mock">mock</option><option value="live">live</option><option value="off">off</option></select></Field>
          <Field label="Host"><input className="p-in" value={fh.host} onChange={e => setFh({ ...fh, host: e.target.value })} /></Field>
          <Field label="Port"><input type="number" className="p-in" style={{ width: 90 }} value={fh.port} onChange={e => setFh({ ...fh, port: Number(e.target.value) })} /></Field>
          <Btn variant="primary" onClick={() => act('/factoryio/config', fh)}>{tr('Apply', 'Uygula')}</Btn>
        </div>
      </Card>
      {msg && <div role="alert" className="text-[11px] font-mono" style={{ color: 'var(--p-bad)' }}>{msg}</div>}
    </Page>
  );
};
