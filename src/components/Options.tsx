import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchOptions, fetchTrendSeries } from '../lib/api';
import { analyze } from '../lib/trend';
import { resolveRules } from '../lib/strictness';
import { useInsights } from '../lib/useInsights';
import { LevelBadge } from './Strictness';
import { Empty, Skeleton } from './ui';
import { OPT_RULES, STRATEGY, cashPut, coveredCall, custom, daysTo, mid, payoff, ticket, type Chain, type OptionIdea, type Strategy } from '../lib/options';

/** 🎯 Options helper: ideas to SELL covered calls / cash-secured puts. The app never places the order: you do, in Fidelity. */

const $ = (n: number) => `$${Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const niceDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Profit or loss on the expiry date, for stock prices from −30% to +30% (also drawn in the Guide). */
export function PayoffChart({ idea }: { idea: OptionIdea }) {
  const pts = payoff(idea);
  const W = 320, H = 120, pad = 6;
  const min = Math.min(...pts.map((p) => p.pl), 0), max = Math.max(...pts.map((p) => p.pl), 0);
  const x = (s: number) => pad + ((s - pts[0].s) / (pts[pts.length - 1].s - pts[0].s)) * (W - pad * 2);
  const y = (v: number) => pad + ((max - v) / (max - min || 1)) * (H - pad * 2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)},${y(p.pl).toFixed(1)}`).join(' ');
  const zero = y(0);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label={`Profit or loss on ${idea.q.expiry}: most ${$(max)}, least ${$(min)}`}>
        <defs>
          <clipPath id={`up-${idea.symbol}${idea.strategy}`}><rect x="0" y="0" width={W} height={zero} /></clipPath>
          <clipPath id={`dn-${idea.symbol}${idea.strategy}`}><rect x="0" y={zero} width={W} height={H - zero} /></clipPath>
        </defs>
        <line x1={pad} x2={W - pad} y1={zero} y2={zero} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
        <line x1={x(idea.price)} x2={x(idea.price)} y1={pad} y2={H - pad} stroke="rgba(255,255,255,0.25)" />
        <line x1={x(idea.q.strike)} x2={x(idea.q.strike)} y1={pad} y2={H - pad} stroke="rgba(167,139,250,0.6)" strokeDasharray="2 3" />
        <path d={line} fill="none" stroke="#34d399" strokeWidth="2.5" clipPath={`url(#up-${idea.symbol}${idea.strategy})`} />
        <path d={line} fill="none" stroke="#f87171" strokeWidth="2.5" clipPath={`url(#dn-${idea.symbol}${idea.strategy})`} />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-slate-500">
        <span>{$(pts[0].s)}</span><span>today {$(idea.price)} · <span className="text-violet-300">strike {$(idea.q.strike)}</span></span><span>{$(pts[pts.length - 1].s)}</span>
      </figcaption>
    </figure>
  );
}

