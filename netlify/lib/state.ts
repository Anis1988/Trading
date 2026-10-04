import { getStore } from '@netlify/blobs';
import type { HistoryItem, ScoreEntry, Settings } from '../../src/types';

/** The synced document written by /api/sync (see src/lib/sync.ts). */
export interface StoredState {
  updatedAt: string;
  data: {
    settings: Partial<Settings>;
    watchlist: string[];
    history: HistoryItem[];
    scoreLog?: ScoreEntry[];
  };
}

export const syncStore = () => getStore('trading-sync');
const serverStore = () => getStore('trading-server');

export async function readState(): Promise<StoredState | null> {
  return (await syncStore().get('state', { type: 'json' })) as StoredState | null;
}

export async function writeState(next: StoredState['data']): Promise<string> {
  const updatedAt = new Date().toISOString();
  await syncStore().setJSON('state', { updatedAt, data: next });
  return updatedAt;
}

export async function readServer<T>(key: string, fallback: T): Promise<T> {
  return ((await serverStore().get(key, { type: 'json' })) as T | null) ?? fallback;
}

export async function writeServer(key: string, value: unknown): Promise<void> {
  await serverStore().setJSON(key, value);
}

export interface ServerLogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export async function appendServerLog(entries: ServerLogEntry[]): Promise<void> {
  if (!entries.length) return;
  const log = await readServer<ServerLogEntry[]>('log', []);
  await writeServer('log', [...entries.reverse(), ...log].slice(0, 100));
}
