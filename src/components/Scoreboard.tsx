import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { HORIZON_TRADING_DAYS, MIN_JUDGE, ruleVerdict, scoreSignals, scoreWaits, entriesToSignals, type Horizon, type RuleVerdict, type Score, type WaitScore } from '../lib/scoreboard';
import { RULE_LABEL } from '../lib/waitRules';
import { LEVEL } from '../lib/strictness';
import { ActionChip, Change, Seg } from './ui';

const VERDICT: Record<RuleVerdict, { text: string; cls: string }> = {
  helped: { text: '✓ Helped', cls: 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200' },
  hurt: { text: '✕ Held you back', cls: 'border-red-300/40 bg-red-400/15 text-red-200' },
  unclear: { text: '◆ No clear effect', cls: 'border-white/15 bg-white/5 text-slate-300' },
  early: { text: 'Too early', cls: 'border-white/10 text-slate-500' },
};

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

/** Which rules helped? Each held-back BUY (a WAIT or an AI skip): was holding back right `days` trading days later? */
export function WaitBlock({ rows, days = HORIZON_TRADING_DAYS }: { rows: WaitScore[]; days?: number }) {
  if (!rows.length) return null;
  const total = rows.reduce((t, r) => ({ scored: t.scored + r.scored, waiting: t.waiting + r.waiting }), { scored: 0, waiting: 0 });
  return (
    <div className="panel space-y-2">
      <p className="label">Which rules helped?</p>
      <ul className="space-y-2">
        {rows.map((r) => {
          const pct = r.scored ? (r.right / r.scored) * 100 : null;
          const v = VERDICT[ruleVerdict(r)];
          return (
            <li key={r.why} className="text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="text-slate-200">{RULE_LABEL[r.why as keyof typeof RULE_LABEL] ?? r.why}</span>
                <span className="flex items-center gap-2">
                  {pct !== null ? (
                    <span className={`num text-xs ${pct >= 50 ? 'text-emerald-300' : 'text-red-300'}`}>right {r.right} of {r.scored}</span>
                  ) : (
                    <span className="text-xs text-slate-500">{r.waiting} too recent</span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.cls}`}>{v.text}</span>
                </span>
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
        Holding back was right if buying would not have beaten the whole market (S&P 500) {days} trading days later. ✓ Helped = it mostly stopped losers; ✕ Held you back = it mostly stopped winners, so it may be worth turning off (Settings → How careful → Custom). Each needs {MIN_JUDGE}+ checks.
        {total.scored < MIN_JUDGE ? ' Not enough yet to judge: give it a few weeks.' : ''}
      </p>
    </div>
  );
}

/** Did past calls work? Price when the call was made vs the close 5 or 20 trading days later, against the market. Synced across devices. */
export function Scoreboard() {
  const { scoreLog } = useStore();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<Horizon>(HORIZON_TRADING_DAYS);
  const [series, setSeries] = useState<Record<string, { dates: string[]; closes: number[] }>>({});
  const [err, setErr] = useState('');
  // Alerts only (the WAITs logged from stock tiles and Ideas are scored separately below).
  const candidates = useMemo(() => entriesToSignals(scoreLog.filter((e) => !e.id.startsWith('wait-'))), [scoreLog]);
  const symbols = useMemo(() => [...new Set(scoreLog.slice(0, 300).map((e) => e.symbol))].slice(0, 40), [scoreLog]);
  const opts = useMemo(() => ({ horizon: days, bench: series.SPY }), [days, series]);
  const waits = useMemo(() => scoreWaits(scoreLog, series, opts), [scoreLog, series, opts]);

  useEffect(() => {
    if (!open || !symbols.length) return;
    setErr('');
    fetchTrendSeries([...new Set([...symbols, 'SPY'])]).then((r) => setSeries(r.series)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, symbols.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => scoreSignals(candidates, series, opts), [candidates, series, opts]);
  const go = useMemo(() => scoreSignals(candidates.filter((s) => s.review?.verdict === 'APPROVE'), series, opts), [candidates, series, opts]);
  const no = useMemo(() => scoreSignals(candidates.filter((s) => s.review?.verdict === 'REJECT'), series, opts), [candidates, series, opts]);
  // 🎚️ How each level did (BUY calls the AI approved, tagged with the level in use).
  const byLevel = useMemo(() => {
    const lv = new Map(scoreLog.map((e) => [e.id, e.level ?? 'balanced']));
    const groups = new Map<string, typeof candidates>();
    for (const c of candidates.filter((x) => x.side === 'BUY' && x.review?.verdict === 'APPROVE')) groups.set(lv.get(c.id) ?? 'balanced', [...(groups.get(lv.get(c.id) ?? 'balanced') ?? []), c]);
    return [...groups.entries()].map(([k, list]) => [k, scoreSignals(list, series, opts)] as const);
  }, [candidates, series, scoreLog, opts]);

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
          <Seg label="Check after" value={String(days) as '5' | '20'} onChange={(v) => setDays(Number(v) as Horizon)} options={[['5', '1 week'], ['20', '1 month']] as const} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Block title="All calls" sc={all} />
            <Block title="AI said go" sc={go} />
            <Block title="AI said skip" sc={no} />
          </div>
          <p className="text-xs text-slate-500">
            Each call's price is compared with the close {days} trading days later, against the whole market (S&P 500): a BUY is right if it beat the market, a SELL if it did worse. A call repeated day after day counts once.
            {all.scored.length < 20 ? ` Only ${all.scored.length} scored so far: wait for 20+ before trusting it.` : ''}
            {all.waiting > 0 ? ` ${all.waiting} are too recent to score.` : ''} If "AI said skip" does as well as "AI said go", the AI is not helping.
          </p>
          {byLevel.length > 0 && (
            <div className="panel space-y-1">
              <p className="label">By level (🎚️ How careful)</p>
              <ul className="space-y-0.5 text-xs">{byLevel.map(([lv, sc]) => (
                <li key={lv} className="flex justify-between gap-2"><span>{LEVEL[lv as keyof typeof LEVEL]?.icon ?? '⚖️'} {LEVEL[lv as keyof typeof LEVEL]?.name ?? 'Balanced'}</span><span className="num text-slate-300">{sc.scored.length ? `${sc.winRate!.toFixed(0)}% right of ${sc.scored.length}` : `${sc.waiting} too recent`}</span></li>
              ))}</ul>
              <p className="text-[11px] text-slate-500">Calls made before levels existed count as Balanced.</p>
            </div>
          )}
          <WaitBlock rows={waits} days={days} />
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
                  <span className="text-right text-xs"><Change pct={x.ret} />{x.mkt !== null && <span className="block text-[11px] text-slate-500">market <Change pct={x.mkt} /></span>}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
