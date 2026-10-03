import type { Side, Verdict } from '../types';

export interface Holding {
  symbol: string;
  shares: number;
  avgCost: number; // average price paid per share
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
  let q = qty;
  if (side === 'SELL' && qty > h.shares) {
    q = h.shares;
    note += ` You only own ${h.shares}, so the amount is lowered to ${h.shares}.`;
  }
  return { known: true, owned: h.shares, qty: q, note };
}

/** The last line the user acts on. */
export function confirmLine(verdict: Verdict, side: Side, qty: number, symbol: string): string {
  if (verdict === 'APPROVE') return `CONFIRM: ${side} ${qty} ${symbol}`;
  if (verdict === 'CAUTION') return `WAIT: not clear enough to ${side} ${symbol}`;
  return `DO NOT ${side} ${symbol}`;
}
