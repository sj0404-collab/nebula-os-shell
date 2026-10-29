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

/** How the opencode window talks to the agent: on-device native loop, the PC bridge, or auto (native in the APK, bridge on the web). */
export type AgentMode = 'auto' | 'native' | 'bridge';
const MODE_KEY = 'nebula.agentMode', ZEN_KEY = 'nebula.zenKey';
export function getAgentMode(): AgentMode {
  try { const v = localStorage.getItem(MODE_KEY); return v === 'native' || v === 'bridge' ? v : 'auto'; } catch { return 'auto'; }
}
export function setAgentMode(m: AgentMode) { try { if (m === 'auto') localStorage.removeItem(MODE_KEY); else localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ } }
/** Optional OpenCode Zen API key (paid models / personal quota). Empty = free tier (`public`). */
export function getZenKey(): string { try { return (localStorage.getItem(ZEN_KEY) ?? '').trim(); } catch { return ''; } }
export function setZenKey(k: string) { try { const v = k.trim(); if (v) localStorage.setItem(ZEN_KEY, v); else localStorage.removeItem(ZEN_KEY); } catch { /* private mode */ } }
