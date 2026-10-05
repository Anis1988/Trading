import type { Holding } from './holdings';
import type { Signal } from '../types';
import type { Analysis } from './trend';
import { nowIso, uid } from './util';

export const TREND_CHECK_EVERY_MS = 50 * 60_000; // about hourly (a little under, so an hourly background run never skips it)
const COOLDOWN_MS = 24 * 3600_000; // one trend SELL per stock per day at most

/**
 * A SELL signal for every stock you own whose price trend turned weak (score 0-1 of 5),
 * even when the news is quiet. It then goes through the same free rules and AI check as news signals.
 */
export function trendSellSignals(analyses: Analysis[], holdings: Holding[], existing: Signal[]): Signal[] {
  const out: Signal[] = [];
  for (const a of analyses) {
    const h = holdings.find((x) => x.symbol === a.symbol);
    if (!h || h.shares <= 0 || a.action !== 'SELL') continue;
    const recent = existing.some((s) => s.symbol === a.symbol && s.side === 'SELL' && Date.now() - new Date(s.createdAt).getTime() < COOLDOWN_MS);
    if (recent) continue;
    out.push({
      id: uid(),
      symbol: a.symbol,
      side: 'SELL',
      confidence: a.score === 0 ? 0.9 : 0.85,
      reason: `Price trend turned weak: ${a.ret3m}% over 3 months, ${a.ret1m}% this month, ${a.price < a.sma50 ? 'below' : 'near'} its 50-day average.`,
      qty: h.shares,
      createdAt: nowIso(),
      status: 'new',
      source: 'local',
      origin: 'trend',
    });
  }
  return out;
}
