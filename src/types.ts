import type { Holding } from './lib/holdings';

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

export type Verdict = 'APPROVE' | 'CAUTION' | 'REJECT';

export interface Review {
  verdict: Verdict;
  confidence: number;
  rationale: string;
  risks: string[];
  price?: number;
  changePct?: number;
  model?: string;
  simulated?: boolean;
  holdingNote?: string; // plain-words comparison with what the user owns
  suggestedQty?: number; // quantity after checking holdings
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
  review?: Review;
  reviewStatus?: 'pending' | 'error';
  reviewError?: string;
  entryPrice?: number; // price when the signal was reviewed (used by the scoreboard)
  stopPrice?: number; // suggested stop-loss for a BUY
  suggestedQty?: number; // quantity that keeps the loss at your risk limit if the stop is hit
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
  updatedAt?: string; // last edit; used to merge edits made on different devices
  deleted?: boolean; // soft delete so the deletion also syncs to other devices
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
  useServerFeeds: boolean; // fetch news via the Netlify function (/api/news) - avoids CORS blocks
  useAiReview: boolean; // AI second opinion; REJECT blocks emails
  holdings: Holding[]; // what the user actually owns (entered manually)
  useRss: boolean;
  rssFeeds: string[]; // may contain {SYMBOL}
  corsProxy: string; // e.g. https://example.com/?url={URL}
  useMcp: boolean;
  autoEmail: boolean;
  toEmail: string;
  defaultQty: number;
  limits: Record<string, number>; // optional per-symbol limit price; present => LIMIT order, else MARKET
  minConfidence: number; // 0..1
  riskPerTrade: number; // dollars you are willing to lose on one trade
  stopLossPct: number; // how far below the entry the stop-loss sits, in %
  autoEmailMinConfidence: number; // auto-email only at or above this signal confidence
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
