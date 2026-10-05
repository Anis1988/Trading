import { useState } from 'react';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { BACKTEST_DAYS, backtest, type BacktestResult, type CallStats } from '../lib/backtest';
import { Change } from './ui';

const VERDICT: Record<BacktestResult['verdict'], { text: string; cls: string }> = {
  helped: { text: '✓ The rules helped', cls: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200' },
  mixed: { text: '◆ Mixed', cls: 'border-amber-300/50 bg-amber-400/15 text-amber-200' },
  'no-help': { text: '✕ The rules did not help', cls: 'border-red-300/50 bg-red-400/15 text-red-200' },
  'too-few': { text: 'Too few calls to judge', cls: 'border-white/15 text-slate-300' },
};

function Call({ label, s, sell }: { label: string; s: CallStats; sell?: boolean }) {
  if (!s.count) return <p className="text-xs text-slate-500">{label}: never happened</p>;
  return (
    <p className="text-xs text-slate-300">
      {label} {s.count}×: right <b className="num">{s.right} of {s.count}</b> · a month later <Change pct={s.avg} />
      <span className="text-slate-500"> {sell ? '(lower is better)' : ''}</span>
    </p>
  );
}

/** One stock's result. Also used as the live example in the Guide. */
export function BacktestRow({ r }: { r: BacktestResult }) {
  const v = VERDICT[r.verdict];
  return (
    <li className="panel space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="font-display text-base">{r.symbol}</b>
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${v.cls}`}>{v.text}</span>
      </div>
      <Call label="BUY" s={r.buy} />
      <Call label="SELL" s={r.sell} sell />
      <p className="text-xs text-slate-500">Just holding, from any day: <Change pct={r.anyDay} /> a month later</p>
    </li>
  );
}

/** Replays the app's trend rules on the last 2 years of each stock you own or watch. Free, runs in your browser. */
export function Backtest() {
  const { settings, watchlist } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<BacktestResult[] | null>(null);
  const symbols = [...new Set([...settings.holdings.map((h) => h.symbol), ...watchlist])].slice(0, 15);

  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await fetchTrendSeries(symbols, '2y');
      setRows(symbols.map((s) => (r.series[s] ? backtest(s, r.series[s].closes) : null)).filter((x): x is BacktestResult => !!x));
      if (r.errors.length) setErr(r.errors.slice(0, 3).join(' · '));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const judged = rows?.filter((r) => r.verdict !== 'too-few') ?? [];
  const helped = judged.filter((r) => r.verdict === 'helped').length;

  return (
    <section className="card !p-0">
      <button className="flex w-full items-center justify-between px-4 py-3.5 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0">
          <span className="block font-display font-semibold">Test the rules on the past</span>
          <span className="block text-xs text-slate-400">Would the trend BUY / SELL have worked on your stocks in the last 2 years?</span>
        </span>
        <span aria-hidden="true" className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3 text-sm">
          {!symbols.length ? (
            <p className="text-slate-400">Add your holdings in Settings first.</p>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={() => void run()}>
              {busy ? <><span className="spinner" /> Testing {symbols.length} stocks…</> : rows ? 'Run again' : `Test ${symbols.length} stock${symbols.length === 1 ? '' : 's'}`}
            </button>
          )}
          {err && <p className="text-xs text-red-300">{err}</p>}
          {rows && (
            <>
              {judged.length > 0 && (
                <p className="text-slate-200">The trend rules helped on <b className="num">{helped} of {judged.length}</b> stocks. {helped / judged.length >= 0.5 ? 'Reasonable to keep trusting them, with the other checks.' : 'Be careful: on most of your stocks, the trend alone was not a good guide.'}</p>
              )}
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">{rows.map((r) => <BacktestRow key={r.symbol} r={r} />)}</ul>
            </>
          )}
          <p className="text-xs text-slate-500">
            The app replays its own price-trend rules day by day on the last 2 years, as if you owned each stock. Each time they switched to BUY or SELL, it checks the price {BACKTEST_DAYS} trading days (about a month) later. "Helped" means BUYs did better than just holding, and SELLs came before weaker months. It tests the trend only: old news and the AI can't be replayed. The past doesn't guarantee the future. Free, no AI.
          </p>
        </div>
      )}
    </section>
  );
}
