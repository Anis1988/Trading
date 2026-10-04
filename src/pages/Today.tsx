import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { SignalCard } from '../components/SignalCard';
import { useTrends } from '../lib/useTrends';
import { ActionChip, Change, Empty, Skeleton, Sparkline, fmtMoney } from '../components/ui';
import { getAlertStatus, type AlertStatus } from '../lib/alerts';
import { useInsights } from '../lib/useInsights';
import { EarningsBadge, InsightLines, MarketCard } from '../components/Insight';
import { concentrated } from '../lib/concentration';
import { getAccessToken } from '../lib/api';

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export function Today({ goTo }: { goTo: (tab: 'Settings' | 'Ideas') => void }) {
  const { settings, signals, headlines, resume, watchlist } = useStore();
  const [status, setStatus] = useState<AlertStatus | null>(null);
  useEffect(() => {
    if (getAccessToken()) getAlertStatus().then(setStatus).catch(() => undefined);
  }, []);
  const [openSym, setOpenSym] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const held = settings.holdings;
  const { rows, dates, loading, err } = useTrends(held.map((h) => h.symbol), settings);
  const ins = useInsights(held.map((h) => h.symbol));

  // Portfolio totals in dollars (only holdings that have a price).
  const priced = held.map((h) => ({ h, r: rows.find((x) => x.symbol === h.symbol) })).filter((x) => x.r);
  const tot = priced.reduce(
    (t, { h, r }) => ({ value: t.value + h.shares * r!.price, cost: t.cost + h.shares * h.avgCost, day: t.day + h.shares * (r!.price - r!.prevClose) }),
    { value: 0, cost: 0, day: 0 },
  );
  const pl = tot.value - tot.cost;
  const plPct = tot.cost > 0 ? (pl / tot.cost) * 100 : 0;
  const dayPct = tot.value - tot.day > 0 ? (tot.day / (tot.value - tot.day)) * 100 : 0;
  // Portfolio value over time = sum of shares x close, aligned on the most recent days.
  const n = priced.length ? Math.min(...priced.map(({ r }) => r!.closes.length)) : 0;
  const portfolio = n > 1 ? Array.from({ length: n }, (_, i) => priced.reduce((t, { h, r }) => t + h.shares * r!.closes[r!.closes.length - n + i], 0)) : [];

  const alloc = priced
    .map(({ h, r }) => ({ sym: h.symbol, value: h.shares * r!.price }))
    .sort((a, b) => b.value - a.value);
  const heavy = concentrated(alloc);
  const mine = new Set([...held.map((h) => h.symbol), ...watchlist]);
  const news = headlines.filter((x) => x.symbol && mine.has(x.symbol)).slice(0, 10);

  const attention = signals.filter((s) => s.status === 'new' && s.review?.verdict !== 'REJECT');
  const earlier = signals.filter((s) => !attention.includes(s)).slice(0, 30);

  if (!held.length && !attention.length) {
    return (
      <Empty title="Tell me what you own" action={<button className="btn-primary mt-2" onClick={() => goTo('Settings')}>Add my holdings</button>}>
        Add your stocks (symbol, shares, average price). I will watch them and tell you plainly when to buy, sell or hold.
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      {settings.stopped && (
        <div className="card flex items-center justify-between gap-3 !border-red-400/40 !bg-red-500/10">
          <span className="text-sm">Alerts are stopped: no news checking and no auto-email.</span>
          <button className="btn-primary" onClick={resume}>Resume</button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)_320px] xl:items-start">
      {/* left rail: money */}
      <aside className="space-y-4 xl:sticky xl:top-20">
      {heavy.length > 0 && (
        <section className="card space-y-1 !border-amber-300/40 !bg-amber-400/10 text-sm">
          <p className="label !text-amber-200">Too much in one stock</p>
          {heavy.map((h) => (
            <p key={h.sym}><b className="font-display">{h.sym}</b> is <span className="num">{h.pct.toFixed(0)}%</span> of your money. Avoid adding more; a single bad day there hurts a lot.</p>
          ))}
        </section>
      )}
      {held.length > 0 && (
        <section className="card overflow-hidden">
          {priced.length ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr] sm:items-end xl:grid-cols-1">
              <div>
                <p className="label">Total profit / loss</p>
                <p className={`num mt-1 text-4xl font-semibold sm:text-5xl ${pl >= 0 ? 'text-emerald-300 glow-up' : 'text-red-300 glow-down'}`}>
                  {pl >= 0 ? '+' : '−'}{fmtMoney(pl)}
                </p>
                <p className="mt-1 text-sm"><Change pct={plPct} /> <span className="muted">on what you paid</span></p>
                <p className="mt-2 text-sm"><span className="muted">Today </span><Change value={tot.day} pct={dayPct} /></p>
                <p className="mt-2 text-xs text-slate-500">
                  Worth <span className="num">{fmtMoney(tot.value)}</span> · paid <span className="num">{fmtMoney(tot.cost)}</span>
                  {priced.length < held.length ? ` · ${held.length - priced.length} without a price yet` : ''}
                </p>
              </div>
              {portfolio.length > 1 && <Sparkline values={portfolio.map((v) => Math.round(v * 100) / 100)} height={96} interactive label="Your portfolio value, last 6 months" />}
            </div>
          ) : loading ? (
            <div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-12 w-48" /><Skeleton className="h-4 w-40" /></div>
          ) : (
            <p className="text-sm text-slate-400">{err || 'Your profit / loss shows here once prices load.'}</p>
          )}
        </section>
      )}
      {alloc.length > 1 && (
        <section className="card hidden space-y-2 md:block">
          <p className="label">Where your money is</p>
          {alloc.map((a) => {
            const pct = (a.value / tot.value) * 100;
            return (
              <div key={a.sym}>
                <div className="flex justify-between text-sm"><span className="font-display font-semibold">{a.sym}</span><span className="num text-slate-300">{pct.toFixed(0)}% · {fmtMoney(a.value)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </section>
      )}
      {ins?.market && <MarketCard m={ins.market} />}
      </aside>

      {/* centre: what to do */}
      <div className="min-w-0 space-y-5">

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{attention.length ? 'Action needed' : 'Nothing needs you right now'}</h2>
          {attention.length > 0 && <span className="num text-sm text-cyan-300">{attention.length}</span>}
        </div>
        <div className="space-y-3">
          {attention.map((s) => <SignalCard key={s.id} s={s} />)}
          {!attention.length && (
            <p className="text-sm text-slate-400">
              I check the news every few minutes and tell you here. Want new ideas? <button className="btn-ghost !px-1" onClick={() => goTo('Ideas')}>See what to buy</button>
            </p>
          )}
        </div>
      </section>

      {held.length > 0 ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold">My stocks</h2>
          {err && priced.length > 0 && <p className="mb-2 text-sm text-amber-200">{err}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {held.map((h) => {
              const a = rows.find((r) => r.symbol === h.symbol);
              const open = openSym === h.symbol;
              const news = headlines.filter((x) => x.symbol === h.symbol).slice(0, 3);
              if (!a) return <div key={h.symbol} className="card"><p className="font-display font-semibold">{h.symbol}</p>{loading ? <Skeleton className="mt-2 h-10" /> : <p className="text-sm text-slate-500">No price yet.</p>}</div>;
              const gain = (a.price - h.avgCost) * h.shares;
              const gainPct = h.avgCost > 0 ? ((a.price - h.avgCost) / h.avgCost) * 100 : 0;
              return (
                <div key={h.symbol} className="card !p-0">
                  <button className="w-full p-4 text-left" aria-expanded={open} onClick={() => setOpenSym(open ? null : h.symbol)}>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xl font-semibold">{h.symbol}</span>
                      {a.action && <ActionChip action={a.action} size="sm" />}
                      <EarningsBadge e={ins?.stocks[h.symbol]?.earnings} />
                      <span className="num ml-auto text-lg">${a.price}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="muted num">{h.shares} sh · paid ${h.avgCost}</span>
                      <span>
                        <Change value={gain} pct={gainPct} />
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{a.idea}</p>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3">
                      <Sparkline values={a.closes} dates={dates[h.symbol]} height={88} interactive label={`${h.symbol} price, last 6 months`} />
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="panel !p-2"><p className="label !text-[10px]">Today</p><Change value={(a.price - a.prevClose) * h.shares} className="text-xs" /></div>
                        <div className="panel !p-2"><p className="label !text-[10px]">1 month</p><Change pct={a.ret1m} className="text-xs" /></div>
                        <div className="panel !p-2"><p className="label !text-[10px]">3 months</p><Change pct={a.ret3m} className="text-xs" /></div>
                      </div>
                      <InsightLines i={ins?.stocks[h.symbol]} />
                      <p className="text-xs text-slate-500">Trend: {a.label.toLowerCase()} · {Math.abs(a.fromHigh)}% below its 6-month high · score {a.score}/5</p>
                      {news.length > 0 && (
                        <ul className="space-y-1 text-sm">
                          {news.map((x) => <li key={x.id}><a className="text-slate-300 hover:text-cyan-200 hover:underline" href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a></li>)}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <button className="btn mx-auto flex" onClick={() => goTo('Settings')}>Add my holdings for personal advice</button>
      )}

      </div>

      {/* right rail: context */}
      <aside className="space-y-4 xl:sticky xl:top-20">
        {status && (
          <section className="card space-y-1.5 text-sm">
            <p className="label">Background alerts</p>
            <p className="text-slate-300">{settings.serverAlerts ? (status.lastRun ? `On · last check ${ago(status.lastRun)} ago` : 'On · waiting for the first check') : 'Off (Settings → Alerts)'}</p>
            {status.ai && (
              <div>
                <div className="flex justify-between text-xs text-slate-400"><span>AI checks today</span><span className="num">{status.ai.used} / {status.ai.limit}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${status.ai.used >= status.ai.limit ? 'bg-red-400' : 'bg-cyan-400'}`} style={{ width: `${Math.min(100, (status.ai.used / Math.max(1, status.ai.limit)) * 100)}%` }} /></div>
              </div>
            )}
          </section>
        )}
        <section className="card space-y-2">
          <p className="label">News on your stocks</p>
          {news.length ? (
            <ul className="space-y-2.5">
              {news.map((n) => (
                <li key={n.id} className="text-sm leading-snug">
                  <span className="mr-1.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-200">{n.symbol}</span>
                  <a className="text-slate-300 hover:text-cyan-200 hover:underline" href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a>
                  <span className="ml-1 text-xs text-slate-500">{ago(n.publishedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Headlines show up here after the next news check.</p>
          )}
        </section>
      </aside>
      </div>

      {earlier.length > 0 && (
        <section>
          <button className="btn-ghost !px-0 text-xs" onClick={() => setShowEarlier((v) => !v)}>{showEarlier ? 'Hide' : 'Show'} earlier signals ({earlier.length})</button>
          {showEarlier && <div className="mt-2 space-y-3">{earlier.map((s) => <SignalCard key={s.id} s={s} compact />)}</div>}
        </section>
      )}

      <p className="pt-2 text-center text-[11px] text-slate-600">Not a broker: this app never places trades. You place every order yourself in Fidelity. Not financial advice.</p>
    </div>
  );
}
