import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { fetchIdeaPicks, fetchScan, mockIdeaPicks, mockScan, type Recommendation } from '../lib/api';
import { ideaToAnalysis, isBuyIdea, reasonsFor, type Idea } from '../lib/picks';
import { computeRisk } from '../lib/risk';
import { ActionChip, Change, Empty, Skeleton, Sparkline, Stat, fmtMoney } from '../components/ui';

let cached: { at: number; live: boolean; data: { ideas: Idea[]; scanned: number; errors: string[] } } | null = null;

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Score ${score} out of 100`}>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${score}%` }} />
      </div>
      <span className="num text-xs text-slate-300">{score}/100</span>
    </div>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-2xl font-semibold">What to buy now</h2>
          <p className="text-sm text-slate-400">
            {data ? `${data.scanned} large US stocks and ETFs scanned` : 'Scanning large US stocks and ETFs'} · ranked by trend, momentum and news{settings.mockMode ? ' · demo prices' : ''}
          </p>
        </div>
        <button className="btn" disabled={loading} onClick={() => void scan(true)}>{loading ? <><span className="spinner" /> Scanning…</> : 'Scan again'}</button>
      </div>

      {err && <p className="card !border-amber-300/40 text-sm text-amber-100">{err}</p>}

      {data && data.scanned > 0 && (
        <section className="card space-y-3 !border-violet-300/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display font-semibold">AI shortlist</p>
            <button className="btn-primary" disabled={recLoading} onClick={() => void askAi()}>
              {recLoading ? <><span className="spinner" /> Thinking…</> : rec ? 'Ask again' : '✨ Ask the AI'}
            </button>
          </div>
          {!rec && !recLoading && <p className="text-sm text-slate-400">The AI looks at the whole scan and your holdings and names its best few, in plain words. A few cents per tap.</p>}
          {rec && (
            <div className="space-y-2 text-sm">
              <p className="text-slate-300">{rec.summary}{rec.simulated ? ' (demo)' : ''}</p>
              {rec.picks.length === 0 && <p className="text-slate-400">Nothing worth buying right now, according to the AI.</p>}
              {rec.picks.map((p) => (
                <div key={p.symbol + p.action} className="panel flex items-start gap-3 !p-2.5">
                  <ActionChip action={p.action} size="sm" />
                  <p><b className="font-display">{p.symbol}</b> <span className="text-slate-300">{p.reason}</span></p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {loading && !data && <div className="space-y-3"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>}

      {data && data.scanned > 0 && buys.length === 0 && (
        <Empty title="Nothing looks good enough right now">Waiting is also a position. Check back later or tap Scan again.</Empty>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {buys.map((i, rank) => {
          const a = ideaToAnalysis(i);
          const reasons = reasonsFor(a, i.newsNet, i.headline);
          const risk = computeRisk('BUY', i.price, settings.riskPerTrade, settings.stopLossPct);
          const own = settings.holdings.find((h) => h.symbol === i.symbol);
          return (
            <article key={i.symbol} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-sm text-slate-500">#{rank + 1}</span>
                <span className="font-display text-2xl font-semibold">{i.symbol}</span>
                <ActionChip action="BUY" size="sm" />
                {own && <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-200">You own {own.shares}</span>}
                <span className="num ml-auto text-lg">${i.price}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <ScoreBar score={i.score} />
                <span className="text-xs"><Change pct={i.ret3m} /> <span className="muted">3 mo</span></span>
              </div>
              <div className="mt-2"><Sparkline values={i.closes} height={52} label={`${i.symbol} price, last 3 months`} /></div>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-cyan-300">›</span><span>{r}</span></li>)}
              </ul>
              {risk && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat label="Buy near" value={fmtMoney(risk.entry)} />
                  <Stat label="Stop-loss" value={fmtMoney(risk.stop)} tone="down" />
                  <Stat label="Shares to buy" value={risk.suggestedQty} />
                </div>
              )}
              <button
                className="btn-primary mt-3 w-full"
                onClick={() => addIdeaSignal(i.symbol, i.price, `Market scan pick (score ${i.score}/100): ${reasons[0]}`, Math.min(0.95, i.score / 100), i.headline ? { title: i.headline, url: i.headlineUrl ?? '' } : undefined)}
              >
                Check with AI &amp; send to Today
              </button>
            </article>
          );
        })}
      </div>
      <p className="pt-1 text-center text-[11px] text-slate-600">It ranks, it cannot predict: any stock can fall. You decide and place any order yourself in Fidelity.</p>
    </div>
  );
}
