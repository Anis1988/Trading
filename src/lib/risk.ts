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
