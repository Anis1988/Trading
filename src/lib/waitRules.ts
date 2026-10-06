import { weakHealthText, type Buzz, type Insight, type Market } from './insightTypes';
import { EARNINGS_SOON_DAYS } from './concentration';

export type WaitRule = 'earnings' | 'market' | 'reddit-bad' | 'reddit-hype' | 'weak';

/** Short names for the scoreboard. */
export const RULE_LABEL: Record<WaitRule | 'ai', string> = {
  earnings: 'Earnings coming up',
  market: 'Market falling',
  'reddit-bad': 'Bad buzz on Reddit',
  'reddit-hype': 'Reddit hype after a jump',
  weak: 'Weak company finances',
  ai: 'The AI said wait',
};

/** The two Reddit rules (null = no reason to wait). */
export function buzzWait(b: Buzz | undefined, ret1m: number, rsi: number): { rule: WaitRule; text: string } | null {
  if (!b?.trending) return null;
  if (b.mood === 'negative') return { rule: 'reddit-bad', text: b.moodFrom === 'news' ? 'Reddit is suddenly buzzing about it and the news behind it is bad. Wait until the dust settles.' : 'Reddit is buzzing about it for a bad reason. Wait until the dust settles.' };
  if (b.mood === 'positive' && (ret1m >= 15 || rsi > 70)) return { rule: 'reddit-hype', text: `Crowd hype after a ${ret1m}% jump this month often reverses. Wait for it to calm down.` };
  return null;
}

/** Falling market but this stock is holding up better: still a BUY, with a heads-up (null otherwise). */
export function marketNote(market: Market | null | undefined, ret1m: number): string | null {
  if (market?.trend !== 'down' || ret1m <= market.ret1m) return null;
  return `The whole market is falling, but this stock is holding up better (${ret1m}% vs the market's ${market.ret1m}% this month). Still a BUY; a smaller amount is wiser.`;
}

/**
 * The free "not now" checks, shared by the stock tiles, Ideas and the background check,
 * so a BUY says WAIT everywhere for the same reasons. Null when nothing blocks a BUY.
 */
export function buyWait(o: { info?: Insight; market?: Market | null; ret1m: number; rsi: number }): { rule: WaitRule; text: string } | null {
  const e = o.info?.earnings;
  if (e && e.inDays >= 0 && e.inDays <= EARNINGS_SOON_DAYS) return { rule: 'earnings', text: `Earnings in ${e.inDays} day(s): the price can jump or drop a lot. Wait until after.` };
  // Falling market: wait only if this stock is doing no better than the market (strong ones get a note instead).
  if (o.market?.trend === 'down' && o.ret1m <= o.market.ret1m) return { rule: 'market', text: `The whole market is falling and this stock is doing no better (${o.ret1m}% vs the market's ${o.market.ret1m}% this month). Most buys fail in a falling market.` };
  const crowd = buzzWait(o.info?.buzz, o.ret1m, o.rsi);
  if (crowd) return crowd;
  if (o.info?.health?.label === 'weak') return { rule: 'weak', text: weakHealthText(o.info.health) };
  return null;
}
