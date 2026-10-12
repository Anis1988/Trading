import type { Holding } from './holdings';
import type { Preset } from './strictness';

/**
 * 🎯 Options helper (owner's choice "A"): ideas for SELLING options only on what you already have, and the app never
 * places an order. Two kinds, both "covered" (your shares or your cash back them, nothing borrowed):
 * - Covered call: you own 100+ shares → sell someone the right to buy them at a higher price (the strike) by a date.
 *   You get paid now. If the price ends above the strike, your shares are sold at the strike.
 * - Cash-secured put: you'd like to buy a stock cheaper → sell someone the right to sell it to you at a lower price.
 *   You get paid now. If the price ends below the strike, you buy 100 shares at the strike (you keep the cash aside).
 * Prices: Cboe's free delayed quotes (15 min), else an estimate from the stock's recent moves (always labelled).
 * Plain TypeScript: used by the app and the server function.
 */
export type OptType = 'C' | 'P';
export interface OptQuote { type: OptType; expiry: string; strike: number; bid: number; ask: number; iv?: number; delta?: number; oi?: number; vol?: number }
export interface Chain { symbol: string; price: number; asOf: string; source: 'cboe' | 'estimate'; options: OptQuote[]; earnings?: string | null; hv?: number; note?: string }

/** How each strictness level picks: chance of being called / assigned (delta), days to expiry, and how busy the option must be. */
export interface OptRules { delta: number; minDays: number; maxDays: number; minOi: number; maxSpread: number; earnings: 'avoid' | 'warn' }
export const OPT_RULES: Record<Preset, OptRules> = {
  careful: { delta: 0.15, minDays: 28, maxDays: 50, minOi: 100, maxSpread: 0.15, earnings: 'avoid' },
  balanced: { delta: 0.25, minDays: 21, maxDays: 45, minOi: 50, maxSpread: 0.25, earnings: 'avoid' },
  risky: { delta: 0.35, minDays: 7, maxDays: 30, minOi: 20, maxSpread: 0.35, earnings: 'warn' },
};
export const RATE = 0.04; // yearly interest rate used in the price formula

// ---------- maths ----------
/** Standard normal cumulative distribution (Abramowitz–Stegun 7.1.26, error < 1e-7). */
export function ncdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Black–Scholes price, delta and chance to end in the money, for one option. */
export function bs(type: OptType, S: number, K: number, T: number, sigma: number, r = RATE): { price: number; delta: number; itm: number } {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S);
    return { price: intrinsic, delta: type === 'C' ? (S > K ? 1 : 0) : (S < K ? -1 : 0), itm: intrinsic > 0 ? 1 : 0 };
  }
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === 'C') return { price: S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2), delta: ncdf(d1), itm: ncdf(d2) };
  return { price: K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1), delta: ncdf(d1) - 1, itm: ncdf(-d2) };
}

/** Yearly volatility from daily closes (log returns × √252). */
export function histVol(closes: number[]): number | undefined {
  const c = closes.slice(-64);
  if (c.length < 21) return undefined;
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) if (c[i] > 0 && c[i - 1] > 0) r.push(Math.log(c[i] / c[i - 1]));
  const m = r.reduce((a, x) => a + x, 0) / r.length;
  const v = r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v * 252);
}

