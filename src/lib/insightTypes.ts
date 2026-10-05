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
  buzz?: Buzz;
}

export type Mood = 'positive' | 'negative' | 'mixed' | 'unknown';

/** What Reddit (r/stocks, r/wallstreetbets, r/investing) is saying. Context only, never a reason to buy on its own. */
export interface Buzz {
  mentions?: number; // last 24 h (ApeWisdom)
  ratio?: number; // mentions vs the 24 h before
  rank?: number;
  rankBefore?: number;
  trending: boolean; // at least 2x the usual talk and a meaningful number of mentions
  mood: Mood;
  pos: number; // % of posts (weighted by upvotes) that read positive
  neu: number;
  neg: number;
  why?: string; // most-upvoted post title in line with the mood
  posts: { title: string; sub: string; ups: number; comments: number; ageH: number; url: string; tone: '+' | '-' | '0' }[];
}

export const MOOD_LABEL: Record<Mood, string> = { positive: 'mostly positive', negative: 'mostly negative', mixed: 'mixed', unknown: 'mood unknown' };

/** One line for the AI check and the signal details. */
/** Numbers and a mood label only: no Reddit post text, because this goes to the AI. */
export function buzzText(b: Buzz): string {
  const talk = b.mentions !== undefined ? `${b.mentions} mentions in 24 h${b.ratio ? ` (${b.ratio}x the day before)` : ''}` : 'rarely mentioned';
  const mood = b.mood === 'unknown' ? '' : `, mood ${MOOD_LABEL[b.mood]} (${b.pos}% positive, ${b.neg}% negative)`;
  return `Reddit: ${talk}${mood}`;
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
