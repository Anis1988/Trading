import { useState } from 'react';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { simulate, type PriceSeries, type SimMonths, type SimResult } from '../lib/whatif';
import { LEVEL, type Level } from '../lib/strictness';
import { stopSettings } from '../lib/stopWatch';
import { Seg, Skeleton } from '../components/ui';
import { SimLimits, WhatIfReport, WhatIfRow } from '../components/WhatIf';

const ALL = '★ All';
const LEVELS: Level[] = ['careful', 'balanced', 'risky', 'custom', 'auto'];

// 2 years of daily closes per symbol, kept for this visit (the same free Yahoo prices as the rest of the app).
const cache = new Map<string, { at: number; s: PriceSeries }>();
async function loadSeries(symbols: string[]): Promise<{ series: Record<string, PriceSeries>; errors: string[] }> {
  const need = symbols.filter((s) => !(Date.now() - (cache.get(s)?.at ?? 0) < 30 * 60_000));
  const errors: string[] = [];
  for (let i = 0; i < need.length; i += 25) {
    const r = await fetchTrendSeries(need.slice(i, i + 25), '2y');
    for (const [k, v] of Object.entries(r.series)) if (v.dates?.length === v.closes.length) cache.set(k, { at: Date.now(), s: { dates: v.dates, closes: v.closes } });
    errors.push(...r.errors);
  }
  return { series: Object.fromEntries(symbols.filter((s) => cache.has(s)).map((s) => [s, cache.get(s)!.s])), errors };
}

