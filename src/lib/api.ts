import type { Headline, Review, Signal } from '../types';
import { assessHolding, type Holding } from './holdings';
import { mockSeries, type Analysis, type Series } from './trend';
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function fetchReview(sig: Signal, headlines: Headline[], holdings: Holding[]): Promise<Review> {
  const rel = headlines.filter((h) => h.symbol === sig.symbol || h.title.includes(sig.symbol)).slice(0, 15);
  const r = await call<Review & { quote?: { price: number; changePct: number } | null }>('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signal: { symbol: sig.symbol, side: sig.side, confidence: sig.confidence, reason: sig.reason, qty: sig.qty },
      holdings: holdings.map((h) => ({ symbol: h.symbol, shares: h.shares, avgCost: h.avgCost })),
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
  };
}

/** Offline stand-in for demo mode: no API call, no cost. Still checks holdings. */
export function mockReview(sig: Signal, holdings: Holding[]): Review {
  const hold = assessHolding(sig.side, sig.qty, sig.symbol, holdings);
  const verdict = hold.block ? 'REJECT' : sig.confidence >= 0.85 ? 'APPROVE' : sig.confidence >= 0.7 ? 'CAUTION' : 'REJECT';
  return {
    verdict,
    confidence: sig.confidence,
    rationale: hold.block ?? 'Demo mode: this answer is made up from the signal score only.',
    risks: ['Demo mode: no real checking was done.'],
    simulated: true,
    price: mockSeries(sig.symbol).closes.slice(-1)[0],
    holdingNote: hold.note,
    suggestedQty: hold.qty,
  };
}

export async function fetchTrendSeries(symbols: string[]): Promise<{ series: Record<string, Series>; errors: string[] }> {
  return call(`/api/trends?symbols=${encodeURIComponent(symbols.join(','))}`);
}

export interface Pick {
  symbol: string;
  action: 'BUY' | 'SELL' | 'WATCH';
  reason: string;
}
export interface Recommendation {
  summary: string;
  picks: Pick[];
  model?: string;
  simulated?: boolean;
}

export async function fetchRecommendation(rows: Analysis[], holdings: Holding[]): Promise<Recommendation> {
  return call('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: rows.slice(0, 40).map((a) => {
        const h = holdings.find((x) => x.symbol === a.symbol);
        return {
          symbol: a.symbol, price: a.price, ret1m: a.ret1m, ret3m: a.ret3m, rsi: a.rsi, aboveSma50: a.price > a.sma50, trend: a.label,
          owned: h ? { shares: h.shares, avgCost: h.avgCost } : null,
        };
      }),
    }),
  });
}

/** Demo-mode stand-in: picks straight from the rule-based labels. No API call. */
export function mockRecommendation(rows: Analysis[]): Recommendation {
  const picks: Pick[] = [
    ...rows.filter((r) => r.ideaKind === 'buy').slice(0, 3).map((r) => ({ symbol: r.symbol, action: 'BUY' as const, reason: r.idea })),
    ...rows.filter((r) => r.ideaKind === 'sell').slice(0, 2).map((r) => ({ symbol: r.symbol, action: 'SELL' as const, reason: r.idea })),
  ];
  return { summary: 'Demo mode: these picks come from the simple trend rules, not from the AI.', picks, simulated: true };
}