/** One idea: what to sell, what you get, the chance it happens, what happens then, and the order to type in Fidelity. */
export function OptionCard({ idea, example = false }: { idea: OptionIdea; example?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const s = STRATEGY[idea.strategy];
  const t = ticket(idea);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${t.line}\n\n${t.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return (
    <article className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden="true">{s.icon}</span>
        <p className="font-display text-lg font-semibold">{idea.symbol}</p>
        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-slate-200">{s.name}</span>
        {idea.estimate ? <span className="rounded-full border border-amber-300/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-100">estimate</span> : <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">prices ~15 min old</span>}
      </div>
      <p className="text-[15px]">
        Sell <b>{idea.contracts}</b> {idea.symbol} <b>{niceDate(idea.q.expiry)} ${idea.q.strike} {idea.strategy === 'call' ? 'call' : 'put'}{idea.contracts > 1 ? 's' : ''}</b> for about <b className="num">{$(idea.premium)}</b> each → you get <b className="num text-emerald-300">{$(idea.income)}</b> now.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel"><p className="label">Income</p><p className="num text-lg font-semibold text-emerald-300">{$(idea.income)}</p><p className="text-[11px] text-slate-400">{idea.yieldPct}% · {idea.yearPct}%/yr</p></div>
        <div className="panel"><p className="label">{idea.strategy === 'call' ? 'Chance sold' : 'Chance you buy'}</p><p className="num text-lg font-semibold">{pct(idea.chance)}</p><p className="text-[11px] text-slate-400">by {niceDate(idea.q.expiry)}</p></div>
        <div className="panel"><p className="label">{idea.strategy === 'call' ? 'Protects down to' : 'You’d really pay'}</p><p className="num text-lg font-semibold">{$(idea.breakeven)}</p><p className="text-[11px] text-slate-400">{idea.strategy === 'call' ? 'break-even' : 'per share'}</p></div>
        <div className="panel"><p className="label">{idea.strategy === 'call' ? 'Shares used' : 'Cash kept aside'}</p><p className="num text-lg font-semibold">{idea.strategy === 'call' ? (idea.contracts * 100).toLocaleString() : $(idea.cash ?? 0)}</p><p className="text-[11px] text-slate-400">{idea.days} days</p></div>
      </div>
      <p className="text-sm text-slate-300">{idea.outcome}</p>
      {idea.notes.map((n) => <p key={n} className="text-xs text-amber-200">⚠ {n}</p>)}
      <PayoffChart idea={idea} />
      <div className="panel space-y-2">
        <p className="label">Order to type in Fidelity (the app never sends it)</p>
        <p className="num break-words text-sm font-semibold text-cyan-100">{t.line}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={example ? undefined : () => void copy()} tabIndex={example ? -1 : 0}>{copied ? '✓ Copied' : 'Copy order'}</button>
          <button className="btn" onClick={example ? undefined : () => setOpen((o) => !o)} aria-expanded={open} tabIndex={example ? -1 : 0}>How to place it</button>
        </div>
        {open && <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">{t.steps.map((x) => <li key={x}>{x}</li>)}</ol>}
      </div>
    </article>
  );
}

const chains = new Map<string, { at: number; c: Chain }>();
async function chainOf(symbol: string): Promise<Chain> {
  const hit = chains.get(symbol);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.c;
  const c = await fetchOptions(symbol);
  chains.set(symbol, { at: Date.now(), c });
  return c;
}

export function OptionsView({ goTo }: { goTo?: (tab: 'Settings') => void }) {
  const { settings, watchlist } = useStore();
  const mk = useInsights([]);
  const level = resolveRules(settings, mk?.market);
  const preset = level.preset === 'custom' ? 'balanced' : level.preset;
  const r = OPT_RULES[preset];
  const owned = settings.holdings.filter((h) => h.shares >= 100);
  const [calls, setCalls] = useState<(OptionIdea | { symbol: string; skip: string })[] | null>(null);
  const [puts, setPuts] = useState<(OptionIdea | { symbol: string; skip: string })[] | null>(null);
  const [err, setErr] = useState('');

  // 📞 covered calls on stocks you own (100+ shares)
  useEffect(() => {
    let alive = true;
    setCalls(null);
    (async () => {
      const out: (OptionIdea | { symbol: string; skip: string })[] = [];
      for (const h of owned.slice(0, 8)) {
        try { const x = coveredCall(h, await chainOf(h.symbol), preset); out.push('skip' in x ? { symbol: h.symbol, skip: x.skip } : x); }
        catch (e) { out.push({ symbol: h.symbol, skip: e instanceof Error ? e.message : String(e) }); }
        if (alive) setCalls([...out]);
      }
      if (alive) setCalls(out);
    })();
    return () => { alive = false; };
  }, [preset, owned.map((h) => `${h.symbol}:${h.shares}:${h.avgCost}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // 💵 cash-secured puts on stocks you'd like to own: your watchlist (and stocks you own), only ones not in a downtrend
  const wanted = useMemo(() => [...new Set([...watchlist, ...settings.holdings.map((h) => h.symbol)])].slice(0, 12), [watchlist, settings.holdings]);
  useEffect(() => {
    let alive = true;
    setPuts(null);
    setErr('');
    (async () => {
      try {
        const t = await fetchTrendSeries(wanted);
        const good = wanted.map((s) => (t.series[s] ? analyze(s, t.series[s].closes) : null))
          .filter((a): a is NonNullable<typeof a> => !!a && a.label !== 'Downtrend' && a.score >= (preset === 'careful' ? 4 : 3))
          .sort((a, b) => b.score - a.score).slice(0, 5);
        const out: (OptionIdea | { symbol: string; skip: string })[] = [];
        for (const a of good) {
          try { const x = cashPut(await chainOf(a.symbol), preset, settings.cash); out.push('skip' in x ? { symbol: a.symbol, skip: x.skip } : x); }
          catch (e) { out.push({ symbol: a.symbol, skip: e instanceof Error ? e.message : String(e) }); }
          if (alive) setPuts([...out]);
        }
        if (alive) setPuts(out);
      } catch (e) { if (alive) { setErr(e instanceof Error ? e.message : String(e)); setPuts([]); } }
    })();
    return () => { alive = false; };
  }, [preset, wanted.join(','), settings.cash]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (xs: (OptionIdea | { symbol: string; skip: string })[] | null, empty: string) => xs === null ? <Skeleton className="h-40" /> : xs.length ? (
    <div className="grid gap-3 lg:grid-cols-2">
      {xs.map((x) => 'skip' in x ? <p key={x.symbol} className="panel text-sm text-slate-400"><b className="text-slate-200">{x.symbol}</b>: {x.skip}</p> : <OptionCard key={`${x.symbol}${x.strategy}`} idea={x} />)}
    </div>
  ) : <p className="panel text-sm text-slate-400">{empty}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold">Options: extra income</h2><LevelBadge r={level} onClick={() => goTo?.('Settings')} /></div>
          <p className="text-sm text-slate-400">Selling options only on what you already have (shares or cash). Chance ≈ {pct(r.delta)}, {r.minDays}–{r.maxDays} days{r.earnings === 'avoid' ? ', ending before earnings' : ''}.</p>
        </div>
      </div>
      <p className="card !border-amber-300/30 text-sm text-amber-100">
        The app never places orders. Options need <b>options approval</b> in Fidelity (a short form; covered calls and cash-covered puts are the lowest level). You can lose money: if a stock falls a lot, the premium only softens it. Check the price in Fidelity before you trade.
      </p>
      {err && <p className="card !border-amber-300/40 text-sm text-amber-100">{err}</p>}

      <section className="space-y-2">
        <p className="label">📞 Covered calls on what you own</p>
        <p className="text-sm text-slate-400">{STRATEGY.call.short} Needs 100 shares per contract; never a price below what you paid.</p>
        {owned.length ? list(calls, 'Nothing yet.') : <Empty title="No stock with 100+ shares">Covered calls need at least 100 shares of one stock. Import your Fidelity positions in Settings.</Empty>}
      </section>

      <section className="space-y-2">
        <p className="label">💵 Buy cheaper: cash-secured puts</p>
        <p className="text-sm text-slate-400">{STRATEGY.put.short} Only stocks from your watchlist that are not falling.{settings.cash === undefined ? ' Set your cash in Settings for the right size.' : ' Each idea is sized to all your cash: pick one, or fewer contracts each.'}</p>
        {wanted.length ? list(puts, 'None of your watchlist stocks is in a good enough trend right now.') : <Empty title="Your watchlist is empty">Add stocks you’d like to own on Today.</Empty>}
      </section>

      <TryAny />
    </div>
  );
}

/** 🔎 Any symbol, any date, any strike: the same numbers and order ticket. */
function TryAny() {
  const { settings } = useStore();
  const [sym, setSym] = useState('');
  const [chain, setChain] = useState<Chain | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('put');
  const [expiry, setExpiry] = useState('');
  const [strike, setStrike] = useState<number | null>(null);
  const [n, setN] = useState(1);
  const load = async () => {
    const s = sym.trim().toUpperCase();
    if (!/^[A-Z.\-]{1,8}$/.test(s)) return;
    setBusy(true); setErr(''); setChain(null);
    try { const c = await chainOf(s); setChain(c); setExpiry(''); setStrike(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const type = strategy === 'call' ? 'C' : 'P';
  const expiries = chain ? [...new Set(chain.options.filter((o) => o.type === type).map((o) => o.expiry))].sort() : [];
  const exp = expiry || expiries[Math.min(2, expiries.length - 1)] || '';
  const strikes = chain ? chain.options.filter((o) => o.type === type && o.expiry === exp && o.bid > 0) : [];
  const near = strikes.length ? strikes.reduce((a, b) => (Math.abs(b.strike - chain!.price * (type === 'C' ? 1.05 : 0.95)) < Math.abs(a.strike - chain!.price * (type === 'C' ? 1.05 : 0.95)) ? b : a)) : null;
  const q = strikes.find((o) => o.strike === strike) ?? near;
  const h = chain ? settings.holdings.find((x) => x.symbol === chain.symbol) : undefined;
  const maxCalls = h ? Math.floor(h.shares / 100) : 0;
  const idea = chain && q ? custom(strategy, chain, q, Math.max(1, strategy === 'call' ? Math.min(n, maxCalls || 1) : n), h?.avgCost) : null;
  return (
    <section className="card space-y-3">
      <p className="label">🔎 Try any option</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input className="input min-w-0 flex-1" placeholder="Symbol, e.g. AAPL" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} aria-label="Symbol" autoCapitalize="characters" />
        <button className="btn" disabled={busy || !sym.trim()}>{busy ? <span className="spinner" /> : 'Load'}</button>
      </form>
      {err && <p className="text-sm text-amber-200">{err}</p>}
      {chain && (
        <>
          <p className="text-xs text-slate-400">{chain.symbol} {$(chain.price)} · {chain.source === 'estimate' ? 'estimated prices' : 'delayed prices'}{chain.earnings ? ` · earnings ${chain.earnings}` : ''}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-slate-400">Kind
              <select className="input mt-1 w-full" value={strategy} onChange={(e) => { setStrategy(e.target.value as Strategy); setStrike(null); }}>
                <option value="put">💵 Sell a put (cash)</option><option value="call">📞 Sell a call (shares)</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">Date
              <select className="input mt-1 w-full" value={exp} onChange={(e) => { setExpiry(e.target.value); setStrike(null); }}>
                {expiries.map((e) => <option key={e} value={e}>{niceDate(e)} ({daysTo(e)} d)</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Strike
              <select className="input mt-1 w-full" value={q?.strike ?? ''} onChange={(e) => setStrike(Number(e.target.value))}>
                {strikes.map((o) => <option key={o.strike} value={o.strike}>${o.strike} · {$(mid(o))}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">Contracts
              <input className="input mt-1 w-full" type="number" min={1} max={strategy === 'call' ? Math.max(1, maxCalls) : 20} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          </div>
          {strategy === 'call' && !maxCalls && <p className="text-xs text-amber-200">⚠ You don’t have 100 shares of {chain.symbol}: selling a call without them is not allowed here (it’s unlimited risk).</p>}
          {idea && (strategy === 'put' || maxCalls > 0) && <OptionCard idea={idea} />}
        </>
      )}
    </section>
  );
}
