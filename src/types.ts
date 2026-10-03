export type Side = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface Headline {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  symbol?: string; // symbol the item was fetched for
}

export type SignalSource = 'local' | 'mcp' | 'mock';
export type SignalStatus = 'new' | 'emailed' | 'copied' | 'dismissed';

export interface Signal {
  id: string;
  symbol: string;
  side: Side;
  confidence: number; // 0..1
  reason: string;
  qty: number;
  createdAt: string;
  status: SignalStatus;
  source: SignalSource;
  autoEmail?: boolean; // requested by MCP; still gated by passphrase
  headlineUrl?: string;
}

export type HistoryStatus = 'pending' | 'executed' | 'cancelled' | 'failed';
export type HistoryChannel = 'email' | 'email-simulated' | 'copy';

export interface HistoryItem {
  id: string;
  signalId: string;
  createdAt: string;
  symbol: string;
  side: Side;
  qty: number;
  orderType: OrderType;
  limitPrice?: number;
  reason: string;
  confidence: number;
  channel: HistoryChannel;
  status: HistoryStatus;
  orderId?: string;
  executedPrice?: number;
  executedAt?: string;
  note?: string;
}

export interface LogEntry {
  id: string;
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export interface Settings {
  mockMode: boolean;
  stopped: boolean; // Panic Stop engaged
  pollIntervalSec: number;
  useNewsApi: boolean;
  useRss: boolean;
  rssFeeds: string[]; // may contain {SYMBOL}
  corsProxy: string; // e.g. https://example.com/?url={URL}
  useMcp: boolean;
  autoEmail: boolean;
  toEmail: string;
  defaultQty: number;
  limits: Record<string, number>; // optional per-symbol limit price; present => LIMIT order, else MARKET
  minConfidence: number; // 0..1
  passphraseHash: string;
  passphraseSalt: string;
}

export interface AppConfig {
  mcpEndpoint: string;
  mcpApiKey: string;
  emailServiceId: string;
  emailTemplateId: string;
  emailUserId: string;
  newsApiKey: string;
  forceMock: boolean;
  siteName: string;
  siteId: string;
  context: string;
  branch: string;
}
