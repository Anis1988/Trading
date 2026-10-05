import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../store';
import { fetchIdeaPicks, fetchScan, type Recommendation, type ScanResult } from '../lib/api';
import { ideaToAnalysis, isBuyIdea, reasonsFor, type Idea } from '../lib/picks';
import { computeRisk, dailyVolPct, stopPctFor } from '../lib/risk';
import { useInsights } from '../lib/useInsights';
import { EarningsBadge, InsightLines, VsMarketLine } from '../components/Insight';
import { vsMarket } from '../lib/relative';
import { BuzzBadge } from '../components/Buzz';
import { buyWait } from '../lib/waitRules';
import { MOOD_LABEL } from '../lib/insightTypes';
import { shareAfterBuy } from '../lib/concentration';
import { ActionChip, Change, Empty, Skeleton, Sparkline, Stat, fmtMoney } from '../components/ui';

const cache = new Map<string, { at: number; data: ScanResult }>();

const PRESETS: [string, number, number][] = [
  ['Any price', 0, 0],
  ['Under $50', 0, 50],
  ['$50–150', 50, 150],
  ['$150–400', 150, 400],
  ['$400+', 400, 0],
];
const RANGE_KEY = 'ta.priceRange';
const loadRange = (): [number, number] => {
  try {
    const r = JSON.parse(localStorage.getItem(RANGE_KEY) ?? '[0,0]');
    return [Number(r[0]) || 0, Number(r[1]) || 0];
  } catch {
    return [0, 0];
  }
};

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
  const { settings, addIdeaSignal, toast, log, logWaits } = useStore();
  const [data, setData] = useState<ScanResult | null>(null);
  const [range, setRange] = useState<[number, number]>(loadRange);
  const [minIn, setMinIn] = useState(range[0] ? String(range[0]) : '');
  const [maxIn, setMaxIn] = useState(range[1] ? String(range[1]) : '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  const applyRange = (min: number, max: number) => {
    if (max && min > max) [min, max] = [max, min];
    setRange([min, max]);
    setMinIn(min ? String(min) : '');
    setMaxIn(max ? String(max) : '');
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify([min, max]));
    } catch {
      /* ignore */
    }
  };

  const scan = useCallback(async (force = false) => {
    const key = `${range[0]}-${range[1]}`;
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < 10 * 60_000) return setData(hit.data);
    setLoading(true);
    setErr('');
    setRec(null);
    try {
      const d = await fetchScan(range[0], range[1]);
      cache.set(key, { at: Date.now(), data: d });
      setData(d);
      if (!d.scanned) setErr(d.errors.length ? `Could not load prices: ${d.errors.join('; ')}` : 'No prices came back.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => void scan(), [scan]);

  const inPrice = (i: Idea) => i.price >= range[0] && (!range[1] || i.price <= range[1]);
  const buys = (data?.ideas ?? []).filter((i) => inPrice(i) && isBuyIdea(ideaToAnalysis(i), i.score)).slice(0, 9);
  const ins = useInsights(buys.map((i) => i.symbol));
  // WAITs shown here go to the scoreboard too, so you can see later if waiting was right.
  const waits = ins
    ? buys.flatMap((i) => {
        const a = ideaToAnalysis(i);
        const w = buyWait({ info: ins.stocks?.[i.symbol], market: ins.market, ret1m: a.ret1m, rsi: a.rsi });
        return w ? [{ symbol: i.symbol, price: i.price, rule: w.rule }] : [];
      })
    : [];
  const waitKey = waits.map((w) => `${w.symbol}:${w.rule}`).join(',');
  useEffect(() => {
    if (waits.length) logWaits(waits);
  }, [waitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const rangeLabel = range[0] || range[1] ? `${range[0] ? `$${range[0]}` : '$0'}–${range[1] ? `$${range[1]}` : 'any'}` : 'any price';

  const askAi = async () => {
    if (!data) return;
    setRecLoading(true);
    try {
      const r = await fetchIdeaPicks(data.ideas, settings.holdings);
      setRec(r);
      log('info', `Idea picks: ${r.picks.map((p) => `${p.action} ${p.symbol}`).join(', ') || 'none'}`);
    } catch (e) {
      toast('error', `AI picks failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRecLoading(false);
    }
  };

  const filters = (
    <section className="card space-y-3">
      <p className="font-display font-semibold">Price per share</p>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([label, lo, hi]) => {
          const on = range[0] === lo && range[1] === hi;
          return (
            <button key={label} onClick={() => applyRange(lo, hi)} aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-xs transition active:scale-95 ${on ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/15 text-slate-300 hover:bg-white/5'}`}>
              {label}
            </button>
          );
        })}
      </div>
      <form className="grid grid-cols-[1fr_1fr_auto] items-center gap-2" onSubmit={(e) => { e.preventDefault(); applyRange(Math.max(0, Number(minIn) || 0), Math.max(0, Number(maxIn) || 0)); }}>
        <input className="input w-full" inputMode="decimal" placeholder="Min $" value={minIn} onChange={(e) => setMinIn(e.target.value)} aria-label="Minimum price" />
        <input className="input w-full" inputMode="decimal" placeholder="Max $" value={maxIn} onChange={(e) => setMaxIn(e.target.value)} aria-label="Maximum price" />
        <button className="btn">Apply</button>
      </form>
      <p className="text-xs text-slate-500">Showing {rangeLabel}{data?.inRange !== undefined ? ` · ${data.inRange} of ${data.scanned} stocks in range` : ''}.</p>
    </section>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-2xl font-semibold">What to buy now</h2>
          <p className="text-sm text-slate-400">
            {data ? `${data.scanned} large US stocks and ETFs scanned` : 'Scanning large US stocks and ETFs'} · ranked by trend, momentum and news
          </p>
        </div>
        <button className="btn" disabled={loading} onClick={() => void scan(true)}>{loading ? <><span className="spinner" /> Scanning…</> : 'Scan again'}</button>
      </div>

      {err && <p className="card !border-amber-300/40 text-sm text-amber-100">{err}</p>}

      {ins?.market?.trend === 'down' && (
        <p className="card !border-red-300/40 !bg-red-500/10 text-sm text-red-100">
          ▼ The overall market is falling. Buying now is riskier: most buys fail in a falling market, so the AI check will say WAIT until it turns.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[340px_1fr] xl:items-start">
      <aside className="space-y-4 xl:sticky xl:top-20">
      {filters}
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
              <p className="text-slate-300">{rec.summary}</p>
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

      </aside>

      <div className="space-y-4">
      {loading && <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"><Skeleton className="h-72" /><Skeleton className="h-72" /><Skeleton className="h-72" /></div>}

      {data && data.scanned > 0 && buys.length === 0 && (
        <Empty title={range[0] || range[1] ? `Nothing good in ${rangeLabel} right now` : 'Nothing looks good enough right now'}>
          {range[0] || range[1] ? 'Try a wider price range, or check back later.' : 'Waiting is also a position. Check back later or tap Scan again.'}
        </Empty>
      )}

      {!loading && <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {buys.map((i, rank) => {
          const a = ideaToAnalysis(i);
          const reasons = reasonsFor(a, i.newsNet, i.headline);
          const stopPct = stopPctFor(dailyVolPct(i.closes), settings.stopLossPct, settings.smartStop);
          const risk = computeRisk('BUY', i.price, settings.riskPerTrade, stopPct);
          const info = ins?.stocks[i.symbol];
          const share = risk ? shareAfterBuy(i.symbol, risk.suggestedQty, i.price, settings.holdings, settings.cash) : null;
          const own = settings.holdings.find((h) => h.symbol === i.symbol);
          const wait = buyWait({ info, market: ins?.market, ret1m: a.ret1m, rsi: a.rsi });
          return (
            <article key={i.symbol} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-sm text-slate-500">#{rank + 1}</span>
                <span className="font-display text-2xl font-semibold">{i.symbol}</span>
                <ActionChip action={wait ? 'WAIT' : 'BUY'} size="sm" />
                {own && <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-sky-200">You own {own.shares}</span>}
                <EarningsBadge e={info?.earnings} />
                <BuzzBadge b={info?.buzz} />
                <span className="num ml-auto text-lg">${i.price}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <ScoreBar score={i.score} />
                <span className="text-xs"><Change pct={i.ret3m} /> <span className="muted">3 mo</span></span>
              </div>
              <div className="mt-2"><Sparkline values={i.closes} height={52} label={`${i.symbol} price, last 3 months`} /></div>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-cyan-300">›</span><span>{r}</span></li>)}
                {info?.buzz && (
                  <li className="flex gap-2"><span aria-hidden="true" className="text-cyan-300">›</span>
                    <span>Reddit: {info.buzz.trending ? `suddenly ${info.buzz.ratio}× more talk` : 'a normal amount of talk'}{info.buzz.mood !== 'unknown' ? `, ${info.buzz.moodFrom === 'news' ? `news behind it ${MOOD_LABEL[info.buzz.mood]}` : MOOD_LABEL[info.buzz.mood]}` : ''}{info.buzz.trending && info.buzz.mood === 'negative' ? ' (for a bad reason, careful)' : info.buzz.trending ? ' (hype can reverse)' : ''}.</span>
                  </li>
                )}
              </ul>
              <div className="mt-2 space-y-0.5"><VsMarketLine v={vsMarket(i.symbol, i.ret3m, ins?.market)} always /><InsightLines i={info} /></div>
              {wait && wait.rule !== 'market' && <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">{wait.text}</p>}
              {risk && settings.cash !== undefined && risk.suggestedQty * i.price > settings.cash && <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">{risk.suggestedQty} shares cost about {fmtMoney(risk.suggestedQty * i.price)}, but you have {fmtMoney(settings.cash)} cash. {Math.floor(settings.cash / i.price) > 0 ? `You could buy ${Math.floor(settings.cash / i.price)}.` : 'Not enough cash for one share.'}</p>}
              {share !== null && share > 25 && <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">Buying {risk!.suggestedQty} would make it about {share.toFixed(0)}% of your money. Consider fewer shares.</p>}
              {risk && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat label="Buy near" value={fmtMoney(risk.entry)} />
                  <Stat label={`Stop-loss −${stopPct}%`} value={fmtMoney(risk.stop)} tone="down" />
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
      </div>}
      </div>
      </div>
      <p className="pt-1 text-center text-[11px] text-slate-600">It ranks, it cannot predict: any stock can fall. You decide and place any order yourself in Fidelity.</p>
    </div>
  );
}
