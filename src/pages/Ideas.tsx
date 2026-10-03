import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { fetchIdeaPicks, fetchScan, mockIdeaPicks, mockScan, type Recommendation } from '../lib/api';
import { ideaToAnalysis, isBuyIdea, reasonsFor, strength, type Idea } from '../lib/picks';
import { computeRisk, money } from '../lib/risk';

const STRENGTH_STYLE = { Strong: 'bg-emerald-600', Good: 'bg-emerald-800', Fair: 'bg-slate-600', Weak: 'bg-slate-700' } as const;
const ACTION_STYLE = { BUY: 'bg-emerald-700', SELL: 'bg-red-700', WATCH: 'bg-slate-600' } as const;

let cached: { at: number; live: boolean; data: { ideas: Idea[]; scanned: number; errors: string[] } } | null = null;

function Spark({ closes }: { closes: number[] }) {
  const w = 300;
  const h = 48;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const pts = closes.map((c, i) => `${((i / (closes.length - 1)) * w).toFixed(1)},${(h - 4 - ((c - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none" role="img" aria-label="Price over the last three months">
      <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Ideas() {
  const { settings, addIdeaSignal, toast, log } = useStore();
  const [data, setData] = useState<{ ideas: Idea[]; scanned: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  const scan = useCallback(async (force = false) => {
    const live = !settings.mockMode;
    if (!force && cached && cached.live === live && Date.now() - cached.at < 10 * 60_000) return setData(cached.data);
    setLoading(true);
    setErr('');
    setRec(null);
    try {
      const d = live ? await fetchScan() : mockScan();
      cached = { at: Date.now(), live, data: d };
      setData(d);
      if (live && !d.scanned) setErr(d.errors.length ? `Could not load prices: ${d.errors.join('; ')}` : 'No prices came back.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [settings.mockMode]);

  useEffect(() => void scan(), [scan]);

  const buys = (data?.ideas ?? []).filter((i) => isBuyIdea(ideaToAnalysis(i), i.score)).slice(0, 8);

  const askAi = async () => {
    if (!data) return;
    setRecLoading(true);
    try {
      const r = settings.mockMode ? mockIdeaPicks(data.ideas) : await fetchIdeaPicks(data.ideas, settings.holdings);
      setRec(r);
      log('info', `Idea picks: ${r.picks.map((p) => `${p.action} ${p.symbol}`).join(', ') || 'none'}`);
    } catch (e) {
      toast('error', `AI picks failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-semibold">What to buy now</h2>
        <button className="btn" disabled={loading} onClick={() => void scan(true)}>{loading ? <><span className="spinner" /> Scanning…</> : 'Scan again'}</button>
      </div>
      <p className="text-xs text-slate-500">
        Scans {data ? `${data.scanned} ` : ''}large US stocks and ETFs (not just your list), ranks them by trend, momentum and recent news, and shows only the ones that look healthy and not overheated.
        {settings.mockMode ? ' Demo mode: prices are made up.' : ''} It ranks, it cannot predict: any stock can fall.
      </p>
      {err && <p className="rounded border border-amber-800 bg-amber-950 p-2 text-sm text-amber-200">{err}</p>}

      {data && data.scanned > 0 && (
        <div className="card space-y-2">
          <button className="btn-primary w-full sm:w-auto" disabled={recLoading} onClick={() => void askAi()}>
            {recLoading ? <><span className="spinner" /> Asking the AI…</> : '✨ Ask the AI for its top picks'}
          </button>
          {rec && (
            <div className="space-y-2 text-sm">
              <p className="text-slate-300">{rec.summary}{rec.simulated ? ' (demo)' : ''}</p>
              {rec.picks.length === 0 && <p className="text-slate-400">The AI sees nothing worth buying right now.</p>}
              {rec.picks.map((p) => (
                <div key={p.symbol + p.action} className="flex items-start gap-2">
                  <span className={`mt-0.5 rounded px-2 py-0.5 text-xs font-bold ${ACTION_STYLE[p.action]}`}>{p.action}</span>
                  <span><b>{p.symbol}</b> <span className="text-slate-300">{p.reason}</span></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {data && data.scanned > 0 && buys.length === 0 && (
        <p className="card text-sm text-slate-300">Nothing looks good enough to buy right now. That is a real answer: waiting is also a position.</p>
      )}

      <div className="space-y-3">
        {buys.map((i, rank) => {
          const a = ideaToAnalysis(i);
          const reasons = reasonsFor(a, i.newsNet, i.headline);
          const risk = computeRisk('BUY', i.price, settings.riskPerTrade, settings.stopLossPct);
          const own = settings.holdings.find((h) => h.symbol === i.symbol);
          const st = strength(i.score);
          return (
            <div key={i.symbol} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-500">#{rank + 1}</span>
                <span className="text-xl font-semibold">{i.symbol}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold text-white ${STRENGTH_STYLE[st]}`}>{st} · {i.score}/100</span>
                {own && <span className="rounded bg-sky-900 px-2 py-0.5 text-xs">You own {own.shares}</span>}
                <span className="ml-auto text-lg">${i.price}</span>
              </div>
              <Spark closes={i.closes} />
              <p className="mb-1 mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Why</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-300">
                {reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              {risk && (
                <div className="mt-2 rounded border border-slate-700 bg-slate-950 p-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</p>
                  <p>Buy near <b>{money(risk.entry)}</b> · Stop-loss <b className="text-red-300">{money(risk.stop)}</b> ({settings.stopLossPct}% below)</p>
                  <p>To risk about {money(settings.riskPerTrade)}: <b>{risk.suggestedQty} share{risk.suggestedQty === 1 ? '' : 's'}</b> (cost ≈ {money(risk.suggestedQty * risk.entry)})</p>
                </div>
              )}
              <button
                className="btn-primary mt-3 w-full sm:w-auto"
                onClick={() => addIdeaSignal(i.symbol, i.price, `Market scan pick (score ${i.score}/100): ${reasons[0]}`, Math.min(0.95, i.score / 100), i.headline ? { title: i.headline, url: i.headlineUrl ?? '' } : undefined)}
              >
                Check with AI &amp; send to Today
              </button>
            </div>
          );
        })}
      </div>
      <p className="pt-1 text-center text-[11px] text-slate-600">Ideas only. You decide and place any order yourself in Fidelity. Not financial advice.</p>
    </div>
  );
}
