import type { Buzz, Insight, Market } from './insightTypes';
import { EARNINGS_SOON_DAYS, MAX_SINGLE_STOCK_PCT } from './concentration';
import { buzzWait } from '../components/Buzz';

/**
 * The free "not now" checks, so a BUY tile says WAIT whenever the alert check would.
 * Returns the reason in plain words, or null when nothing blocks a BUY.
 */
export function buyWait(o: { info?: Insight; market?: Market | null; ret1m: number; rsi: number; sharePct?: number }): string | null {
  const e = o.info?.earnings;
  if (e && e.inDays >= 0 && e.inDays <= EARNINGS_SOON_DAYS) return `Earnings in ${e.inDays} day(s): the price can jump or drop a lot. Wait until after.`;
  if (o.market?.trend === 'down') return 'The whole market is falling right now. Most buys fail in a falling market.';
  const crowd = buzzWait(o.info?.buzz as Buzz | undefined, o.ret1m, o.rsi);
  if (crowd) return crowd;
  if (o.sharePct !== undefined && o.sharePct > MAX_SINGLE_STOCK_PCT) return `It is already ${o.sharePct.toFixed(0)}% of your money. Don't add more.`;
  return null;
}