/** "AAPL261120C00250000" (the standard option code) → its parts. */
export function parseOcc(code: string): { root: string; expiry: string; type: OptType; strike: number } | null {
  const m = code.replace(/\s+/g, '').match(/^([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return { root: m[1], expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] as OptType, strike: Number(m[6]) / 1000 };
}

export const daysTo = (expiry: string, now = new Date()) => Math.max(0, Math.round((Date.parse(`${expiry}T20:00:00Z`) - now.getTime()) / 86400_000));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const mid = (q: OptQuote) => round((q.bid + q.ask) / 2);
/** Exchanges price options in $0.05 steps above $3, $0.01 below (most big stocks). */
export const tick = (p: number) => (p >= 3 ? Math.round(p * 20) / 20 : Math.round(p * 100) / 100);

/** No live quotes: a priced chain from the formula (Fridays 1–8 weeks out, strikes around the price). Always marked "estimate". */
export function estimateChain(symbol: string, price: number, vol: number, now = new Date()): Chain {
  const step = price < 25 ? 0.5 : price < 100 ? 1 : price < 250 ? 2.5 : price < 500 ? 5 : 10;
  const strikes: number[] = [];
  for (let k = Math.floor((price * 0.7) / step) * step; k <= price * 1.3; k += step) if (k > 0) strikes.push(round(k));
  const options: OptQuote[] = [];
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7)); // next Friday
  for (let w = 0; w < 9; w++, d.setUTCDate(d.getUTCDate() + 7)) {
    const expiry = d.toISOString().slice(0, 10);
    const T = daysTo(expiry, now) / 365;
    for (const K of strikes) for (const type of ['C', 'P'] as OptType[]) {
      const x = bs(type, price, K, T, vol);
      if (x.price < 0.05) continue;
      options.push({ type, expiry, strike: K, bid: tick(x.price * 0.97), ask: tick(x.price * 1.03), iv: vol, delta: round(x.delta, 3) });
    }
  }
  return { symbol, price, asOf: now.toISOString(), source: 'estimate', options, hv: vol, note: 'Estimated from the stock’s recent moves: no live option prices right now. Check the real price in Fidelity before you trade.' };
}

// ---------- ideas ----------
export type Strategy = 'call' | 'put';
export interface OptionIdea {
  strategy: Strategy; // call = covered call (shares you own), put = cash-secured put (cash you have)
  symbol: string;
  price: number; // the stock now
  q: OptQuote;
  premium: number; // per share (the middle of bid and ask)
  contracts: number; // 1 contract = 100 shares
  days: number;
  income: number; // cash you get now
  yieldPct: number; // income ÷ (shares' value or cash set aside)
  yearPct: number; // the same over a year
  chance: number; // 0..1: chance of being called away / buying the shares
  breakeven: number;
  cash?: number; // put: cash to keep aside
  outcome: string; // what happens if it's called / assigned, in plain words
  notes: string[]; // warnings (earnings, wide price, low trading…)
  estimate: boolean;
  avgCost?: number;
}

const chanceOf = (q: OptQuote, S: number, days: number) => {
  if (q.delta != null && isFinite(q.delta)) return Math.min(1, Math.abs(q.delta));
  return bs(q.type, S, q.strike, days / 365, q.iv || 0.3).itm;
};

/**
 * Expiries in the level's window, nearest to its middle first. When the level avoids earnings and earnings come soon,
 * dates that end BEFORE the earnings (at least a week out) are tried after those.
 */
function expiriesFor(c: Chain, r: OptRules, now: Date): string[] {
  const dates = [...new Set(c.options.map((o) => o.expiry))];
  const all = dates.filter((e) => { const d = daysTo(e, now); return d >= r.minDays && d <= r.maxDays; });
  const target = (r.minDays + r.maxDays) / 2;
  const main = all.sort((a, b) => Math.abs(daysTo(a, now) - target) - Math.abs(daysTo(b, now) - target));
  const today = now.toISOString().slice(0, 10);
  if (r.earnings !== 'avoid' || !c.earnings || c.earnings < today) return main;
  const before = dates.filter((e) => e < c.earnings! && daysTo(e, now) >= 7 && !main.includes(e)).sort().reverse();
  return [...main, ...before];
}

/** Options people actually trade, with a fair bid/ask (else the price you'd get is a guess). */
function tradable(q: OptQuote, r: OptRules, estimate: boolean): boolean {
  if (!(q.bid > 0) || !(q.ask >= q.bid)) return false;
  if (estimate) return true;
  const m = (q.bid + q.ask) / 2;
  return (q.ask - q.bid) / m <= r.maxSpread + 0.05 && (q.oi ?? 0) >= r.minOi;
}

