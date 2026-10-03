import type { Signal } from '../types';

export const HORIZON_TRADING_DAYS = 5;

export interface ScoredSignal {
  signal: Signal;
  entry: number;
  later: number;
  ret: number; // % change of the price after the horizon
  win: boolean; // BUY: price rose. SELL: price fell (the sale avoided a drop).
  edge: number; // % gained in the direction of the call (BUY: ret, SELL: -ret)
}

export interface Score {
  scored: ScoredSignal[];
  waiting: number; // signals not old enough yet
  wins: number;
  winRate: number | null;
  avgEdge: number | null;
}

interface Series {
  dates: string[];
  closes: number[];
}

/** Compare each signal's entry price with the close HORIZON trading days later. */
export function scoreSignals(signals: Signal[], series: Record<string, Series>): Score {
  const scored: ScoredSignal[] = [];
  let waiting = 0;
  for (const s of signals) {
    if (!s.entryPrice) continue;
    const ser = series[s.symbol];
    const day = s.createdAt.slice(0, 10);
    const i = ser ? ser.dates.findIndex((d) => d >= day) : -1;
    const j = i + HORIZON_TRADING_DAYS;
    if (!ser || i < 0 || j >= ser.closes.length) {
      waiting++;
      continue;
    }
    const later = ser.closes[j];
    const ret = ((later - s.entryPrice) / s.entryPrice) * 100;
    const edge = s.side === 'BUY' ? ret : -ret;
    scored.push({ signal: s, entry: s.entryPrice, later, ret, win: edge > 0, edge });
  }
  const wins = scored.filter((x) => x.win).length;
  return {
    scored,
    waiting,
    wins,
    winRate: scored.length ? (wins / scored.length) * 100 : null,
    avgEdge: scored.length ? scored.reduce((a, x) => a + x.edge, 0) / scored.length : null,
  };
}
