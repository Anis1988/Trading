import type { Market } from './insightTypes';

export interface VsMarket {
  diff: number; // stock's 3-month % minus the S&P 500's
  label: 'stronger' | 'weaker' | 'same';
  text: string;
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;

/** Is the stock beating the market, or just riding it? Compares the last 3 months with the S&P 500. */
export function vsMarket(symbol: string, ret3m: number, market?: Market | null): VsMarket | null {
  if (!market || symbol === 'SPY') return null;
  const diff = Math.round(ret3m - market.ret3m);
  const both = `${pct(ret3m)} vs the S&P 500's ${pct(market.ret3m)} over 3 months`;
  if (diff >= 3) return { diff, label: 'stronger', text: `Stronger than the market: ${both}` };
  if (diff <= -3) return { diff, label: 'weaker', text: `Weaker than the market: ${both}` };
  return { diff, label: 'same', text: `Moving with the market: ${both}` };
}
