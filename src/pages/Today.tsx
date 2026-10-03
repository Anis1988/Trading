import { useState } from 'react';
import { useStore } from '../store';
import { SignalCard } from '../components/SignalCard';
import { SignalCenter } from './SignalCenter';
import { useTrends } from '../lib/useTrends';
import { ACTION_STYLE, type Analysis } from '../lib/trend';
import { money } from '../lib/risk';

const IDEA: Record<Analysis['ideaKind'], string> = {
  buy: 'border-emerald-700 text-emerald-200',
  wait: 'border-amber-700 text-amber-200',
  hold: 'border-slate-600 text-slate-200',
  sell: 'border-red-700 text-red-200',
  avoid: 'border-red-900 text-red-300',
};
const LABEL: Record<Analysis['label'], string> = {
  'Strong uptrend': 'bg-emerald-700',
  Uptrend: 'bg-emerald-900',
  Mixed: 'bg-slate-700',
  Downtrend: 'bg-red-800',
};

export function Today({ goTo }: { goTo: (tab: 'Settings') => void }) {
  const { settings, signals, headlines, resume } = useStore();
  const [showAll, setShowAll] = useState(false);
  const held = settings.holdings;
  const { rows, loading, err } = useTrends(held.map((h) => h.symbol), settings);

  // Portfolio totals in dollars (only for holdings that have a price).
  const priced = held.filter((h) => rows.some((r) => r.symbol === h.symbol));
  const tot = priced.reduce(
    (t, h) => {
      const r = rows.find((x) => x.symbol === h.symbol)!;
      return { value: t.value + h.shares * r.price, cost: t.cost + h.shares * h.avgCost, day: t.day + h.shares * (r.price - r.prevClose) };
    },
    { value: 0, cost: 0, day: 0 },
  );
  const pl = tot.value - tot.cost;
  const plPct = tot.cost > 0 ? (pl / tot.cost) * 100 : 0;
  const dayPct = tot.value - tot.day > 0 ? (tot.day / (tot.value - tot.day)) * 100 : 0;
  const sign = (n: number) => (n >= 0 ? '+' : '-');

  // Only signals worth acting on: not dismissed, not rejected by the AI.
  const attention = signals.filter((s) => s.status === 'new' && s.review?.verdict !== 'REJECT');

  if (!held.length) {
    return (
      <div className="card space-y-2 text-center">
        <p className="text-lg font-semibold">Tell me what you own</p>
        <p className="text-sm text-slate-400">Add your stocks (symbol, shares, average price) and I will only watch those and tell you when to buy or sell.</p>
        <button className="btn-primary mx-auto" onClick={() => goTo('Settings')}>Add my holdings</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {settings.stopped && (
        <div className="flex items-center justify-between gap-2 rounded border border-red-700 bg-red-950 p-3 text-sm">
          <span>Alerts are stopped: no news checking, no auto-email.</span>
          <button className="btn-primary" onClick={resume}>Resume</button>
        </div>
      )}

      <section className="card">
        {priced.length ? (
          <>
            <p className="text-xs text-slate-400">Total profit / loss on what you own</p>
            <p className={`text-3xl font-bold ${pl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {sign(pl)}{money(pl)} <span className="text-base font-medium">({sign(pl)}{Math.abs(plPct).toFixed(1)}%)</span>
            </p>
            <p className={`text-sm ${tot.day >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>Today: {sign(tot.day)}{money(tot.day)} ({sign(tot.day)}{Math.abs(dayPct).toFixed(1)}%)</p>
            <p className="mt-1 text-xs text-slate-500">Worth {money(tot.value)} · you paid {money(tot.cost)}{priced.length < held.length ? ` · ${held.length - priced.length} stock(s) have no price yet` : ''}</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">{loading ? 'Loading your profit / loss…' : 'Profit / loss will show here once prices load.'}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{attention.length ? `${attention.length} thing${attention.length > 1 ? 's' : ''} for you to look at` : 'Nothing needs you right now'}</h2>
        <div className="space-y-2">
          {attention.map((s) => <SignalCard key={s.id} s={s} />)}
          {!attention.length && <p className="text-sm text-slate-500">I will tell you here when news says to buy or sell one of your stocks.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">My stocks</h2>
        {err && <p className="mb-2 rounded border border-amber-800 bg-amber-950 p-2 text-sm text-amber-200">{err}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {held.map((h) => {
            const a = rows.find((r) => r.symbol === h.symbol);
            const pl = a && h.avgCost > 0 ? ((a.price - h.avgCost) / h.avgCost) * 100 : null;
            const gain = a ? (a.price - h.avgCost) * h.shares : null;
            const news = headlines.filter((x) => x.symbol === h.symbol).slice(0, 2);
            return (
              <div key={h.symbol} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold">{h.symbol}</span>
                  {a?.action && <span className={`rounded px-2 py-0.5 text-xs font-bold ${ACTION_STYLE[a.action]}`}>{a.action}</span>}
                  {a && <span className={`rounded px-2 py-0.5 text-xs font-bold ${LABEL[a.label]}`}>{a.label}</span>}
                  <span className="ml-auto text-sm text-slate-400">{h.shares} sh · bought ${h.avgCost}</span>
                </div>
                {a ? (
                  <>
                    <p className="mt-1 text-2xl font-semibold">${a.price}
                      <span className={`ml-2 text-xs ${a.price >= a.prevClose ? 'text-emerald-400' : 'text-red-400'}`}>today {sign((a.price - a.prevClose) * h.shares)}{money((a.price - a.prevClose) * h.shares)}</span>
                      {pl !== null && gain !== null && (
                        <span className={`ml-2 text-sm font-medium ${pl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {pl >= 0 ? '+' : '-'}${Math.abs(gain).toFixed(0)} ({pl >= 0 ? '+' : ''}{pl.toFixed(1)}%)
                        </span>
                      )}
                    </p>
                    <p className={`mt-2 rounded border px-2 py-1.5 text-sm ${IDEA[a.ideaKind]}`}>{a.idea}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">{loading ? 'Loading price…' : 'No price yet.'}</p>
                )}
                {news.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-400">
                    {news.map((n) => (
                      <li key={n.id}><a className="hover:underline" href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button className="text-xs text-slate-500 underline" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Hide' : 'Show'} all earlier signals ({signals.length})</button>
      {showAll && <SignalCenter />}

      <p className="pt-2 text-center text-[11px] text-slate-600">
        Not a broker: this app never places trades. You place every order yourself in Fidelity. Not financial advice.
      </p>
    </div>
  );
}
