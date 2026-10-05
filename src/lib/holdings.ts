import type { Side, Verdict } from '../types';

export interface Holding {
  symbol: string;
  shares: number;
  avgCost: number; // average price paid per share
  boughtAt?: string; // YYYY-MM-DD, first purchase (for the 1-year tax line)
}

export interface TaxInfo {
  days: number; // days held
  longTerm: boolean; // held more than a year: lower tax on the gain
  longOn: string; // YYYY-MM-DD the day it becomes long-term
  daysToLong: number;
}

/** US rule of thumb: a gain on shares held more than 1 year is taxed less ("long-term"). */
export function taxInfo(h: Pick<Holding, 'boughtAt'>, now = new Date()): TaxInfo | null {
  if (!h.boughtAt) return null;
  const bought = new Date(`${h.boughtAt}T12:00:00Z`);
  if (isNaN(bought.getTime())) return null;
  const longDate = new Date(bought);
  longDate.setUTCFullYear(longDate.getUTCFullYear() + 1);
  longDate.setUTCDate(longDate.getUTCDate() + 1);
  const day = 86400_000;
  const days = Math.max(0, Math.floor((now.getTime() - bought.getTime()) / day));
  const daysToLong = Math.max(0, Math.ceil((longDate.getTime() - now.getTime()) / day));
  return { days, longTerm: daysToLong === 0, longOn: longDate.toISOString().slice(0, 10), daysToLong };
}

const nDays = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const niceDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const held = (days: number) => (days >= 60 ? `${Math.floor(days / 30.4)} months` : nDays(days));

/** Plain words about tax timing for a sale. `gain` is the profit per share now (if known). */
export function taxText(t: TaxInfo, gain?: number): string {
  if (t.longTerm) return `Held over a year, so any gain is taxed at the lower long-term rate.`;
  const base = `Held ${held(t.days)}. Until ${niceDate(t.longOn)} (${nDays(t.daysToLong)}) a gain is taxed as short-term, which is usually higher.`;
  if (gain !== undefined && gain <= 0) return `${base} You're at a loss now, so this doesn't matter much.`;
  if (t.daysToLong <= 60) return `${base} Waiting ${nDays(t.daysToLong)} could lower the tax, unless the price is falling fast.`;
  return base;
}

export interface HoldingAssessment {
  known: boolean; // user entered at least one holding
  owned: number;
  note: string; // plain-words comparison with what the user actually owns
  block?: string; // set when the trade is impossible (e.g. selling a stock you don't own)
  qty: number; // quantity after capping (SELL never exceeds shares owned)
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Deterministic check of a proposed trade against the user's actual holdings. */
export function assessHolding(side: Side, qty: number, symbol: string, holdings: Holding[], price?: number): HoldingAssessment {
  if (!holdings.length) {
    return { known: false, owned: 0, qty, note: 'No holdings entered in Settings, so I could not compare with what you own.' };
  }
  const h = holdings.find((x) => x.symbol === symbol);
  if (!h || h.shares <= 0) {
    if (side === 'SELL') {
      return { known: true, owned: 0, qty: 0, note: `You do not own ${symbol}.`, block: `You do not own ${symbol}, so there is nothing to sell.` };
    }
    return { known: true, owned: 0, qty, note: `You do not own ${symbol} yet. This would be a new position.` };
  }
  let note = `You own ${h.shares} share${h.shares === 1 ? '' : 's'} of ${symbol}, bought at ${money(h.avgCost)} on average.`;
  if (price && h.avgCost > 0) {
    const pct = ((price - h.avgCost) / h.avgCost) * 100;
    const gain = (price - h.avgCost) * h.shares;
    note += ` Now ${money(price)}: you are ${gain >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% (${gain >= 0 ? '+' : '-'}${money(Math.abs(gain))}).`;
  }
  const tax = taxInfo(h);
  if (tax) note += ` ${taxText(tax, price && h.avgCost > 0 ? price - h.avgCost : undefined)}`;
  let q = qty;
  if (side === 'SELL' && qty > h.shares) {
    q = h.shares;
    note += ` You only own ${h.shares}, so the amount is lowered to ${h.shares}.`;
  }
  return { known: true, owned: h.shares, qty: q, note };
}

/** The last line the user acts on. */
export function confirmLine(verdict: Verdict, side: Side, qty: number, symbol: string): string {
  if (verdict === 'APPROVE') return `${side} ${qty} ${symbol}`;
  if (verdict === 'CAUTION') return `WAIT: not clear enough to ${side.toLowerCase()} ${symbol} yet`;
  return `SKIP: do not ${side.toLowerCase()} ${symbol}`;
}
