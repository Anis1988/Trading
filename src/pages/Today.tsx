import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { SignalCard } from '../components/SignalCard';
import { useTrends } from '../lib/useTrends';
import { ActionChip, Change, Empty, Skeleton, Sparkline, fmtMoney } from '../components/ui';
import { getAlertStatus, type AlertStatus } from '../lib/alerts';
import { useInsights } from '../lib/useInsights';
import { EarningsBadge, InsightLines, MarketCard, VsMarketLine } from '../components/Insight';
import { vsMarket } from '../lib/relative';
import { concentrated } from '../lib/concentration';
import { BuzzBadge, BuzzRail, RedditPanel } from '../components/Buzz';
import { PriceAlerts } from '../components/PriceAlerts';
import { buyNotes, buyWait } from '../lib/waitRules';
import { resolveRules } from '../lib/strictness';
import { LevelBadge } from '../components/Strictness';
import { taxInfo, taxText } from '../lib/holdings';
import { getAccessToken } from '../lib/api';
import { stopFor, stopSettings } from '../lib/stopWatch';
import { StopBadge } from '../components/StopWatch';
import { BriefCard } from '../components/MorningBrief';

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export function Today({ goTo }: { goTo: (tab: 'Settings' | 'Ideas') => void }) {
  const { settings, signals, headlines, resume, watchlist, logWaits, history } = useStore();
  // 📥 Trades marked executed since the last Fidelity import: a reminder to re-import (only if you use the import).
  const sinceImport = settings.importedAt ? history.filter((h) => !h.deleted && h.status === 'executed' && (h.executedAt ?? h.createdAt) > settings.importedAt!) : [];
  const [status, setStatus] = useState<AlertStatus | null>(null);
  useEffect(() => {
    if (getAccessToken()) getAlertStatus().then(setStatus).catch(() => undefined);
  }, []);
  // ☀️ Today's morning brief (made by the server before the open); ✕ hides it until tomorrow's.
  const nyToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [hiddenBrief, setHiddenBrief] = useState(() => { try { return localStorage.getItem('briefHidden') ?? ''; } catch { return ''; } });
  const brief = status?.brief && status.brief.day === nyToday && hiddenBrief !== nyToday && settings.morningBrief !== false ? status.brief : null;
  const sw = stopSettings(settings);
  const [openSym, setOpenSym] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const held = settings.holdings;
  const ins = useInsights(held.map((h) => h.symbol));
  // 🎚️ The level in use (Settings → How careful): the same rules on every tile, in Ideas and in the background.
  const level = resolveRules(settings, ins?.market);
  const { rows, dates, loading, err, series } = useTrends(held.map((h) => h.symbol), settings, level.rules);

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
  const cash = settings.cash ?? 0;
  // Cash counts as part of your money, so "too much in one stock" is measured against everything.
  const heavy = concentrated([...alloc, { sym: 'Cash', value: cash }]).filter((x) => x.sym !== 'Cash');
  const allMoney = tot.value + cash;
  // Stocks you own that suddenly get a lot of negative talk on Reddit: a heads-up, not a SELL.
  const worried = held.filter((h) => { const b = ins?.stocks[h.symbol]?.buzz; return b?.trending && b.mood === 'negative'; });
  // Today's WAIT tiles go to the scoreboard (once per stock, day and reason) to check later if waiting was right.
  const waits = ins
    ? held.flatMap((h) => {
        const a = rows.find((r) => r.symbol === h.symbol);
        const w = a?.action === 'BUY' ? buyWait({ info: ins.stocks?.[h.symbol], market: ins.market, ret1m: a.ret1m, rsi: a.rsi, score: a.score }, level.rules) : null;
        return a && w ? [{ symbol: h.symbol, price: a.price, rule: w.rule }] : [];
      })
    : [];
  const waitKey = waits.map((w) => `${w.symbol}:${w.rule}`).join(',');
  useEffect(() => {
    if (waits.length) logWaits(waits, level.preset);
  }, [waitKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {brief && <BriefCard b={brief} onClose={() => { try { localStorage.setItem('briefHidden', nyToday); } catch { /* ignore */ } setHiddenBrief(nyToday); }} />}
      {sinceImport.length > 0 && (
        <section className="card space-y-2 !border-cyan-300/40 !bg-cyan-500/10 text-sm">
          <p className="label !text-cyan-200">📥 Re-import from Fidelity</p>
          <p>You placed {sinceImport.length} trade{sinceImport.length > 1 ? 's' : ''} ({[...new Set(sinceImport.map((h) => h.symbol))].join(', ')}) since your last import. Re-import your positions so the app’s advice uses your real shares.</p>
          <button className="btn !py-1.5 text-xs" onClick={() => goTo('Settings')}>Go to My holdings</button>
        </section>
      )}
      {(status?.backOn ?? []).filter((b) => Date.now() - Date.parse(b.at) < 3 * 86400_000).map((b) => (
        <section key={b.symbol + b.at} className="card space-y-1 !border-emerald-300/40 !bg-emerald-500/10 text-sm">
          <p className="label !text-emerald-200">Back on BUY · {new Date(b.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          <p><b className="font-display">{b.symbol}</b>: {b.text}</p>
        </section>
      ))}
      {worried.map((h) => {
        const b = ins!.stocks[h.symbol]!.buzz!;
        return (
          <section key={h.symbol} className="card space-y-1 !border-red-300/40 !bg-red-500/10 text-sm">
            <p className="label !text-red-200">Heads-up · Reddit</p>
            {b.moodFrom === 'news'
              ? <p>People on Reddit are suddenly talking about <b className="font-display">{h.symbol}</b> ({b.ratio}× normal), and the news behind it is mostly bad.{b.why ? ` Latest: "${b.why}"` : ''}</p>
              : <p>People are worried about <b className="font-display">{h.symbol}</b>: talk is {b.ratio}× normal and {b.neg}% negative.{b.why ? ` Top post: "${b.why}"` : ''}</p>}
            <p className="text-xs text-slate-400">Information only. Tap {h.symbol} under My stocks to read more.</p>
          </section>
        );
      })}
      {heavy.length > 0 && (
        <section className="card space-y-1 !border-amber-300/40 !bg-amber-400/10 text-sm">
          <p className="label !text-amber-200">Too much in one stock</p>
          {heavy.map((h) => (
            <p key={h.sym}><b className="font-display">{h.sym}</b> is <span className="num">{h.pct.toFixed(0)}%</span> of your money. Just so you know: a bad day there hurts more.</p>
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
      {alloc.length + (cash > 0 ? 1 : 0) > 1 && (
        <section className="card hidden space-y-2 md:block">
          <p className="label">Where your money is</p>
          {[...alloc, ...(cash > 0 ? [{ sym: 'Cash', value: cash }] : [])].map((a) => {
            const pct = (a.value / allMoney) * 100;
            return (
              <div key={a.sym}>
                <div className="flex justify-between text-sm"><span className="font-display font-semibold">{a.sym}</span><span className="num text-slate-300">{pct.toFixed(0)}% · {fmtMoney(a.value)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${a.sym === 'Cash' ? 'bg-emerald-400/70' : 'bg-gradient-to-r from-cyan-400 to-violet-500'}`} style={{ width: `${pct}%` }} /></div>
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">My stocks</h2>
            <LevelBadge r={level} onClick={() => goTo('Settings')} />
          </div>
          {err && priced.length > 0 && <p className="mb-2 text-sm text-amber-200">{err}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {held.map((h) => {
              const a = rows.find((r) => r.symbol === h.symbol);
              const open = openSym === h.symbol;
              const news = headlines.filter((x) => x.symbol === h.symbol).slice(0, 3);
              if (!a) return <div key={h.symbol} className="card"><p className="font-display font-semibold">{h.symbol}</p>{loading ? <Skeleton className="mt-2 h-10" /> : <p className="text-sm text-slate-500">No price yet.</p>}</div>;
              const gain = (a.price - h.avgCost) * h.shares;
              const gainPct = h.avgCost > 0 ? ((a.price - h.avgCost) / h.avgCost) * 100 : 0;
              const tax = taxInfo(h);
              const stop = sw.on ? stopFor(h, a.price, sw, series[h.symbol]?.dates, series[h.symbol]?.closes) : null;
              const taxWait = a.action === 'SELL' && tax && !tax.longTerm && tax.daysToLong <= 60 && a.price > h.avgCost;
              const crowd = a.action === 'BUY' ? buyWait({ info: ins?.stocks[h.symbol], market: ins?.market, ret1m: a.ret1m, rsi: a.rsi, score: a.score }, level.rules) : null;
              const notes = a.action === 'BUY' && !crowd ? buyNotes({ info: ins?.stocks[h.symbol], market: ins?.market, ret1m: a.ret1m }, level.rules) : [];
              return (
                <div key={h.symbol} className="card !p-0">
                  <button className="w-full p-4 text-left" aria-expanded={open} onClick={() => setOpenSym(open ? null : h.symbol)}>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xl font-semibold">{h.symbol}</span>
                      {a.action && <ActionChip action={crowd ? 'WAIT' : a.action} size="sm" />}
                      <EarningsBadge e={ins?.stocks[h.symbol]?.earnings} />
                      <BuzzBadge b={ins?.stocks[h.symbol]?.buzz} />
                      <span className="num ml-auto text-lg">${a.price}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="muted num">{h.shares} sh · paid ${h.avgCost}</span>
                      <span>
                        <Change value={gain} pct={gainPct} />
                      </span>
                    </div>
                    {taxWait && <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">Tax tip: in {tax!.daysToLong} days this becomes a long-term gain, usually taxed less. If it isn't falling fast, waiting may save you money.</p>}
                    <div className="mt-1.5"><VsMarketLine v={vsMarket(h.symbol, a.ret3m, ins?.market)} /></div>
                    <p className="mt-2 text-sm text-slate-300">{crowd ? `The trend looks good, but not now. ${crowd.text}` : a.idea}</p>
                    {stop && <StopBadge l={stop} />}
                    {notes.map((n) => <p key={n} className="mt-1.5 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">⚠ {n}</p>)}
                  </button>
                  {open && (
                    <div className="space-y-3 border-t border-white/10 px-4 pb-4 pt-3">
                      <Sparkline values={a.closes} dates={dates[h.symbol]} height={88} interactive label={`${h.symbol} price, last 6 months`} />
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="panel !p-2"><p className="label !text-[10px]">Today</p><Change value={(a.price - a.prevClose) * h.shares} className="text-xs" /></div>
                        <div className="panel !p-2"><p className="label !text-[10px]">1 month</p><Change pct={a.ret1m} className="text-xs" /></div>
                        <div className="panel !p-2"><p className="label !text-[10px]">3 months</p><Change pct={a.ret3m} className="text-xs" /></div>
                      </div>
                      <RedditPanel b={ins?.stocks[h.symbol]?.buzz} />
                      <InsightLines i={ins?.stocks[h.symbol]} />
                      {tax ? <p className="text-xs text-slate-400">🧾 {taxText(tax, a.price - h.avgCost)}</p> : <p className="text-xs text-slate-500">🧾 Add the date you bought it in Settings to see tax timing.</p>}
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
        <PriceAlerts status={status} />
        {ins && <BuzzRail items={held.map((h) => ({ sym: h.symbol, b: ins.stocks[h.symbol]?.buzz }))} />}
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
