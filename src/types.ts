import type { StopWatch } from './lib/stopWatch';
import type { Level, Rules } from './lib/strictness';
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
  level?: string; // 🎚️ the level the review used (careful / balanced / risky / custom)
  volPct?: number; // typical daily move in %
  market?: 'up' | 'down' | 'mixed';
  earnings?: string;
  analysts?: string;
  reddit?: string;
  rule?: string; // set when a free rule decided, not the AI
  health?: string;
  insiders?: string;
}

export type SignalSource = 'local' | 'mcp';
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
  origin?: 'news' | 'trend'; // what created it: headlines, or a held stock's price trend turning weak
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

/** One scored call, kept (and synced) so the Scoreboard sees every device's and the server's signals. */
export interface ScoreEntry {
  id: string;
  symbol: string;
  side: Side;
  createdAt: string;
  entryPrice: number;
  verdict?: Verdict;
  why?: string; // for WAIT/SKIP: which free rule (WaitRule) or 'ai'
  origin: 'app' | 'server';
  level?: string; // 🎚️ the level in use when it was logged (careful / balanced / risky / custom)
}

export interface LogEntry {
  id: string;
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

/** "Tell me if NVDA drops to $160": checked by the hourly background check. */
export interface PriceAlert {
  id: string;
  symbol: string;
  op: 'below' | 'above';
  price: number;
  createdAt: string;
}

export interface Settings {
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
  stopLossPct: number; // fixed stop-loss distance in % (used when smartStop is off)
  smartStop: boolean; // stop-loss sized to each stock's normal daily moves
  autoEmailMinConfidence: number;
  aiDailyLimit: number; // paid AI checks per day, all devices + background together
  aiMinConfidence: number; // only signals scoring at least this get an automatic AI check
  serverAlerts: boolean; // background check on Netlify once an hour on weekdays, even with the app closed
  weeklySummary: boolean; // Friday evening summary email // auto-email only at or above this signal confidence
  priceAlerts?: PriceAlert[];
  cash?: number; // cash in the account, ready to invest (optional)
  horizon?: 'short' | 'medium' | 'long'; // how long the user plans to keep the money invested
  strictness?: Level; // 🎚️ how careful the app is before saying BUY (missing = Balanced, the original rules); synced
  customRules?: Partial<Rules>; // 🎛️ Custom level: each rule on/off with its number; synced
  stopWatch?: StopWatch; // 🛑 warn when a stock you own falls too far (missing = on, 10%, trailing); synced
  morningBrief?: boolean; // ☀️ weekday brief before the open (missing = on); synced
  importedAt?: string; // 📥 last import of the Fidelity positions file (for the "re-import after a trade" reminder)
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
  siteName: string;
  siteId: string;
  context: string;
  branch: string;
}
