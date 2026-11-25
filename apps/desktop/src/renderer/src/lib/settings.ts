import { useSyncExternalStore } from 'react';

export interface Settings {
  /** Base URL of the API, e.g. http://localhost:3001 */
  serverUrl: string;
  /** Last name used, to prefill the lobby. */
  displayName: string;
  theme: 'dark' | 'light';
  editorFontSize: number;
  /** Last chosen devices, used as defaults on the pre-join screen. */
  cameraId?: string;
  micId?: string;
}

const KEY = 'tgi.settings';
export const DEFAULT_SERVER = 'http://localhost:3001';
const DEFAULTS: Settings = { serverUrl: DEFAULT_SERVER, displayName: '', theme: 'dark', editorFontSize: 14 };

// Storage can be unavailable or hold junk; the app must still start with defaults.
function load(): Settings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const merged = { ...DEFAULTS, ...parsed };
    if (!normalizeServerUrl(merged.serverUrl)) merged.serverUrl = DEFAULT_SERVER;
    if (merged.theme !== 'light' && merged.theme !== 'dark') merged.theme = 'dark';
    if (!(merged.editorFontSize >= 10 && merged.editorFontSize <= 28)) merged.editorFontSize = 14;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

let current: Settings = load();
const listeners = new Set<() => void>();

export function applyTheme(): void {
  document.documentElement.dataset.theme = current.theme;
}

function emit(): void {
  applyTheme();
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* keep working in memory */
  }
  emit();
}

// Another window changed the settings.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    current = load();
    emit();
  }
});

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSettings,
  );
}

/** Accepts "host:3001" or a full URL; returns "http(s)://host[:port]" or null if it is not usable. */
export function normalizeServerUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** The collaboration WebSocket lives on the same server as the API. */
export function collabUrl(): string {
  return `${current.serverUrl.replace(/^http/, 'ws')}/collab`;
}

/** Stable per window (survives reload, not a new window), so two windows are never the same person. */
export function getClientId(): string {
  try {
    let id = sessionStorage.getItem('tgi.clientId');
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      sessionStorage.setItem('tgi.clientId', id);
    }
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
}
