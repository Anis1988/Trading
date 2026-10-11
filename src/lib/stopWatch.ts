import type { Holding } from './holdings';

/**
 * 🛑 Stop-loss watch (Settings → Alerts & email): a warning when a stock you own falls too far, either below what you
 * paid, or (trailing) below the highest close since you bought it, which protects gains. Never an order: the app
 * never sells. Shared by the Today tiles, Settings, the Guide and the background check.
 */
export interface StopWatch {
  on: boolean;
  pct: number; // how far it may fall, in %
  trailing: boolean; // also follow the highest close since you bought (needs the date you bought)
  custom?: Record<string, number>; // a different % for one stock
}
export const STOP_DEFAULT: StopWatch = { on: true, pct: 10, trailing: true };
export const STOP_PCTS = [5, 8, 10, 12, 15, 20, 25];
export const NEAR_PCT = 3; // "close to your stop" within this %

export const stopSettings = (s: { stopWatch?: StopWatch }): StopWatch => ({ ...STOP_DEFAULT, ...(s.stopWatch ?? {}) });

export interface StopLine {
  stop: number;
  pct: number;
  kind: 'paid' | 'high'; // which one sets the stop: what you paid, or the highest close since you bought
  high?: number; // highest close since you bought (trailing)
  away: number; // % the price is above the stop (negative = below)
  hit: boolean;
  near: boolean;
  noDate: boolean; // trailing is on but the date you bought is missing
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The stop for one holding. `dates`/`closes`: daily history (oldest first), for the trailing high. */
export function stopFor(h: Holding, price: number, sw: StopWatch, dates?: string[], closes?: number[]): StopLine | null {
  if (!(price > 0) || !(h.avgCost > 0)) return null;
  const pct = sw.custom?.[h.symbol] ?? sw.pct;
  const paid = h.avgCost * (1 - pct / 100);
  let high: number | undefined;
  if (sw.trailing && h.boughtAt && dates?.length && closes?.length === dates.length) {
    const since = closes.filter((_, i) => dates[i] >= h.boughtAt!);
    high = Math.max(price, ...since);
  }
  const trail = high ? high * (1 - pct / 100) : 0;
  const stop = r2(Math.max(paid, trail));
  const away = Math.round(((price - stop) / price) * 1000) / 10;
  return { stop, pct, kind: trail > paid ? 'high' : 'paid', high: high ? r2(high) : undefined, away, hit: price <= stop, near: price > stop && away <= NEAR_PCT, noDate: sw.trailing && !h.boughtAt };
}

/** "Stop $205 (10% under what you paid, $228)". */
export function stopWhy(l: StopLine, h: Holding): string {
  return l.kind === 'high'
    ? `${l.pct}% under its highest close since you bought, $${l.high}`
    : `${l.pct}% under what you paid, $${h.avgCost}`;
}
