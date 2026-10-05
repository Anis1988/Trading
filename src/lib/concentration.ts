import { ETFS } from './insightTypes';

export const EARNINGS_SOON_DAYS = 5;
export const MAX_SINGLE_STOCK_PCT = 25;

/** Single stocks (not funds) that make up more than 25% of the portfolio value. */
export function concentrated(values: { sym: string; value: number }[]): { sym: string; pct: number }[] {
  const total = values.reduce((t, v) => t + v.value, 0);
  if (!total) return [];
  return values
    .filter((v) => !ETFS.has(v.sym))
    .map((v) => ({ sym: v.sym, pct: (v.value / total) * 100 }))
    .filter((v) => v.pct > MAX_SINGLE_STOCK_PCT);
}

/** Share of the portfolio this stock would be after buying `qty` more (cost basis for the others, plus leftover cash; an estimate). */
export function shareAfterBuy(sym: string, qty: number, price: number, holdings: { symbol: string; shares: number; avgCost: number }[], cash = 0): number | null {
  if (ETFS.has(sym)) return null;
  const own = holdings.find((h) => h.symbol === sym);
  const mine = ((own?.shares ?? 0) + qty) * price;
  const others = holdings.filter((h) => h.symbol !== sym).reduce((t, h) => t + h.shares * h.avgCost, 0) + Math.max(0, cash - qty * price);
  return mine + others > 0 ? (mine / (mine + others)) * 100 : null;
}
