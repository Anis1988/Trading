import type { Side } from '../types';

export interface Risk {
  entry: number;
  stop: number;
  perShare: number; // loss per share if the stop is hit
  suggestedQty: number; // shares so that the loss at the stop stays within riskPerTrade
}

/** Stop-loss and position size for a BUY. SELLs have no stop (you are leaving the position). */
export function computeRisk(side: Side, price: number | undefined, riskPerTrade: number, stopLossPct: number): Risk | null {
  if (side !== 'BUY' || !price || price <= 0 || stopLossPct <= 0 || riskPerTrade <= 0) return null;
  const stop = Math.round(price * (1 - stopLossPct / 100) * 100) / 100;
  const perShare = Math.round((price - stop) * 100) / 100;
  if (perShare <= 0) return null;
  return { entry: price, stop, perShare, suggestedQty: Math.max(1, Math.floor(riskPerTrade / perShare)) };
}

/** Always a positive amount; callers put the +/- sign in front. */
export const money = (n: number) => {
  const a = Math.abs(n);
  return `$${a >= 100 ? Math.round(a).toLocaleString() : a.toFixed(2)}`;
};

/** Typical daily move in % (average absolute day-to-day change over the last 14 days). */
export function dailyVolPct(closes: number[], days = 14): number | undefined {
  const c = closes.slice(-(days + 1));
  if (c.length < 6) return undefined;
  let sum = 0;
  for (let i = 1; i < c.length; i++) sum += Math.abs((c[i] - c[i - 1]) / c[i - 1]);
  return Math.round((sum / (c.length - 1)) * 10000) / 100;
}

/**
 * Stop-loss distance that fits the stock: about 2.5 normal daily moves, between 3% and 15%.
 * Calm stocks get a tighter stop, jumpy ones a looser stop so normal noise does not trigger it.
 */
export function stopPctFor(volPct: number | undefined, fixedPct: number, smart: boolean): number {
  if (!smart || !volPct) return fixedPct;
  return Math.round(Math.min(15, Math.max(3, volPct * 2.5)) * 10) / 10;
}
