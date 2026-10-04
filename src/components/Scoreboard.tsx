import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { HORIZON_TRADING_DAYS, scoreSignals, entriesToSignals, type Score } from '../lib/scoreboard';
import { ActionChip, Change } from './ui';

function Block({ title, sc }: { title: string; sc: Score }) {
  return (
    <div className="panel">
      <p className="label">{title}</p>
      {sc.scored.length ? (
        <>
          <p className="num mt-1 text-2xl font-semibold">{sc.winRate!.toFixed(0)}%<span className="ml-1 text-sm font-normal text-slate-400">right</span></p>
          <p className="text-xs text-slate-400"><span className="num">{sc.wins}</span> of <span className="num">{sc.scored.length}</span> · avg <Change pct={sc.avgEdge!} /></p>
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Nothing scored yet.</p>
      )}
    </div>
  );
}

/** Did past calls work? Price when the call was made vs the close five trading days later. Synced across devices. */
export function Scoreboard() {
  const { scoreLog, settings } = useStore();
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<Record<string, { dates: string[]; closes: number[] }>>({});
  const [err, setErr] = useState('');
  const candidates = useMemo(() => entriesToSignals(scoreLog), [scoreLog]);
  const symbols = useMemo(() => [...new Set(candidates.map((s) => s.symbol))].slice(0, 30), [candidates]);

  useEffect(() => {
    if (!open || settings.mockMode || !symbols.length) return;
    setErr('');
    fetchTrendSeries(symbols).then((r) => setSeries(r.series)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, settings.mockMode, symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => scoreSignals(candidates, series), [candidates, series]);
  const go = useMemo(() => scoreSignals(candidates.filter((s) => s.review?.verdict === 'APPROVE'), series), [candidates, series]);
  const no = useMemo(() => scoreSignals(candidates.filter((s) => s.review?.verdict === 'REJECT'), series), [candidates, series]);

  return (
    <section className="card !p-0">
      <button className="flex w-full items-center justify-between px-4 py-3.5 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>
          <span className="block font-display font-semibold">Scoreboard</span>
          <span className="block text-xs text-slate-400">Did past calls actually work? All your devices and background alerts.</span>
        </span>
        <span aria-hidden="true" className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3 text-sm">
          {settings.mockMode && <p className="panel text-xs text-sky-200">Demo mode has no real price history. Switch to live to see results.</p>}
          {err && <p className="text-xs text-red-300">{err}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Block title="All calls" sc={all} />
            <Block title="AI said go" sc={go} />
            <Block title="AI said skip" sc={no} />
          </div>
          <p className="text-xs text-slate-500">
            Each call's price is compared with the close {HORIZON_TRADING_DAYS} trading days later. BUY is right if it rose, SELL if it fell.
            {all.scored.length < 20 ? ` Only ${all.scored.length} scored so far: wait for 20+ before trusting it.` : ''}
            {all.waiting > 0 ? ` ${all.waiting} are too recent to score.` : ''} If "AI said skip" does as well as "AI said go", the AI is not helping.
          </p>
          {all.scored.length > 0 && (
            <ul className="divide-y divide-white/5">
              {all.scored.slice(0, 12).map((x) => (
                <li key={x.signal.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span aria-label={x.win ? 'right' : 'wrong'} className={x.win ? 'text-emerald-300' : 'text-red-300'}>{x.win ? '✓' : '✕'}</span>
                    <ActionChip action={x.signal.side} size="sm" />
                    <b className="font-display">{x.signal.symbol}</b>
                    <span className="num text-xs text-slate-500">${x.entry} → ${x.later}</span>
                  </span>
                  <Change pct={x.ret} className="text-xs" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
