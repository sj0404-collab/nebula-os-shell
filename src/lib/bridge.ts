/**
 * Where the opencode bridge lives.
 *  - Web (served by vite or by the bridge itself): same origin → `/api/opencode`.
 *  - Android/Capacitor app or a static host: the bridge runs on your PC → set its URL
 *    (e.g. http://192.168.1.10:8787) — stored in localStorage, editable from the opencode window.
 */
const KEY = 'nebula.bridgeUrl';

declare global { interface Window { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } } }

export const isNativeApp = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
export const nativePlatform = () => (typeof window !== 'undefined' && window.Capacitor?.getPlatform?.()) || 'web';

export function getBridgeUrl(): string {
  try { return (localStorage.getItem(KEY) ?? '').trim().replace(/\/+$/, ''); } catch { return ''; }
}
export function setBridgeUrl(url: string) {
  try { const v = url.trim().replace(/\/+$/, ''); if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}
/** Base for API calls: `<bridge>/api/opencode` or the same-origin proxy. */
export function apiBase(): string {
  const u = getBridgeUrl();
  return u ? `${u}/api/opencode` : '/api/opencode';
}
