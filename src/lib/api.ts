import type { Headline, Review, Signal } from '../types';
import { SourceError } from './rss';

const TOKEN_KEY = 'ta.accessToken';
export const getAccessToken = (): string => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
export const setAccessToken = (t: string): void => {
  try {
    sessionStorage.setItem(TOKEN_KEY, t);
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

export async function fetchReview(sig: Signal, headlines: Headline[]): Promise<Review> {
  const rel = headlines.filter((h) => h.symbol === sig.symbol || h.title.includes(sig.symbol)).slice(0, 15);
  const r = await call<Review & { quote?: { price: number; changePct: number } | null }>('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signal: { symbol: sig.symbol, side: sig.side, confidence: sig.confidence, reason: sig.reason, qty: sig.qty },
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
  };
}

/** Offline stand-in for demo mode: no API call, no cost. */
export function mockReview(sig: Signal): Review {
  const verdict = sig.confidence >= 0.85 ? 'APPROVE' : sig.confidence >= 0.7 ? 'CAUTION' : 'REJECT';
  return {
    verdict,
    confidence: sig.confidence,
    rationale: `Simulated review (demo mode): verdict derived from the engine confidence only.`,
    risks: ['Simulated - no real analysis was performed'],
    simulated: true,
  };
}