/** 🔮 What if: replays the app's own BUY / SELL rules on past prices. A simulation: never advice, never an order. */
export function WhatIf() {
  const { settings, watchlist } = useStore();
  const mine = [...new Set([...settings.holdings.map((h) => h.symbol), ...watchlist])].slice(0, 24);
  const [pick, setPick] = useState<string>(mine[0] ?? '');
  const [typed, setTyped] = useState('');
  const [months, setMonths] = useState<SimMonths>(6);
  const [amount, setAmount] = useState('10000');
  const [level, setLevel] = useState<Level>(settings.strictness ?? 'balanced');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [results, setResults] = useState<SimResult[] | null>(null);
  const [openSym, setOpenSym] = useState<string | null>(null);

  const typedSym = typed.trim().toUpperCase();
  const typedOk = /^[A-Z.\-]{1,8}$/.test(typedSym);
  const symbols = typedOk ? [typedSym] : pick === ALL ? mine : pick ? [pick] : [];
  const money = Number(amount.replace(/[$,\s]/g, ''));
  const moneyOk = money >= 100 && money <= 100_000_000;

  const run = async () => {
    if (!symbols.length || !moneyOk) return;
    setBusy(true);
    setErr('');
    try {
      const { series, errors } = await loadSeries([...symbols, 'SPY']);
      const out = symbols.flatMap((s) => {
        if (!series[s]) return [];
        const r = simulate({ symbol: s, series: series[s], spy: series.SPY, months, amount: money, level, customRules: settings.customRules, stop: stopSettings(settings) });
        return r ? [r] : [];
      });
      setResults(out);
      setOpenSym(out.length === 1 ? out[0].symbol : null);
      const missing = symbols.filter((s) => !out.some((r) => r.symbol === s));
      if (missing.length) setErr(`Not enough price history for ${missing.join(', ')}.${errors.length ? ` (${errors.slice(0, 2).join(' · ')})` : ''}`);
      else if (!series.SPY) setErr('The S&P 500 prices did not load, so the falling-market rule and the S&P 500 comparison are left out.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sorted = results ? [...results].sort((a, b) => b.ret - a.ret) : [];
  const beat = sorted.filter((r) => r.ret > r.hold.ret).length;
  const opened = sorted.find((r) => r.symbol === openSym);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">What if</h2>
        <p className="text-sm text-slate-400">If you had followed every BUY and SELL the app gave, what would your money be now?</p>
        <p className="mt-2 inline-flex rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">Simulation on past prices · not advice · never places orders</p>
      </div>

      <section className="card space-y-3">
        <div>
          <p className="label mb-1.5">Which stock</p>
          <div className="flex flex-wrap gap-1.5">
            {mine.length > 1 && <Chip on={!typedOk && pick === ALL} onClick={() => { setPick(ALL); setTyped(''); }}>{`${ALL} (${mine.length})`}</Chip>}
            {mine.map((s) => <Chip key={s} on={!typedOk && pick === s} onClick={() => { setPick(s); setTyped(''); }}>{s}</Chip>)}
          </div>
          <input className="input mt-2 w-full uppercase sm:w-56" placeholder="Or type a symbol, e.g. COST" value={typed} maxLength={8} onChange={(e) => setTyped(e.target.value)} aria-label="Type a symbol" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="label mb-1.5">How far back</p>
            <Seg label="How far back" value={String(months) as '3' | '6' | '12'} onChange={(v) => setMonths(Number(v) as SimMonths)} options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months']] as const} />
          </div>
          <div>
            <p className="label mb-1.5">Starting amount</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input className="input num w-full !pl-6" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Starting amount in dollars" />
            </div>
            {!moneyOk && <p className="mt-1 text-xs text-amber-200">Type an amount of $100 or more.</p>}
          </div>
        </div>
        <div>
          <p className="label mb-1.5">How careful (your level is picked)</p>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => <Chip key={l} on={level === l} onClick={() => setLevel(l)}>{`${LEVEL[l].icon} ${LEVEL[l].name}${l === (settings.strictness ?? 'balanced') ? ' · yours' : ''}`}</Chip>)}
          </div>
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={busy || !symbols.length || !moneyOk} onClick={() => void run()}>
          {busy ? <><span className="spinner" /> Replaying {symbols.length > 1 ? `${symbols.length} stocks` : symbols[0]}…</> : symbols.length ? `Run the test${symbols.length > 1 ? ` on ${symbols.length} stocks` : ` on ${symbols[0]}`}` : 'Pick a stock'}
        </button>
        {!mine.length && <p className="text-xs text-slate-500">Add holdings or a watchlist in Settings to pick from them here, or type any symbol.</p>}
      </section>

      {err && <p className="text-sm text-amber-200">{err}</p>}
      {busy && !results && <div className="card space-y-2"><Skeleton className="h-5 w-56" /><Skeleton className="h-16" /><Skeleton className="h-36" /></div>}

      {results && results.length > 1 && (
        <section className="card space-y-2">
          <p className="label">{results.length} stocks · {months} months · {LEVEL[level].icon} {LEVEL[level].name}</p>
          <p className="text-sm text-slate-200">Following the rules beat just holding on <b className="num">{beat} of {results.length}</b>. Tap one for its chart and trades.</p>
          <div className="space-y-2">{sorted.map((r) => <WhatIfRow key={r.symbol} r={r} open={openSym === r.symbol} onOpen={() => setOpenSym(openSym === r.symbol ? null : r.symbol)} />)}</div>
        </section>
      )}
      {opened && (
        <section className="card qt-enter">
          <WhatIfReport key={opened.symbol} r={opened} />
        </section>
      )}
      {results && !results.length && !err && <p className="text-sm text-slate-400">No result: not enough price history.</p>}

      <section className="card space-y-2">
        <p className="label">How it works, honestly</p>
        <p className="text-sm text-slate-300">
          The app goes back day by day over the past prices and, on each day, uses only the prices up to that day (never later ones) with the exact same rule code as the Today tiles: the trend score, “rising too fast”, the falling-market rule, your level (🔄 Auto changes with the market of that day), the share size of your level, and your 🛑 stop-loss watch. It buys when they say BUY, adds when they say BUY on a stock it owns, and sells everything when they say SELL or the stop-loss is reached.
        </p>
        <SimLimits />
        <p className="text-xs text-slate-500">The past is no promise for the future. Free: no AI.</p>
      </section>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`tap min-h-[36px] rounded-xl border px-2.5 text-sm font-medium transition-colors ${on ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-50 shadow-[0_0_14px_-4px_rgba(34,211,238,0.7)]' : 'border-white/10 bg-white/[0.03] text-slate-300'}`}>
      {children}
    </button>
  );
}
