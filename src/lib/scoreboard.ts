import type { ScoreEntry, Signal } from '../types';

export const HORIZON_TRADING_DAYS = 5;
/** The two checks shown on the scoreboard: about a week and about a month (trend calls play out over weeks). */
export const HORIZONS = [5, 20] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface ScoredSignal {
  signal: Signal;
  entry: number;
  later: number;
  ret: number; // % change of the price after the horizon
  mkt: number | null; // % change of the whole market (SPY) over the same days; null = not known
  win: boolean; // BUY: did better than the market (or rose, if the market is unknown). SELL: did worse (or fell).
  edge: number; // % gained in the direction of the call, minus what the market did
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

export interface ScoreOpts {
  horizon?: number; // trading days (default HORIZON_TRADING_DAYS)
  bench?: Series; // SPY: when given, a call is judged against what the whole market did
}

/** % change of the benchmark between two dates (the first close on or after each); null when it can't be read. */
function benchRet(b: Series | undefined, from: string, to: string): number | null {
  if (!b) return null;
  const i = b.dates.findIndex((d) => d >= from);
  const j = b.dates.findIndex((d) => d >= to);
  return i < 0 || j < 0 || !b.closes[i] ? null : ((b.closes[j] - b.closes[i]) / b.closes[i]) * 100;
}

/**
 * Compare each signal's entry price with the close `horizon` trading days later. With a benchmark, a BUY is right only if
 * it beat the market (in a rising market almost everything rises, which is not skill), a SELL only if it did worse.
 */
export function scoreSignals(signals: Signal[], series: Record<string, Series>, opts: ScoreOpts = {}): Score {
  const h = opts.horizon ?? HORIZON_TRADING_DAYS;
  const scored: ScoredSignal[] = [];
  let waiting = 0;
  for (const s of signals) {
    if (!s.entryPrice) continue;
    const ser = series[s.symbol];
    const day = s.createdAt.slice(0, 10);
    const i = ser ? ser.dates.findIndex((d) => d >= day) : -1;
    const j = i + h;
    if (!ser || i < 0 || j >= ser.closes.length) {
      waiting++;
      continue;
    }
    const later = ser.closes[j];
    const ret = ((later - s.entryPrice) / s.entryPrice) * 100;
    const mkt = benchRet(opts.bench, ser.dates[i], ser.dates[j]);
    const edge = (s.side === 'BUY' ? 1 : -1) * (ret - (mkt ?? 0));
    scored.push({ signal: s, entry: s.entryPrice, later, ret, mkt, win: edge > 0, edge });
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

const STREAK_GAP_MS = 4 * 86400_000;

/**
 * Turn synced score entries into the minimal Signal shape the scorer needs. A call repeated day after day (same stock,
 * side and reason, no gap over 4 days) is one streak and counts once, from its first day, so one long BUY run doesn't
 * look like many right calls. Newest first, like the log.
 */
export function entriesToSignals(log: ScoreEntry[]): Signal[] {
  const last = new Map<string, number>();
  const out: Signal[] = [];
  for (const e of [...log].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = `${e.symbol}|${e.side}|${e.why ?? ''}|${e.ai ?? e.verdict ?? ''}`;
    const t = new Date(e.createdAt).getTime();
    const prev = last.get(k);
    last.set(k, t);
    if (prev !== undefined && t - prev <= STREAK_GAP_MS) continue;
    out.push({
      id: e.id, symbol: e.symbol, side: e.side, confidence: 0, reason: e.why ?? '', qty: 0, createdAt: e.createdAt, status: 'new', source: 'local', entryPrice: e.entryPrice,
      // The AI's own answer (in notes mode `verdict` is the free rules' decision and `ai` what the AI would have said).
      review: e.ai ?? e.verdict ? { verdict: (e.ai ?? e.verdict)!, confidence: 0, rationale: '', risks: [] } : undefined,
    });
  }
  return out.reverse();
}


export interface WaitScore {
  why: string; // WaitRule or 'ai'
  scored: number;
  right: number; // waiting was right: a held-back BUY whose price did not rise
  ifBought: number; // average % you would have made by buying anyway
  waiting: number;
}

/**
 * For every held-back BUY (a WAIT from a free rule or the AI, or an AI "skip"), was holding back right `horizon` trading
 * days later? Grouped by reason. With a benchmark, right = buying would not have beaten the market.
 */
export function scoreWaits(log: ScoreEntry[], series: Record<string, Series>, opts: ScoreOpts = {}): WaitScore[] {
  const held = (e: ScoreEntry) => e.verdict === 'CAUTION' || e.verdict === 'REJECT';
  // Held back by a free rule, or (notes mode) a BUY the AI would have held back.
  const waits = entriesToSignals(log.filter((e) => e.side === 'BUY' && (held(e) || e.ai === 'CAUTION' || e.ai === 'REJECT')).map((e) => (held(e) && e.why !== 'ai' ? { ...e, ai: undefined } : e)));
  const groups = new Map<string, Signal[]>();
  for (const s of waits) {
    const k = s.review?.verdict === 'REJECT' ? 'ai-skip' : s.reason || 'ai';
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()]
    .map(([why, list]) => {
      const sc = scoreSignals(list, series, opts);
      return { why, scored: sc.scored.length, right: sc.scored.length - sc.wins, ifBought: sc.avgEdge ?? 0, waiting: sc.waiting };
    })
    .sort((a, b) => b.scored - a.scored);
}

export type RuleVerdict = 'helped' | 'hurt' | 'unclear' | 'early';
/** Checks a rule needs before it is judged. */
export const MIN_JUDGE = 10;

/** Did this rule help? Helped = held back mostly losers; hurt = held back mostly winners; too few = too early. */
export function ruleVerdict(w: WaitScore): RuleVerdict {
  if (w.scored < MIN_JUDGE) return 'early';
  const pct = (w.right / w.scored) * 100;
  if (pct >= 55 && w.ifBought < 0) return 'helped';
  if (pct <= 45 && w.ifBought > 0) return 'hurt';
  return 'unclear';
}
