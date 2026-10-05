import type { ScoreEntry, Signal } from '../types';

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

/** Turn synced score entries into the minimal Signal shape the scorer needs; one call per symbol/side/day. */
export function entriesToSignals(log: ScoreEntry[]): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const e of log) {
    const k = `${e.symbol}|${e.side}|${e.createdAt.slice(0, 10)}|${e.why ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: e.id, symbol: e.symbol, side: e.side, confidence: 0, reason: e.why ?? '', qty: 0, createdAt: e.createdAt, status: 'new', source: 'local', entryPrice: e.entryPrice,
      review: e.verdict ? { verdict: e.verdict, confidence: 0, rationale: '', risks: [] } : undefined,
    });
  }
  return out;
}


export interface WaitScore {
  why: string; // WaitRule or 'ai'
  scored: number;
  right: number; // waiting was right: a held-back BUY whose price did not rise
  ifBought: number; // average % you would have made by buying anyway
  waiting: number;
}

/** For every WAIT (free rule or AI), was waiting right 5 trading days later? Grouped by reason. */
export function scoreWaits(log: ScoreEntry[], series: Record<string, Series>): WaitScore[] {
  const waits = entriesToSignals(log.filter((e) => e.verdict === 'CAUTION' && e.side === 'BUY'));
  const groups = new Map<string, Signal[]>();
  for (const s of waits) groups.set(s.reason || 'ai', [...(groups.get(s.reason || 'ai') ?? []), s]);
  return [...groups.entries()]
    .map(([why, list]) => {
      const sc = scoreSignals(list, series);
      return { why, scored: sc.scored.length, right: sc.scored.length - sc.wins, ifBought: sc.avgEdge ?? 0, waiting: sc.waiting };
    })
    .sort((a, b) => b.scored - a.scored);
}
