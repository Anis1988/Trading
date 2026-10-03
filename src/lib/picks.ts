import type { Analysis } from './trend';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * 0-100 "how good does this look to buy right now". Transparent on purpose:
 * trend score (up to 60) + 3-month momentum (up to 15) + near its high (5)
 * - overheated (15) + news (+/-10). It ranks stocks; it does not predict returns.
 */
export function scoreIdea(a: Analysis, newsNet = 0): number {
  let s = a.score * 12;
  s += (clamp(a.ret3m, 0, 30) / 30) * 15;
  if (a.rsi > 70) s -= 15;
  else if (a.rsi < 30) s -= 5;
  if (a.fromHigh > -5) s += 5;
  s += clamp(newsNet, -5, 5) * 2;
  return Math.round(clamp(s, 0, 100));
}

export type Strength = 'Strong' | 'Good' | 'Fair' | 'Weak';
export const strength = (s: number): Strength => (s >= 75 ? 'Strong' : s >= 60 ? 'Good' : s >= 45 ? 'Fair' : 'Weak');

/** Worth showing as a BUY idea: healthy trend and not overheated. */
export const isBuyIdea = (a: Analysis, score: number) => a.score >= 4 && a.rsi <= 70 && score >= 60;

export function reasonsFor(a: Analysis, newsNet: number, headline?: string): string[] {
  const out: string[] = [];
  out.push(`Price is up ${a.ret3m}% over 3 months${a.ret1m >= 0 ? ` and ${a.ret1m}% this month` : `, but ${a.ret1m}% this month`}.`);
  if (a.price > a.sma50) out.push('It is trading above its 50-day average, a sign of a healthy trend.');
  if (a.rsi <= 70) out.push(`Not overheated (RSI ${a.rsi}).`);
  if (a.fromHigh > -5) out.push('Close to its 6-month high.');
  if (newsNet >= 1 && headline) out.push(`Recent news leans positive: "${headline}"`);
  else if (newsNet <= -1 && headline) out.push(`Watch out, recent news leans negative: "${headline}"`);
  return out;
}

export interface Idea {
  symbol: string;
  price: number;
  prevClose: number;
  ret1m: number;
  ret3m: number;
  rsi: number;
  trendScore: number;
  label: Analysis['label'];
  fromHigh: number;
  sma50: number;
  closes: number[]; // last ~60 closes for the chart
  newsNet: number;
  headline?: string;
  headlineUrl?: string;
  score: number; // 0-100 composite
}

export function toIdea(a: Analysis, newsNet = 0, headline?: string, headlineUrl?: string): Idea {
  return {
    symbol: a.symbol, price: a.price, prevClose: a.prevClose, ret1m: a.ret1m, ret3m: a.ret3m, rsi: a.rsi, trendScore: a.score,
    label: a.label, fromHigh: a.fromHigh, sma50: a.sma50, closes: a.closes.slice(-60), newsNet, headline, headlineUrl, score: scoreIdea(a, newsNet),
  };
}

/** Rebuild an Analysis-shaped object from an Idea (for the shared helpers). */
export const ideaToAnalysis = (i: Idea): Analysis => ({
  symbol: i.symbol, price: i.price, prevClose: i.prevClose, ret1m: i.ret1m, ret3m: i.ret3m, sma20: i.price, sma50: i.sma50, rsi: i.rsi,
  fromHigh: i.fromHigh, score: i.trendScore, label: i.label, idea: '', ideaKind: 'buy', closes: i.closes,
});
