import { analyze, marketOf } from './trend';
import { buyWait } from './waitRules';
import { resolveRules, type Level, type Preset, type Rules } from './strictness';
import { stopFor, type StopWatch } from './stopWatch';

/**
 * 🔮 What if: "if I had followed every BUY and SELL the app gave on this stock for the last N months".
 * Replays the app's own rule code day by day on past daily closes: `analyze()` (the trend), `buyWait()` (the free
 * "not now" checks), `resolveRules()` (your level, Auto follows the market of that day), `sizePct` (share sizing) and the
 * 🛑 stop-loss watch (`stopFor`). No look-ahead: on each day the rules only see prices up to and including that day.
 * Trades happen at that day's closing price (the price the app shows). Fractional shares, no fees, no taxes.
 * What can't be replayed for free (past earnings dates, past company finances, past Reddit talk, the AI) is skipped.
 * A simulation only: it never places an order.
 */

export const SIM_WINDOW = 126; // the live app judges the trend on ~6 months of prices
export type SimMonths = 3 | 6 | 12;

export interface PriceSeries { dates: string[]; closes: number[] }

export interface SimTrade {
  date: string;
  side: 'BUY' | 'SELL';
  price: number;
  shares: number;
  dollars: number; // money spent (BUY) or received (SELL)
  why: string;
  result?: { dollars: number; pct: number }; // SELL: gain or loss vs the average price paid
}

export interface SimPoint { date: string; you: number; hold: number; spy?: number }

