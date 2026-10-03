import { useState } from 'react';
import { useStore } from '../store';
import { SignalCard } from '../components/SignalCard';
import { cleanSymbol } from '../lib/util';
import { config } from '../lib/config';

export function Dashboard() {
  const { watchlist, setWatchlist, headlines, signals, settings, resume, lastPoll, polling, log, syncStatus } = useStore();
  const [sym, setSym] = useState('');
  const active = signals.filter((s) => s.status === 'new').slice(0, 5);
  const deployUrl = config.siteName ? `https://app.netlify.com/sites/${config.siteName}/deploys` : 'https://app.netlify.com/';

  const add = () => {
    const s = cleanSymbol(sym);
    if (s && !watchlist.includes(s)) {
      setWatchlist([...watchlist, s]);
      log('info', `Added ${s} to watchlist`);
    }
    setSym('');
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <section className="card">
          <h2 className="mb-2 font-semibold">Status</h2>
          <ul className="space-y-1 text-sm text-slate-300">
            <li>Mode: <b className={settings.mockMode ? 'text-sky-400' : 'text-amber-400'}>{settings.mockMode ? 'MOCK / DEMO' : 'LIVE'}</b></li>
            <li>Polling: {settings.stopped ? <b className="text-red-400">STOPPED (Panic)</b> : polling ? `every ${settings.pollIntervalSec}s` : 'idle'}</li>
            <li>Auto-email: {settings.autoEmail ? 'ON' : 'OFF'}</li>
            <li>Sync: {syncStatus === 'ok' ? <span className="text-emerald-400">✓ on</span> : syncStatus === 'error' ? <span className="text-red-400">✕ error (see Settings)</span> : syncStatus === 'syncing' ? 'syncing…' : <span className="text-slate-500">off (Settings)</span>}</li>
            <li>Last poll: {lastPoll ? new Date(lastPoll).toLocaleTimeString() : '—'}</li>
            <li>
              Deploy: <a className="text-sky-400 underline" href={deployUrl} target="_blank" rel="noopener noreferrer">Netlify deploys</a>
              {config.siteId && (
                <img className="mt-1" alt="Netlify deploy status" src={`https://api.netlify.com/api/v1/badges/${config.siteId}/deploy-status`} />
              )}
            </li>
          </ul>
          {settings.stopped && <button className="btn-primary mt-3" onClick={resume}>Resume polling</button>}
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold">Watchlist</h2>
          <div className="mb-2 flex gap-2">
            <input className="input w-full" placeholder="Symbol e.g. NVDA" value={sym} onChange={(e) => setSym(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn" onClick={add}>Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {watchlist.map((w) => (
              <span key={w} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-sm">
                {w}
                <button aria-label={`Remove ${w}`} className="text-slate-400 hover:text-red-400" onClick={() => setWatchlist(watchlist.filter((x) => x !== w))}>×</button>
              </span>
            ))}
          </div>
        </section>

        <section className="card text-sm text-slate-300">
          <h2 className="mb-1 font-semibold">My holdings</h2>
          {settings.holdings.length ? (
            <ul className="space-y-0.5">
              {settings.holdings.map((h) => (
                <li key={h.symbol}>{h.symbol}: {h.shares} sh @ ${h.avgCost}</li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">None yet. Add them in Settings → My holdings.</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Monitored automatically. Signals on these are checked against what you own.</p>
        </section>

        <section className="card text-sm text-slate-300">
          <h2 className="mb-1 font-semibold">Account note</h2>
          Execute trades yourself in Fidelity. After placing an order, open <b>History</b> and mark the instruction executed with order id and price.
        </section>
      </div>

      <div className="space-y-4 lg:col-span-2">
        <section>
          <h2 className="mb-2 font-semibold">Active signals</h2>
          <div className="space-y-2">
            {active.length ? active.map((s) => <SignalCard key={s.id} s={s} />) : <p className="text-sm text-slate-500">No active signals yet.</p>}
          </div>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Live headlines</h2>
          <ul className="max-h-96 divide-y divide-slate-800 overflow-auto text-sm">
            {headlines.length ? headlines.slice(0, 40).map((h) => (
              <li key={h.id} className="py-1.5">
                <span className="mr-2 rounded bg-slate-800 px-1.5 text-xs">{h.symbol ?? '—'}</span>
                <a className="hover:underline" href={h.url} target="_blank" rel="noopener noreferrer">{h.title}</a>
                <span className="ml-2 text-xs text-slate-500">{h.source} · {new Date(h.publishedAt).toLocaleTimeString()}</span>
              </li>
            )) : <li className="py-2 text-slate-500">Waiting for headlines…</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
