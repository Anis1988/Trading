import type { HistoryItem, Settings } from '../types';

export const KEYS = {
  settings: 'ta.settings',
  watchlist: 'ta.watchlist',
  signals: 'ta.signals',
  history: 'ta.history',
  logs: 'ta.logs',
  mcpLast: 'ta.mcpLast',
  scoreLog: 'ta.scoreLog',
  seen: 'ta.seen',
  unlockUntil: 'ta.unlockUntil',
} as const;

export const defaultSettings: Settings = {
  mockMode: true, // demo mode is the default
  stopped: false,
  pollIntervalSec: 300,
  useNewsApi: false,
  useServerFeeds: true,
  useAiReview: true,
  holdings: [],
  useRss: true,
  rssFeeds: ['https://feeds.finance.yahoo.com/rss/2.0/headline?s={SYMBOL}&region=US&lang=en-US'],
  corsProxy: '',
  useMcp: false,
  autoEmail: false,
  toEmail: '',
  defaultQty: 1,
  limits: {},
  minConfidence: 0.6,
  riskPerTrade: 100,
  stopLossPct: 5,
  autoEmailMinConfidence: 0.85,
  aiDailyLimit: 20,
  aiMinConfidence: 0.75,
  serverAlerts: false,
  weeklySummary: false,
  passphraseHash: '',
  passphraseSalt: '',
};

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

export function loadSettings(): Settings {
  return { ...defaultSettings, ...load<Partial<Settings>>(KEYS.settings, {}) };
}

export interface Backup {
  version: 1;
  exportedAt: string;
  settings: Omit<Settings, 'passphraseHash' | 'passphraseSalt' | 'stopped' | 'autoEmail'>;
  watchlist: string[];
  history: HistoryItem[];
}

export function buildBackup(settings: Settings, watchlist: string[], history: HistoryItem[]): Backup {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const { passphraseHash, passphraseSalt, stopped, autoEmail, ...safe } = settings;
  return { version: 1, exportedAt: new Date().toISOString(), settings: safe, watchlist, history };
}

export function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