function build(strategy: Strategy, c: Chain, q: OptQuote, contracts: number, now: Date, r: OptRules, avgCost?: number): OptionIdea {
  const days = daysTo(q.expiry, now);
  const premium = mid(q);
  const S = c.price;
  const income = round(premium * 100 * contracts);
  const base = strategy === 'call' ? S : q.strike;
  const yieldPct = round((premium / base) * 100);
  const notes: string[] = [];
  if (c.earnings && c.earnings > q.expiry && c.earnings >= now.toISOString().slice(0, 10) && daysTo(c.earnings, now) - days <= 14) notes.push(`Ends before the earnings on ${c.earnings}, on purpose.`);
  if (c.earnings && c.earnings >= now.toISOString().slice(0, 10) && c.earnings <= q.expiry) notes.push(`Earnings on ${c.earnings}, before this date: the price can jump${r.earnings === 'warn' ? ' (Risky level allows it)' : ''}.`);
  if (c.source !== 'estimate' && q.ask - q.bid > Math.max(0.1, premium * 0.15)) notes.push(`The gap between buyers and sellers is wide ($${q.bid.toFixed(2)}–$${q.ask.toFixed(2)}): ask for the middle, and don’t go below $${q.bid.toFixed(2)}.`);
  if (c.source !== 'estimate' && (q.oi ?? 0) < 100) notes.push('Not many of these are traded: your order may take a while to fill.');
  if (c.source === 'estimate') notes.push('Estimated price: check the real one in Fidelity first.');
  const chance = chanceOf(q, S, days);
  if (strategy === 'call') {
    const vsToday = round((q.strike - S + premium) * 100 * contracts);
    const vsCost = avgCost ? round((q.strike - avgCost + premium) * 100 * contracts) : undefined;
    return {
      strategy, symbol: c.symbol, price: S, q, premium, contracts, days, income, yieldPct, yearPct: round((yieldPct * 365) / Math.max(1, days), 1), chance,
      breakeven: round(S - premium), estimate: c.source === 'estimate', avgCost, notes,
      outcome: `If ${c.symbol} ends above $${q.strike} on ${q.expiry}, your ${contracts * 100} shares are sold at $${q.strike}: ${vsToday >= 0 ? '+' : '−'}$${Math.abs(vsToday).toLocaleString()} against today’s price${vsCost !== undefined ? ` (${vsCost >= 0 ? '+' : '−'}$${Math.abs(vsCost).toLocaleString()} against what you paid)` : ''}, premium included. If not, you keep the shares and the $${income.toLocaleString()}.`,
    };
  }
  const cash = round(q.strike * 100 * contracts);
  const eff = round(q.strike - premium);
  return {
    strategy, symbol: c.symbol, price: S, q, premium, contracts, days, income, yieldPct, yearPct: round((yieldPct * 365) / Math.max(1, days), 1), chance,
    breakeven: eff, cash, estimate: c.source === 'estimate', notes,
    outcome: `If ${c.symbol} ends below $${q.strike} on ${q.expiry}, you buy ${contracts * 100} shares at $${q.strike} (really $${eff} with the premium: ${round(((S - eff) / S) * 100, 1)}% under today’s price). If not, you keep the $${income.toLocaleString()} and the cash is free again.`,
  };
}

/**
 * 📞 Covered call on a stock you own (100+ shares). Never a strike below what you paid (that would lock in a loss),
 * never more contracts than your shares cover.
 */
export function coveredCall(h: Holding, c: Chain, preset: Preset, now = new Date()): OptionIdea | { skip: string } {
  const n = Math.floor(h.shares / 100);
  if (n < 1) return { skip: `You have ${h.shares} shares: a covered call needs at least 100.` };
  const r = OPT_RULES[preset];
  const est = c.source === 'estimate';
  for (const e of expiriesFor(c, r, now)) {
    if (r.earnings === 'avoid' && c.earnings && c.earnings >= now.toISOString().slice(0, 10) && c.earnings <= e) continue;
    const calls = c.options.filter((o) => o.type === 'C' && o.expiry === e && o.strike > c.price && o.strike >= h.avgCost && tradable(o, r, est));
    if (!calls.length) continue;
    const days = daysTo(e, now);
    const best = calls.reduce((a, b) => (Math.abs(chanceOf(a, c.price, days) - r.delta) <= Math.abs(chanceOf(b, c.price, days) - r.delta) ? a : b));
    if (mid(best) < 0.1) continue;
    return build('call', c, best, n, now, r, h.avgCost);
  }
  return { skip: r.earnings === 'avoid' && c.earnings ? `Earnings on ${c.earnings} fall in every suitable date: wait until after.` : 'No good call found right now (none traded enough, or all below what you paid).' };
}

