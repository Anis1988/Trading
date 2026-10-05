import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { HORIZON_TRADING_DAYS, scoreSignals, scoreWaits, entriesToSignals, type Score, type WaitScore } from '../lib/scoreboard';
import { RULE_LABEL } from '../lib/waitRules';
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

/** Was each kind of WAIT worth it? Waiting was right if the price did not go up in the next 5 trading days. */
export function WaitBlock({ rows }: { rows: WaitScore[] }) {
  if (!rows.length) return null;
  const total = rows.reduce((t, r) => ({ scored: t.scored + r.scored, waiting: t.waiting + r.waiting }), { scored: 0, waiting: 0 });
  return (
    <div className="panel space-y-2">
      <p className="label">Were the WAITs worth it?</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = r.scored ? (r.right / r.scored) * 100 : null;
          return (
            <li key={r.why} className="text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-slate-200">{RULE_LABEL[r.why as keyof typeof RULE_LABEL] ?? r.why}</span>
                {pct !== null ? (
                  <span className={`num text-xs ${pct >= 50 ? 'text-emerald-300' : 'text-red-300'}`}>right {r.right} of {r.scored}</span>
                ) : (
                  <span className="text-xs text-slate-500">{r.waiting} too recent</span>
                )}
              </div>
              {pct !== null && (
                <>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${pct >= 50 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} /></div>
                  <p className="mt-0.5 text-xs text-slate-400">If you had bought anyway: <Change pct={r.ifBought} /> on average{r.waiting ? ` · ${r.waiting} more too recent` : ''}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">
        A WAIT was right if the price was not higher {HORIZON_TRADING_DAYS} trading days later (waiting cost you nothing). Mostly red after 10+ checks means that rule holds you back more than it helps.
        {total.scored < 10 ? ' Not enough yet to judge: give it a few weeks.' : ''}
      </p>
    </div>
  );
}

/** Did past calls work? Price when the call was made vs the close five trading days later. Synced across devices. */
export function Scoreboard() {
  const { scoreLog } = useStore();
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<Record<string, { dates: string[]; closes: number[] }>>({});
  const [err, setErr] = useState('');
  // Alerts only (the WAITs logged from stock tiles and Ideas are scored separately below).
  const candidates = useMemo(() => entriesToSignals(scoreLog.filter((e) => !e.id.startsWith('wait-'))), [scoreLog]);
  const symbols = useMemo(() => [...new Set(scoreLog.slice(0, 300).map((e) => e.symbol))].slice(0, 40), [scoreLog]);
  const waits = useMemo(() => scoreWaits(scoreLog, series), [scoreLog, series]);

  useEffect(() => {
    if (!open || !symbols.length) return;
    setErr('');
    fetchTrendSeries(symbols).then((r) => setSeries(r.series)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <WaitBlock rows={waits} />
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
