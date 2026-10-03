import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { HORIZON_TRADING_DAYS, scoreSignals, type Score } from '../lib/scoreboard';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

function Block({ title, sc }: { title: string; sc: Score }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-2">
      <p className="text-xs text-slate-400">{title}</p>
      {sc.scored.length ? (
        <>
          <p className="text-xl font-semibold">{sc.winRate!.toFixed(0)}% <span className="text-sm font-normal text-slate-400">right ({sc.wins} of {sc.scored.length})</span></p>
          <p className={`text-sm ${sc.avgEdge! >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>average {pct(sc.avgEdge!)} in the direction of the call</p>
        </>
      ) : (
        <p className="text-sm text-slate-500">Nothing to score yet.</p>
      )}
    </div>
  );
}

/** Did past signals actually work? Entry price vs the close five trading days later. */
export function Scoreboard() {
  const { signals, settings } = useStore();
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<Record<string, { dates: string[]; closes: number[] }>>({});
  const [err, setErr] = useState('');

  const candidates = useMemo(() => signals.filter((s) => s.entryPrice && s.source !== 'mock'), [signals]);
  const symbols = useMemo(() => [...new Set(candidates.map((s) => s.symbol))], [candidates]);

  useEffect(() => {
    if (!open || settings.mockMode || !symbols.length) return;
    setErr('');
    fetchTrendSeries(symbols).then((r) => setSeries(r.series)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, settings.mockMode, symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => scoreSignals(candidates, series), [candidates, series]);
  const approved = useMemo(() => scoreSignals(candidates.filter((s) => s.review?.verdict === 'APPROVE'), series), [candidates, series]);
  const rejected = useMemo(() => scoreSignals(candidates.filter((s) => s.review?.verdict === 'REJECT'), series), [candidates, series]);

  return (
    <div className="card mb-3">
      <button className="w-full text-left text-sm font-semibold" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} Scoreboard: did past signals work?
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-xs text-slate-500">
            Each signal's price when it fired is compared with the close {HORIZON_TRADING_DAYS} trading days later. A BUY is "right" if the price went up, a SELL if it went down.
            Only real (live) signals count; demo ones are ignored. This phone/computer's own signals only.
          </p>
          {settings.mockMode && <p className="rounded border border-sky-800 bg-sky-950 p-2 text-xs text-sky-200">Demo mode has no real price history. Switch to live mode to see results.</p>}
          {err && <p className="text-xs text-red-300">{err}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Block title="All signals" sc={all} />
            <Block title="AI said go" sc={approved} />
            <Block title="AI said no" sc={rejected} />
          </div>
          <p className="text-xs text-slate-500">
            {all.scored.length < 20 ? `Only ${all.scored.length} signal(s) scored so far: too few to trust. Wait for 20 or more. ` : ''}
            {all.waiting > 0 ? `${all.waiting} more are too recent to score.` : ''}
            {' '}If "AI said no" does as well as "AI said go", the AI is not adding value.
          </p>
          {all.scored.length > 0 && (
            <ul className="divide-y divide-slate-800 text-xs">
              {all.scored.slice(0, 10).map((x) => (
                <li key={x.signal.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>{x.win ? '✓' : '✗'} {x.signal.side} {x.signal.symbol} <span className="text-slate-500">${x.entry} → ${x.later}</span></span>
                  <span className={x.win ? 'text-emerald-300' : 'text-red-300'}>{pct(x.ret)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