/**
 * 💵 Cash-secured put on a stock you'd like to own. Only as many contracts as your cash covers (cash unknown = 1, with a note).
 */
export function cashPut(c: Chain, preset: Preset, cash: number | undefined, now = new Date()): OptionIdea | { skip: string } {
  const r = OPT_RULES[preset];
  const est = c.source === 'estimate';
  for (const e of expiriesFor(c, r, now)) {
    if (r.earnings === 'avoid' && c.earnings && c.earnings >= now.toISOString().slice(0, 10) && c.earnings <= e) continue;
    const puts = c.options.filter((o) => o.type === 'P' && o.expiry === e && o.strike < c.price && tradable(o, r, est));
    if (!puts.length) continue;
    const days = daysTo(e, now);
    const best = puts.reduce((a, b) => (Math.abs(chanceOf(a, c.price, days) - r.delta) <= Math.abs(chanceOf(b, c.price, days) - r.delta) ? a : b));
    if (mid(best) < 0.1) continue;
    const per = best.strike * 100;
    if (cash !== undefined && cash < per) return { skip: `Needs $${per.toLocaleString()} of cash kept aside (you have $${Math.round(cash).toLocaleString()}).` };
    const n = cash === undefined ? 1 : Math.max(1, Math.min(5, Math.floor(cash / per)));
    const idea = build('put', c, best, n, now, r);
    if (cash === undefined) idea.notes.push('Your cash isn’t set in Settings: shown for 1 contract.');
    return idea;
  }
  return { skip: r.earnings === 'avoid' && c.earnings ? `Earnings on ${c.earnings} fall in every suitable date: wait until after.` : 'No good put found right now (none traded enough).' };
}

/** Any option you pick (the "Try any option" box): same numbers as an idea. */
export function custom(strategy: Strategy, c: Chain, q: OptQuote, contracts: number, avgCost?: number, now = new Date()): OptionIdea {
  return build(strategy, c, q, contracts, now, OPT_RULES.balanced, avgCost);
}

/** Profit or loss at the expiry date for a range of stock prices (vs today's price for calls; vs nothing for puts). */
export function payoff(i: OptionIdea, points = 41): { s: number; pl: number }[] {
  const lo = i.price * 0.7, hi = i.price * 1.3;
  return Array.from({ length: points }, (_, k) => {
    const s = lo + ((hi - lo) * k) / (points - 1);
    const pl = i.strategy === 'call'
      ? (Math.min(s, i.q.strike) - i.price + i.premium) * 100 * i.contracts
      : (i.premium - Math.max(0, i.q.strike - s)) * 100 * i.contracts;
    return { s: round(s), pl: round(pl) };
  });
}

const niceDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The order to type in Fidelity (the app never sends it). */
export function ticket(i: OptionIdea): { line: string; steps: string[] } {
  const limit = tick(i.premium).toFixed(2);
  const kind = i.strategy === 'call' ? 'Call' : 'Put';
  return {
    line: `SELL TO OPEN ${i.contracts} ${i.symbol} ${niceDate(i.q.expiry)} $${i.q.strike} ${kind} · LIMIT $${limit} · DAY`,
    steps: [
      'Fidelity app → Trade → Options (or fidelity.com → Trade → Options).',
      `Account: the one with ${i.strategy === 'call' ? `your ${i.symbol} shares` : 'the cash'}. Symbol: ${i.symbol}.`,
      `Action: Sell To Open · ${kind} · Expiration ${niceDate(i.q.expiry)} · Strike $${i.q.strike} · Quantity ${i.contracts} contract${i.contracts > 1 ? 's' : ''}.`,
      `Order type: Limit $${limit} (the middle price; never below $${i.q.bid.toFixed(2)}) · Day.`,
      'Preview → check “Estimated proceeds” ≈ the income shown here → Place order.',
    ],
  };
}

export const STRATEGY: Record<Strategy, { icon: string; name: string; short: string }> = {
  call: { icon: '📞', name: 'Covered call', short: 'Get paid to agree to sell your shares at a higher price.' },
  put: { icon: '💵', name: 'Cash-secured put', short: 'Get paid to agree to buy a stock at a lower price.' },
};
