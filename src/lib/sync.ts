import type { HistoryItem, Settings } from '../types';
import { getAccessToken } from './api';

// Settings that stay per-device on purpose: safety switches must never be flipped by another device.
const LOCAL_ONLY = ['stopped', 'autoEmail', 'mockMode', 'useMcp'] as const;

export interface SyncData {
  settings: Partial<Settings>;
  watchlist: string[];
  history: HistoryItem[];
}

export function pickSynced(s: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(s).sort()) if (!(LOCAL_ONLY as readonly string[]).includes(k)) out[k] = (s as unknown as Record<string, unknown>)[k];
  return out as Partial<Settings>;
}

export function snapshot(s: Settings, watchlist: string[], history: HistoryItem[]): SyncData {
  return { settings: pickSynced(s), watchlist, history };
}

const rank = (h: HistoryItem) => (h.status === 'executed' ? 3 : h.status === 'cancelled' ? 2 : h.status === 'failed' ? 1 : 0);

/** Union by id; when both sides have an item, keep the more "final" one (executed > cancelled > failed > pending). */
export function mergeHistory(a: HistoryItem[], b: HistoryItem[]): HistoryItem[] {
  const map = new Map<string, HistoryItem>();
  for (const h of [...a, ...b]) {
    const cur = map.get(h.id);
    if (!cur || rank(h) > rank(cur)) map.set(h.id, h);
  }
  return [...map.values()].sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

export interface RemoteState {
  updatedAt: string | null;
  data: SyncData | null;
}

async function req(method: 'GET' | 'PUT', body?: unknown): Promise<{ status: number; json: any }> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch('/api/sync', {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Access-Token': token },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the sync service (offline, or no Netlify functions here).');
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (json === null) throw new Error(`Sync service not found (HTTP ${res.status}). It only exists on Netlify or with \`npm run dev:full\`; if this is your Netlify site, redeploy the latest code.`);
  return { status: res.status, json };
}

export async function pullRemote(): Promise<RemoteState> {
  const r = await req('GET');
  if (r.status !== 200) throw new Error(r.json?.error ?? `Sync failed (${r.status})`);
  return r.json as RemoteState;
}

/** Returns the new version, or `{conflict}` carrying the server's current state. */
export async function pushRemote(baseUpdatedAt: string | null, data: SyncData): Promise<{ updatedAt: string } | { conflict: RemoteState }> {
  const r = await req('PUT', { baseUpdatedAt, data });
  if (r.status === 409) return { conflict: r.json as RemoteState };
  if (r.status !== 200) throw new Error(r.json?.error ?? `Sync failed (${r.status})`);
  return { updatedAt: r.json.updatedAt as string };
}
