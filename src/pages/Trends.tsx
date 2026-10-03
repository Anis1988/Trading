import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { analyze, mockSeries, POPULAR, type Analysis } from '../lib/trend';
import { fetchRecommendation, fetchTrendSeries, mockRecommendation, type Recommendation } from '../lib/api';

const LABEL_STYLE: Record<Analysis['label'], string> = {
  'Strong uptrend': 'bg-emerald-700 text-emerald-50',
  Uptrend: 'bg-emerald-900 text-emerald-100',
  Mixed: 'bg-slate-700 text-slate-100',
  Downtrend: 'bg-red-800 text-red-100',
};
const IDEA_STYLE: Record<Analysis['ideaKind'], string> = {
  buy: 'border-emerald-700 text-emerald-200',
  wait: 'border-amber-700 text-amber-200',
  hold: 'border-slate-600 text-slate-200',
  sell: 'border-red-700 text-red-200',
  avoid: 'border-red-900 text-red-300',
};
const ACTION_STYLE = { BUY: 'bg-emerald-700', SELL: 'bg-red-700', WATCH: 'bg-slate-600' } as const;

function Spark({ closes, up }: { closes: number[]; up: boolean }) {
  const w = 300;
  const h = 56;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const pts = closes.map((c, i) => `${((i / (closes.length - 1)) * w).toFixed(1)},${(h - 4 - ((c - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" preserveAspectRatio="none" role="img" aria-label={`Price over the last ${closes.length} trading days, ${up ? 'rising' : 'falling'}`}>
      <polyline points={pts} fill="none" stroke={up ? '#34d399' : '#f87171'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;

export function Trends() {
  const { watchlist, settings, toast, log } = useStore();
  const [scope, setScope] = useState<'mine' | 'popular'>('mine');
  const [rows, setRows] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState('');
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  const mine = useMemo(() => [...new Set([...watchlist, ...settings.holdings.map((h) => h.symbol)])], [watchlist, settings.holdings]);
  const symbols = scope === 'mine' ? mine : [...new Set([...POPULAR, ...mine])];

  const load = useCallback(async () => {
    if (!symbols.length) return setRows([]);
    setLoading(true);
    setErr('');
    setRec(null);
    try {
      const series: Record<string, { closes: number[] }> = {};
      let errors: string[] = [];
      if (settings.mockMode) symbols.forEach((s) => (series[s] = mockSeries(s)));
      else {
        const r = await fetchTrendSeries(symbols);
        Object.assign(series, r.series);
        errors = r.errors;
      }
      const out = symbols
        .map((s) => analyze(s, series[s]?.closes ?? [], settings.holdings.find((h) => h.symbol === s)))
        .filter((a): a is Analysis => !!a)
        .sort((a, b) => b.score - a.score || b.ret3m - a.ret3m);
      setRows(out);
      setUpdated(new Date().toLocaleTimeString());
      if (errors.length) setErr(`${errors.length} symbol(s) had no data (${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '…' : ''}).`);
      else if (!out.length) setErr('No price history came back.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(','), settings.mockMode, settings.holdings]);

  useEffect(() => void load(), [load]);

  const askAi = async () => {
    setRecLoading(true);
    try {
      const r = settings.mockMode ? mockRecommendation(rows) : await fetchRecommendation(rows, settings.holdings);
      setRec(r);
      log('info', `AI picks: ${r.picks.map((p) => `${p.action} ${p.symbol}`).join(', ') || 'none'}`);
    } catch (e) {
      toast('error', `AI picks failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">Trends &amp; ideas</h2>
        <div className="flex overflow-hidden rounded border border-slate-700 text-sm">
          {(['mine', 'popular'] as const).map((k) => (
            <button key={k} className={`min-h-[44px] px-3 sm:min-h-0 sm:py-1 ${scope === k ? 'bg-slate-700' : ''}`} onClick={() => setScope(k)}>
              {k === 'mine' ? 'My stocks' : 'Popular'}
            </button>
          ))}
        </div>
        <button className="btn" disabled={loading} onClick={() => void load()}>{loading ? <><span className="spinner" /> Loading…</> : 'Refresh'}</button>
      </div>
      <p className="text-xs text-slate-500">
        Based on the last ~6 months of daily prices only. No news or company numbers. {settings.mockMode ? 'Demo mode: prices are made up. ' : ''}
        {updated && `Updated ${updated}. `}Ideas, not advice.
      </p>
      {err && <p className="rounded border border-amber-800 bg-amber-950 p-2 text-sm text-amber-200">{err}</p>}

      {rows.length > 0 && (
        <div className="card space-y-2">
          <button className="btn-primary w-full sm:w-auto" disabled={recLoading} onClick={() => void askAi()}>
            {recLoading ? <><span className="spinner" /> Asking the AI…</> : '✨ Ask the AI what to look at'}
          </button>
          {rec && (
            <div className="space-y-2 text-sm">
              <p className="text-slate-300">{rec.summary}{rec.simulated ? ' (demo)' : ''}</p>
              {rec.picks.length === 0 && <p className="text-slate-400">Nothing stands out right now.</p>}
              {rec.picks.map((p) => (
                <div key={p.symbol + p.action} className="flex items-start gap-2">
                  <span className={`mt-0.5 rounded px-2 py-0.5 text-xs font-bold ${ACTION_STYLE[p.action]}`}>{p.action === 'WATCH' ? 'WATCH' : p.action}</span>
                  <span><b>{p.symbol}</b> <span className="text-slate-300">{p.reason}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => {
          const h = settings.holdings.find((x) => x.symbol === a.symbol);
          const pl = h && h.avgCost > 0 ? ((a.price - h.avgCost) / h.avgCost) * 100 : null;
          return (
            <div key={a.symbol} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{a.symbol}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${LABEL_STYLE[a.label]}`}>{a.label}</span>
                {h && <span className="rounded bg-sky-900 px-2 py-0.5 text-xs">You own {h.shares}</span>}
                <span className="ml-auto text-sm">${a.price}</span>
              </div>
              <Spark closes={a.closes} up={a.closes[a.closes.length - 1] >= a.closes[0]} />
              <div className="mb-2 grid grid-cols-3 gap-1 text-center text-xs text-slate-400">
                <div><div className={a.ret1m >= 0 ? 'text-emerald-300' : 'text-red-300'}>{pct(a.ret1m)}</div>1 month</div>
                <div><div className={a.ret3m >= 0 ? 'text-emerald-300' : 'text-red-300'}>{pct(a.ret3m)}</div>3 months</div>
                <div><div className="text-slate-200">{a.fromHigh}%</div>from high</div>
              </div>
              <p className={`rounded border px-2 py-1.5 text-sm ${IDEA_STYLE[a.ideaKind]}`}>
                {a.idea}
                {pl !== null && <span className="block text-xs text-slate-400">Your cost ${h!.avgCost}: {pl >= 0 ? 'up' : 'down'} {Math.abs(pl).toFixed(1)}%.</span>}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Score {a.score}/5 · RSI {a.rsi} · 20-day avg ${a.sma20} · 50-day avg ${a.sma50}</p>
            </div>
          );
        })}
      </div>
      {!loading && !rows.length && !err && <p className="text-sm text-slate-500">Add stocks to your watchlist or holdings to see trends.</p>}
    </div>
  );
}
