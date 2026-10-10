import type { Holding } from './holdings';
import { PRESETS, trendBuy, type Rules } from './strictness';

export interface Series {
  dates: string[];
  closes: number[];
}

export type TrendLabel = 'Strong uptrend' | 'Uptrend' | 'Mixed' | 'Downtrend';

export interface Analysis {
  symbol: string;
  price: number;
  prevClose: number; // previous trading day's close
  ret1m: number; // % over ~21 trading days
  ret3m: number; // % over ~63 trading days
  sma20: number;
  sma50: number;
  rsi: number;
  fromHigh: number; // % below the 6-month high (<= 0)
  score: number; // 0..5
  label: TrendLabel;
  idea: string; // plain-words takeaway
  ideaKind: 'buy' | 'wait' | 'hold' | 'sell' | 'avoid';
  action?: 'SELL' | 'HOLD' | 'BUY'; // only for stocks you own (BUY = add more)
  half?: boolean; // 🚀 Risky: rising fast, so buy half now
  closes: number[];
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
export const sma = (c: number[], n: number) => avg(c.slice(-n));

/** Wilder's RSI over the last `n` periods. */
export function rsi(c: number[], n = 14): number {
  if (c.length <= n) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

/** The trend reading. `rules` = the level in use (🎚️ Settings → How careful); Balanced = the original rules. */
export function analyze(symbol: string, closes: number[], owned?: Holding, rules: Rules = PRESETS.balanced): Analysis | null {
  if (closes.length < 55) return null;
  const price = closes[closes.length - 1];
  const at = (back: number) => closes[Math.max(0, closes.length - 1 - back)];
  const ret1m = ((price - at(21)) / at(21)) * 100;
  const ret3m = ((price - at(63)) / at(63)) * 100;
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const r = rsi(closes);
  const high = Math.max(...closes);

  // Simple, explainable score: each condition that holds is one point.
  const score = [price > s50, s20 > s50, ret1m > 0, ret3m > 0, r >= 40 && r <= 70].filter(Boolean).length;
  const label: TrendLabel = score >= 5 ? 'Strong uptrend' : score >= 4 ? 'Uptrend' : score >= 2 ? 'Mixed' : 'Downtrend';

  let idea: string;
  let ideaKind: Analysis['ideaKind'];
  let action: Analysis['action'];
  let half = false;
  // Adding to a stock you own: Balanced = 5/5 and RSI 65 or less (the original rule); Careful 60; Risky 4/5 and 70.
  const addScore = rules.buyScore === 3 ? 4 : 5;
  const addRsi = rules.stretchedOn ? Math.min(70, rules.stretchedRsi - 5) : 70;
  const tb = trendBuy({ score, price, sma50: s50, rsi: r }, rules);
  if (owned) {
    // For a stock you own the question is: sell, hold, or buy more.
    if (score <= 1) {
      action = 'SELL'; ideaKind = 'sell'; idea = 'Trend is weak. Think about selling some or all.';
    } else if (score >= addScore && r <= addRsi) {
      action = 'BUY'; ideaKind = 'buy'; idea = score >= 5 ? 'Strong, steady climb. Adding more is reasonable.' : 'Good climb. On Risky, adding a little more is OK.';
    } else if (score >= 4 && r > (rules.stretchedOn ? rules.stretchedRsi : 70)) {
      action = 'HOLD'; ideaKind = 'hold'; idea = 'Rising fast and looks stretched. Keep holding, but do not add now.';
    } else {
      action = 'HOLD'; ideaKind = 'hold'; idea = 'No clear reason to act. Keep holding.';
    }
  } else if (tb.ok && !tb.stretched) {
    ideaKind = 'buy';
    half = tb.half;
    idea = tb.half ? 'Rising fast. On Risky: buy half now and keep the rest for a dip.'
      : score >= 4 ? 'Steady climb and not overheated. Worth a closer look to buy.'
      : 'Leaning up and above its 50-day average. On Risky, a small buy is OK.';
  } else if (tb.stretched) {
    ideaKind = 'wait';
    idea = 'Rising fast and looks stretched. Better to wait for a small dip.';
  } else if (score >= 4) {
    ideaKind = 'wait';
    idea = 'Good trend, but not strong enough for Careful (it waits for 5 of 5).';
  } else if (score <= 1) {
    ideaKind = 'avoid';
    idea = 'Trend is weak. Better to stay away for now.';
  } else {
    ideaKind = 'wait';
    idea = 'No clear direction. Nothing to act on yet.';
  }
  if (r < 30) idea += ' It has dropped a lot lately, so it may bounce, but that is risky.';

  return {
    symbol, price: round(price, 2), prevClose: round(closes[closes.length - 2], 2), ret1m: round(ret1m), ret3m: round(ret3m), sma20: round(s20, 2), sma50: round(s50, 2),
    rsi: round(r, 0), fromHigh: round(((price - high) / high) * 100), score, label, idea, ideaKind, action, closes, ...(half ? { half } : {}),
  };
}

export const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'JPM', 'V', 'UNH', 'XOM', 'LLY', 'COST', 'WMT', 'NFLX', 'AMD', 'ORCL', 'KO', 'PEP', 'HD', 'PG', 'MA', 'BAC'];

