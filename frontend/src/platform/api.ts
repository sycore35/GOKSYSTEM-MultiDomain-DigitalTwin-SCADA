import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'goksystem_token';
export const getToken = (): string | null => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } window.dispatchEvent(new Event('gok-auth')); };

/** fetch wrapper: JSON in/out, operator token header, throws Error(detail) on non-2xx. */
export async function api<T = any>(path: string, opts: { method?: string; body?: any; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['X-Operator-Token'] = tok;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api/v1${path}`, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); const d = j.detail; msg = typeof d === 'string' ? d : d?.errors ? d.errors.join('; ') : JSON.stringify(d); } catch { /* ignore */ }
    throw new Error(`${res.status}: ${msg}`);
  }
  return (opts.raw ? res : await res.json()) as T;
}

/** Poll an endpoint. Exposes loading/error so every view can render empty/loading/error states. */
export function usePoll<T = any>(path: string | null, intervalMs = 2000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try { const d = await api<T>(path); if (alive.current) { setData(d); setError(null); } }
    catch (e: any) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);
  useEffect(() => {
    alive.current = true; setLoading(true); load();
    if (intervalMs <= 0) return () => { alive.current = false; };
    const id = setInterval(load, intervalMs);
    return () => { alive.current = false; clearInterval(id); };
  }, [load, intervalMs]);
  return { data, error, loading, reload: load };
}

export type Theme = 'dark' | 'light';
export const getTheme = (): Theme => (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('goksystem_theme', t); } catch { /* ignore */ }
  window.dispatchEvent(new Event('gok-theme'));
}
export function initTheme() {
  let t: Theme = 'dark';
  try { const s = localStorage.getItem('goksystem_theme'); if (s === 'light' || s === 'dark') t = s; else if (window.matchMedia('(prefers-color-scheme: light)').matches) t = 'light'; } catch { /* ignore */ }
  document.documentElement.setAttribute('data-theme', t);
}
export function useTheme(): Theme {
  const [t, setT] = useState<Theme>(getTheme());
  useEffect(() => { const h = () => setT(getTheme()); window.addEventListener('gok-theme', h); return () => window.removeEventListener('gok-theme', h); }, []);
  return t;
}
