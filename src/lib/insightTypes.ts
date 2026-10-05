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
  health?: Health;
  insiders?: Insiders;
}

/** Company finances from the last 12 months (Finnhub). */
export interface Health {
  label: 'strong' | 'ok' | 'weak';
  revGrowth?: number; // sales vs a year ago, %
  epsGrowth?: number; // profit per share vs a year ago, %
  margin?: number; // net profit as % of sales
  debtEq?: number; // debt / owners' money
}

/** Company bosses trading their own stock on the open market, last 90 days (Finnhub). */
export interface Insiders {
  bought: number; // $ value of open-market buys
  sold: number; // $ value of open-market sells
  buyers: number; // how many different people bought
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);

export const HEALTH_LABEL: Record<Health['label'], string> = { strong: 'Healthy finances', ok: 'Average finances', weak: 'Weak finances' };

export function healthText(h: Health): string {
  const parts = [
    h.revGrowth !== undefined ? `sales ${pct(h.revGrowth)} vs last year` : '',
    h.epsGrowth !== undefined ? `profit per share ${pct(h.epsGrowth)}` : '',
    h.margin !== undefined ? (h.margin < 0 ? 'losing money' : `keeps ${Math.round(h.margin)}¢ of each $1 of sales as profit`) : '',
    h.debtEq !== undefined ? (h.debtEq < 0.5 ? 'little debt' : h.debtEq <= 1.5 ? 'normal debt' : 'a lot of debt') : '',
  ].filter(Boolean);
  return `${HEALTH_LABEL[h.label]}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

export function insiderText(i: Insiders): string {
  if (i.bought > 0) return `Company insiders bought ${usd(i.bought)} of their own stock in the last 3 months (${i.buyers} ${i.buyers === 1 ? 'person' : 'people'})${i.sold > 0 ? ` and sold ${usd(i.sold)}` : ''}`;
  if (i.sold > 0) return `Company insiders sold ${usd(i.sold)} in the last 3 months and bought none (insider selling is often routine)`;
  return 'No insider buying or selling in the last 3 months';
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
  moodFrom?: 'reddit' | 'news'; // news = no Reddit key yet, so the mood comes from the stock's latest headlines
  why?: string; // most-upvoted post title (or newest headline) in line with the mood
  posts: { title: string; sub: string; ups: number; comments: number; ageH: number; url: string; tone: '+' | '-' | '0' }[];
}

export const MOOD_LABEL: Record<Mood, string> = { positive: 'mostly positive', negative: 'mostly negative', mixed: 'mixed', unknown: 'mood unknown' };

/** One line for the AI check and the signal details. Numbers and a mood label only: no Reddit post text, because this goes to the AI. */
export function buzzText(b: Buzz): string {
  const talk = b.mentions !== undefined ? `${b.mentions} mentions in 24 h${b.ratio ? ` (${b.ratio}x the day before)` : ''}` : 'rarely mentioned';
  const mood = b.mood === 'unknown' ? '' : `, ${b.moodFrom === 'news' ? 'news behind it' : 'mood'} ${MOOD_LABEL[b.mood]} (${b.pos}% positive, ${b.neg}% negative)`;
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
