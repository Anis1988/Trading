/** Shared between the Netlify functions and the app. */
export interface Market {
  trend: 'up' | 'down' | 'mixed';
  price: number;
  ret1m: number;
  ret3m: number;
  closes: number[];
}

export interface Insight {
  earnings?: { date: string; hour?: string; inDays: number };
  analysts?: { buy: number; hold: number; sell: number; period: string };
  basics?: { pe?: number; divYield?: number; high52?: number; low52?: number; beta?: number };
}

export const MARKET_TEXT: Record<Market['trend'], string> = {
  up: 'The overall market (S&P 500) is rising.',
  down: 'The overall market (S&P 500) is falling. Most buys fail in a falling market.',
  mixed: 'The overall market (S&P 500) has no clear direction.',
};

export function earningsText(e: NonNullable<Insight['earnings']>): string {
  const when = e.inDays <= 0 ? 'today' : e.inDays === 1 ? 'tomorrow' : `in ${e.inDays} days`;
  const time = e.hour === 'bmo' ? ' (before the open)' : e.hour === 'amc' ? ' (after the close)' : '';
  return `Earnings ${when}${time}, ${e.date}`;
}

export function analystText(a: NonNullable<Insight['analysts']>): string {
  return `Analysts: ${a.buy} buy · ${a.hold} hold · ${a.sell} sell`;
}

/** Stocks only: funds are diversified on their own, so they are excluded from concentration warnings. */
export const ETFS = new Set(['VTI', 'VOO', 'SPY', 'IVV', 'QQQ', 'SCHD', 'VGT', 'XLK', 'XLF', 'XLV', 'XLE', 'IWM', 'VXUS', 'VT', 'BND', 'VEA', 'VWO', 'DIA', 'SCHB', 'SCHX', 'VUG', 'VTV', 'ITOT', 'SPLG', 'RSP']);
