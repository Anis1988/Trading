import { analyze } from './trend';

/** How many trading days after a call we look (about one month). */
export const BACKTEST_DAYS = 21;
const WINDOW = 126; // the live app judges the trend on ~6 months, so the test does too

export interface CallStats {
  count: number; // separate times the rules switched to this call
  right: number; // BUY: price higher a month later. SELL: price lower.
  avg: number; // average % change of the price over the next month
}

export interface BacktestResult {
  symbol: string;
  days: number; // trading days tested
  buy: CallStats;
  sell: CallStats;
  anyDay: number; // average % change over a month from any day (what simply holding did)
  verdict: 'helped' | 'mixed' | 'no-help' | 'too-few';
}

/**
 * Replays the trend rules (the same `analyze` the app uses for your stocks) on past prices, day by day,
 * as if you owned the stock. A BUY or SELL counts once when the rules switch to it, then we check the price a month later.
 */
export function backtest(symbol: string, closes: number[]): BacktestResult | null {
  if (closes.length < WINDOW + BACKTEST_DAYS + 20) return null;
  const owned = { symbol, shares: 1, avgCost: closes[0] };
  const buy = { count: 0, right: 0, sum: 0 };
  const sell = { count: 0, right: 0, sum: 0 };
  let anySum = 0;
  let anyN = 0;
  let prev: string | undefined;
  for (let t = WINDOW - 1; t + BACKTEST_DAYS < closes.length; t++) {
    const a = analyze(symbol, closes.slice(t - WINDOW + 1, t + 1), owned);
    if (!a) continue;
    const ret = ((closes[t + BACKTEST_DAYS] - closes[t]) / closes[t]) * 100;
    anySum += ret;
    anyN++;
    if (a.action !== prev) {
      if (a.action === 'BUY') (buy.count++, (buy.sum += ret), ret > 0 && buy.right++);
      if (a.action === 'SELL') (sell.count++, (sell.sum += ret), ret < 0 && sell.right++);
    }
    prev = a.action;
  }
  const stats = (s: typeof buy): CallStats => ({ count: s.count, right: s.right, avg: s.count ? Math.round((s.sum / s.count) * 10) / 10 : 0 });
  const anyDay = anyN ? Math.round((anySum / anyN) * 10) / 10 : 0;
  const b = stats(buy);
  const s = stats(sell);
  const calls = b.count + s.count;
  // "Helped" = BUYs beat simply holding, and SELLs were followed by a weaker month than usual.
  const buyGood = b.count >= 2 ? b.avg > anyDay && b.right / b.count >= 0.5 : null;
  const sellGood = s.count >= 2 ? s.avg < anyDay : null;
  const marks = [buyGood, sellGood].filter((x) => x !== null);
  const verdict: BacktestResult['verdict'] =
    calls < 4 || !marks.length ? 'too-few' : marks.every(Boolean) ? 'helped' : marks.some(Boolean) ? 'mixed' : 'no-help';
  return { symbol, days: anyN, buy: b, sell: s, anyDay, verdict };
}
