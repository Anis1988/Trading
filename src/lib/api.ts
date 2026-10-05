import type { Headline, Review, Signal } from '../types';
import type { Holding } from './holdings';
import type { Series } from './trend';
import type { Idea } from './picks';
import { SourceError } from './rss';

const TOKEN_KEY = 'ta.accessToken';
export const getAccessToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setAccessToken = (t: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* ignore */
  }
};

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { 'X-Access-Token': token } : {}) } });
  } catch {
    throw new SourceError('Could not reach the server functions. Run `npm run dev:full` locally or deploy to Netlify.');
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok || json === null) {
    if (res.status === 404 || json === null) {
      throw new SourceError(`${path} not found. Server functions only run on Netlify or via \`npm run dev:full\` (plain \`npm run dev\` has none).`);
    }
    throw new SourceError(json?.error ?? `${path}: HTTP ${res.status}`);
  }
  return json as T;
}

export async function fetchServerHeadlines(symbols: string[]): Promise<{ headlines: Headline[]; errors: string[] }> {
  return call(`/api/news?symbols=${encodeURIComponent(symbols.join(','))}`);
}

export interface ReviewRisk { riskPerTrade: number; stopLossPct: number; smartStop: boolean; cash?: number; horizon?: 'short' | 'medium' | 'long' }

export async function fetchReview(sig: Signal, headlines: Headline[], holdings: Holding[], risk?: ReviewRisk): Promise<Review> {
  const rel = headlines.filter((h) => h.symbol === sig.symbol || h.title.includes(sig.symbol)).slice(0, 15);
  const r = await call<Review & { quote?: { price: number; changePct: number; volPct?: number } | null }>('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signal: { symbol: sig.symbol, side: sig.side, confidence: sig.confidence, reason: sig.reason, qty: sig.qty },
      holdings: holdings.map((h) => ({ symbol: h.symbol, shares: h.shares, avgCost: h.avgCost, boughtAt: h.boughtAt || undefined })),
      risk,
      headlines: rel.map((h) => ({ title: h.title.slice(0, 300), source: h.source.slice(0, 80), publishedAt: h.publishedAt })),
    }),
  });
  if (!['APPROVE', 'CAUTION', 'REJECT'].includes(r.verdict)) throw new SourceError('AI review returned an invalid verdict.');
  return {
    verdict: r.verdict,
    confidence: r.confidence,
    rationale: r.rationale,
    risks: r.risks ?? [],
    price: r.quote?.price,
    changePct: r.quote?.changePct,
    model: r.model,
    holdingNote: r.holdingNote,
    suggestedQty: r.suggestedQty,
    volPct: r.quote?.volPct,
    market: r.market,
    earnings: r.earnings,
    analysts: r.analysts,
    reddit: r.reddit,
    rule: r.rule,
    health: r.health,
    insiders: r.insiders,
  };
}

export async function fetchTrendSeries(symbols: string[]): Promise<{ series: Record<string, Series>; errors: string[] }> {
  return call(`/api/trends?symbols=${encodeURIComponent(symbols.join(','))}`);
}

export interface Pick {
  symbol: string;
  action: 'BUY' | 'SELL' | 'WAIT';
  reason: string;
}
export interface Recommendation {
  summary: string;
  picks: Pick[];
  model?: string;
}

export interface ScanResult {
  ideas: Idea[];
  scanned: number;
  inRange?: number;
  errors: string[];
}

export async function fetchScan(min = 0, max = 0): Promise<ScanResult> {
  return call(`/api/scan?min=${min}&max=${max}`);
}

/** Ask the AI to rank the scan results (clear BUY / WAIT picks, aware of what you own). */
export async function fetchIdeaPicks(ideas: Idea[], holdings: Holding[]): Promise<Recommendation> {
  return call('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: ideas.slice(0, 15).map((i) => {
        const h = holdings.find((x) => x.symbol === i.symbol);
        return {
          symbol: i.symbol, price: i.price, ret1m: i.ret1m, ret3m: i.ret3m, rsi: i.rsi, aboveSma50: i.price > i.sma50, trend: i.label,
          owned: h ? { shares: h.shares, avgCost: h.avgCost } : null, strength: i.score, headline: i.headline?.slice(0, 200),
        };
      }),
    }),
  });
}

export interface InsightsResult {
  market: import('./insightTypes').Market | null;
  stocks: Record<string, import('./insightTypes').Insight>;
  finnhub: boolean;
}

export const fetchInsights = (symbols: string[]) => call<InsightsResult>(`/api/insights?symbols=${encodeURIComponent(symbols.join(','))}`);