export interface SimResult {
  symbol: string;
  months: SimMonths;
  level: Level;
  from: string;
  to: string;
  days: number;
  amount: number;
  final: number; // following the rules (open shares counted at the last close)
  ret: number; // %
  hold: { final: number; ret: number }; // just buying the stock on day one and keeping it
  spy: { final: number; ret: number } | null; // the S&P 500 (SPY) over the same days
  trades: SimTrade[];
  closed: number; // finished round trips (bought, then sold)
  wins: number; // round trips that made money
  winRate: number | null; // % (null = nothing sold yet)
  maxDrop: number; // biggest fall from a high, % (<= 0)
  invested: number; // % of days with money in the stock
  open?: { shares: number; avgCost: number; value: number; pct: number }; // still holding at the end
  curve: SimPoint[];
  presets: Partial<Record<Preset | 'custom', number>>; // days per level (Auto changes with the market)
  shortHistory: boolean; // fewer than ~6 months of prices before the start: early days used a shorter trend window
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The first day of the test: N calendar months before the last price. */
export function startIndex(dates: string[], months: SimMonths): number {
  if (!dates.length) return 0;
  const d = new Date(`${dates[dates.length - 1]}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  const from = d.toISOString().slice(0, 10);
  const i = dates.findIndex((x) => x >= from);
  return Math.max(i < 0 ? dates.length - 1 : i, 54); // analyze() needs 55 closes
}

/** Biggest fall from a previous high, in % (0 or negative). */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, (v - peak) / peak);
  }
  return r1(worst * 100);
}

export function simulate(o: {
  symbol: string;
  series: PriceSeries;
  spy?: PriceSeries | null;
  months: SimMonths;
  amount: number;
  level: Level;
  customRules?: Partial<Rules>;
  stop: StopWatch;
}): SimResult | null {
  const { symbol, series, months, amount, level, stop } = o;
  const { dates, closes } = series;
  if (closes.length < 60 || closes.length !== dates.length || !(amount > 0)) return null;
  const start = startIndex(dates, months);
  if (start >= closes.length - 1) return null;

  // SPY aligned by date: the last SPY close on or before each day (never a later one).
  const spy = o.spy && o.spy.closes.length === o.spy.dates.length ? o.spy : null;
  let j = -1;
  const spyIdx = (date: string) => {
    if (!spy) return -1;
    while (j + 1 < spy.dates.length && spy.dates[j + 1] <= date) j++;
    return j;
  };

  let cash = amount;
  let shares = 0;
  let avgCost = 0;
  let boughtAt = '';
  let spyStart: number | undefined;
  const trades: SimTrade[] = [];
  const curve: SimPoint[] = [];
  const presets: SimResult['presets'] = {};
  let closed = 0, wins = 0, inDays = 0;
  const holdShares = amount / closes[start];

  for (let t = start; t < closes.length; t++) {
    const price = closes[t];
    const date = dates[t];
    const window = closes.slice(Math.max(0, t - SIM_WINDOW + 1), t + 1); // only the past and today
    const si = spyIdx(date);
    const market = spy && si >= 54 ? marketOf(spy.closes.slice(Math.max(0, si - SIM_WINDOW + 1), si + 1)) : null;
    if (spy && si >= 0 && spyStart === undefined) spyStart = spy.closes[si];
    const lv = resolveRules({ strictness: level, customRules: o.customRules }, market);
    const rules = lv.rules;
    presets[lv.preset] = (presets[lv.preset] ?? 0) + 1;
    const part = (half: boolean) => Math.min(1, rules.sizePct / 100) * (half ? 0.5 : 1);
    let sold = false;

    if (shares > 0) {
      const owned = { symbol, shares, avgCost, boughtAt };
      const a = analyze(symbol, window, owned, rules);
      const line = stop.on ? stopFor(owned, price, stop, dates.slice(0, t + 1), closes.slice(0, t + 1)) : null;
      let why = '';
      if (line?.hit) why = `Stop-loss reached ($${line.stop}, ${line.kind === 'high' ? `${line.pct}% under the highest close since buying` : `${line.pct}% under the price paid`})`;
      else if (a?.action === 'SELL') why = `Trend turned weak (score ${a.score}/5)`;
      if (why) {
        const dollars = shares * price;
        const gain = (price - avgCost) * shares;
        trades.push({ date, side: 'SELL', price: r2(price), shares: Math.round(shares * 10000) / 10000, dollars: r2(dollars), why, result: { dollars: r2(gain), pct: r1(((price - avgCost) / avgCost) * 100) } });
        closed++;
        if (gain > 0) wins++;
        cash += dollars;
        shares = 0;
        avgCost = 0;
        sold = true;
      } else if (a?.action === 'BUY' && cash >= 1 && !buyWait({ market, ret1m: a.ret1m, rsi: a.rsi, score: a.score }, rules)) {
        const spend = cash * part(false);
        if (spend >= 1) {
          const n = spend / price;
          avgCost = (avgCost * shares + spend) / (shares + n);
          shares += n;
          cash -= spend;
          trades.push({ date, side: 'BUY', price: r2(price), shares: Math.round(n * 10000) / 10000, dollars: r2(spend), why: `Add more: ${a.idea}` });
        }
      }
    }
    if (shares === 0 && !sold && cash >= 1) {
      const a = analyze(symbol, window, undefined, rules);
      if (a?.ideaKind === 'buy' && !buyWait({ market, ret1m: a.ret1m, rsi: a.rsi, score: a.score }, rules)) {
        const spend = cash * part(!!a.half);
        const n = spend / price;
        shares = n;
        avgCost = price;
        boughtAt = date;
        cash -= spend;
        trades.push({ date, side: 'BUY', price: r2(price), shares: Math.round(n * 10000) / 10000, dollars: r2(spend), why: a.idea.split(' It has dropped')[0] });
      }
    }
    if (shares > 0) inDays++;
    curve.push({ date, you: r2(cash + shares * price), hold: r2(holdShares * price), ...(spy && spyStart && si >= 0 ? { spy: r2((amount / spyStart) * spy.closes[si]) } : {}) });
  }

  const last = curve[curve.length - 1];
  const pct = (v: number) => r1(((v - amount) / amount) * 100);
  const lastPrice = closes[closes.length - 1];
  return {
    symbol, months, level, from: dates[start], to: dates[dates.length - 1], days: curve.length, amount,
    final: last.you, ret: pct(last.you),
    hold: { final: last.hold, ret: pct(last.hold) },
    spy: last.spy !== undefined ? { final: last.spy, ret: pct(last.spy) } : null,
    trades, closed, wins, winRate: closed ? Math.round((wins / closed) * 100) : null,
    maxDrop: maxDrawdown(curve.map((p) => p.you)),
    invested: Math.round((inDays / curve.length) * 100),
    open: shares > 0 ? { shares: Math.round(shares * 10000) / 10000, avgCost: r2(avgCost), value: r2(shares * lastPrice), pct: r1(((lastPrice - avgCost) / avgCost) * 100) } : undefined,
    curve, presets, shortHistory: start < SIM_WINDOW - 1,
  };
}

/** What the replay can't do exactly like the live app, in plain words (shown on the screen and in the Guide). */
export const SIM_LIMITS = [
  'Earnings dates: past earnings days aren’t available for free, so the “wait before earnings” rule (and the locked “never on earnings day”) is skipped.',
  'Company finances, Reddit talk and the AI check: their past values can’t be looked up, so those checks are skipped too.',
  'The falling-market rule IS replayed: the S&P 500 (SPY) prices of each day decide it, the same way as today.',
  'Each trade happens at that day’s closing price, with no fees or taxes, and parts of a share are allowed.',
  'A SELL sells everything, and the stop-loss watch is followed as if you had acted on its warning.',
];

