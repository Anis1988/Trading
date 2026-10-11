import type { Brief } from '../lib/brief';
import { Change } from './ui';

const MOOD = { up: 'rising', down: 'falling', mixed: 'no clear direction' } as const;

/** ☀️ The morning brief on Today (also the Guide example: no `onClose`). */
export function BriefCard({ b, onClose }: { b: Brief; onClose?: () => void }) {
  return (
    <section className="card space-y-2.5 !border-amber-200/30 !bg-amber-300/[0.06] text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="label !text-amber-100">☀️ Morning brief · {new Date(`${b.day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
        {onClose && <button className="px-1 text-slate-400 hover:text-white" aria-label="Hide the brief" onClick={onClose}>✕</button>}
      </div>
      <p className="text-slate-300">
        Market {b.market ? <><b>{MOOD[b.market.trend]}</b> <span className="text-xs text-slate-400">(S&amp;P 500 <Change pct={b.market.ret1m} className="text-xs" /> this month)</span></> : 'not available'} · {b.level}
      </p>
      {b.last && (
        <div>
          <p className="text-slate-300">Your stocks, last trading day: <Change value={b.last.change} pct={b.last.pct} /></p>
          {b.movers.length > 0 && <p className="mt-0.5 text-xs text-slate-400">{b.movers.map((m) => <span key={m.symbol} className="mr-2 inline-block"><b className="font-display text-slate-200">{m.symbol}</b> <Change pct={m.pct} className="text-xs" /></span>)}</p>}
        </div>
      )}
      {b.stops.map((s) => (
        <p key={s.symbol} className={`rounded-lg border px-2 py-1.5 text-xs ${s.away <= 0 ? 'border-red-400/50 bg-red-500/15 text-red-100' : 'border-amber-300/50 bg-amber-400/15 text-amber-100'}`}>
          🛑 <b>{s.symbol}</b> ${s.price}: {s.away <= 0 ? 'at or below' : `${s.away}% above`} your stop-loss ${s.stop}
        </p>
      ))}
      {b.alerts.map((a) => <p key={a.symbol + a.target} className="text-xs text-slate-300">🔔 <b>{a.symbol}</b> ${a.price} is {a.away}% from your ${a.target} alert</p>)}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Earnings this week</p>
        {b.earnings.length ? b.earnings.map((e) => <p key={e.symbol} className="text-xs text-slate-300"><b className="font-display">{e.symbol}</b> · {e.text}</p>) : <p className="text-xs text-slate-500">None of your stocks.</p>}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">BUY now</p>
        {b.buys.length ? b.buys.map((x) => (
          <p key={x.symbol} className="text-xs text-slate-300"><b className="font-display text-emerald-200">{x.symbol}</b> ~${x.price}{x.owned ? ' (add more)' : ''} · {x.idea}</p>
        )) : <p className="text-xs text-slate-500">Nothing passes your rules today. Waiting is fine.</p>}
      </div>
      <p className="text-[11px] text-slate-500">Ideas only, not advice. The app never places orders.</p>
    </section>
  );
}
