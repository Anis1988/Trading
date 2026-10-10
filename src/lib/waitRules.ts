import { healthText, weakHealthText, type Buzz, type Insight, type Market } from './insightTypes';
import { PRESETS, type Rules } from './strictness';

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

/** The two Reddit rules (null = no reason to wait). Balanced = the original thresholds (15% jump or RSI over 70). */
export function buzzWait(b: Buzz | undefined, ret1m: number, rsi: number, r: Rules = PRESETS.balanced): { rule: WaitRule; text: string } | null {
  if (!b?.trending) return null;
  if (b.mood === 'negative' && r.redditBadOn) return { rule: 'reddit-bad', text: b.moodFrom === 'news' ? 'Reddit is suddenly buzzing about it and the news behind it is bad. Wait until the dust settles.' : 'Reddit is buzzing about it for a bad reason. Wait until the dust settles.' };
  const hot = r.stretchedOn ? r.stretchedRsi : 70;
  if (b.mood === 'positive' && r.hypeOn && (ret1m >= r.hypeJump || rsi > hot)) return { rule: 'reddit-hype', text: `Crowd hype after a ${ret1m}% jump this month often reverses. Wait for it to calm down.` };
  return null;
}

/** Heads-ups shown on a BUY that isn't stopped: a falling market the stock is beating, weak finances on Risky. */
export function buyNotes(o: { info?: Insight; market?: Market | null; ret1m: number }, r: Rules = PRESETS.balanced): string[] {
  const out: string[] = [];
  const m = o.market;
  if (m?.trend === 'down') {
    if (!r.marketOn) out.push(`The whole market is falling (${m.ret1m}% this month). Your settings don't wait for that, so a smaller amount is wiser.`);
    else if (o.ret1m > m.ret1m) out.push(`The whole market is falling, but this stock is holding up better (${o.ret1m}% vs the market's ${m.ret1m}% this month). Still a BUY; a smaller amount is wiser.`);
    else if (r.marketMode === 'falling') out.push(`The whole market is falling and this stock is doing no better (${o.ret1m}% vs ${m.ret1m}%), but it isn't falling itself. On Risky that's still a BUY: keep it small.`);
  }
  if (o.info?.health?.label === 'weak' && !r.weakOn) out.push(`Weak company finances (${healthText(o.info.health)}). Your settings make this a warning, not a stop: keep it small.`);
  return out;
}

/** Kept for older callers: the falling-market heads-up only. */
export const marketNote = (market: Market | null | undefined, ret1m: number): string | null => buyNotes({ market, ret1m })[0] ?? null;

/**
 * The free "not now" checks, shared by the stock tiles, Ideas, the AI review and the background check,
 * so a BUY says WAIT everywhere for the same reasons. Null when nothing blocks a BUY.
 * `r` = the rules of the level in use (Balanced = the original rules); some rules are locked on at every level.
 */
export function buyWait(o: { info?: Insight; market?: Market | null; ret1m: number; rsi: number; score?: number }, r: Rules = PRESETS.balanced): { rule: WaitRule; text: string } | null {
  const e = o.info?.earnings;
  // 🔒 Earnings day itself, at every level.
  if (e && e.inDays >= 0 && (e.inDays === 0 || (r.earningsOn && e.inDays <= r.earningsDays))) return { rule: 'earnings', text: e.inDays === 0 ? 'Earnings are today: the price can jump or drop a lot. Wait until after (this rule is always on).' : `Earnings in ${e.inDays} day(s): the price can jump or drop a lot. Wait until after.` };
  const m = o.market;
  if (r.marketOn && m?.trend === 'down') {
    if (r.marketMode === 'all') return { rule: 'market', text: `The whole market is falling (${m.ret1m}% this month). On Careful, no buys until it turns.` };
    if (r.marketMode === 'beat' && o.ret1m <= m.ret1m) return { rule: 'market', text: `The whole market is falling and this stock is doing no better (${o.ret1m}% vs the market's ${m.ret1m}% this month). Most buys fail in a falling market.` };
    if (r.marketMode === 'falling' && o.ret1m < 0) return { rule: 'market', text: `The whole market is falling and this stock is falling too (${o.ret1m}% this month). Wait for it to turn.` };
  }
  const crowd = buzzWait(o.info?.buzz, o.ret1m, o.rsi, r);
  if (crowd) return crowd;
  // Weak finances: a WAIT when the rule is on; 🔒 always when the trend is a downtrend too.
  if (o.info?.health?.label === 'weak' && (r.weakOn || (o.score !== undefined && o.score <= 1))) return { rule: 'weak', text: weakHealthText(o.info.health) };
  return null;
}
