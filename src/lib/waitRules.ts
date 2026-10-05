import { weakHealthText, type Buzz, type Insight, type Market } from './insightTypes';
import { EARNINGS_SOON_DAYS } from './concentration';
import { buzzWait } from '../components/Buzz';

/**
 * The free "not now" checks, so a BUY tile says WAIT whenever the alert check would.
 * Returns the reason in plain words, or null when nothing blocks a BUY.
 */
export function buyWait(o: { info?: Insight; market?: Market | null; ret1m: number; rsi: number }): string | null {
  const e = o.info?.earnings;
  if (e && e.inDays >= 0 && e.inDays <= EARNINGS_SOON_DAYS) return `Earnings in ${e.inDays} day(s): the price can jump or drop a lot. Wait until after.`;
  if (o.market?.trend === 'down') return 'The whole market is falling right now. Most buys fail in a falling market.';
  const crowd = buzzWait(o.info?.buzz as Buzz | undefined, o.ret1m, o.rsi);
  if (crowd) return crowd;
  if (o.info?.health?.label === 'weak') return weakHealthText(o.info.health);
  return null;
}
