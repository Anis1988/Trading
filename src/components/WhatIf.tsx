import { useState } from 'react';
import type { SimResult } from '../lib/whatif';
import { SIM_LIMITS } from '../lib/whatif';
import { LEVEL } from '../lib/strictness';
import { ActionChip, Change, fmtMoney } from './ui';

/* Three lines, told apart by colour AND line style AND the legend (checked for colour-blind readers on the dark card). */
const LINES = [
  { key: 'you', name: 'Following the rules', color: '#0891b2', dash: undefined, width: 2.4 },
  { key: 'hold', name: 'Just holding', color: '#9333ea', dash: '6 4', width: 2 },
  { key: 'spy', name: 'S&P 500 (SPY)', color: '#db2777', dash: '2 3', width: 2 },
] as const;

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
const signPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;

/** The value of the starting amount over time: following the rules vs just holding vs the S&P 500. Touch to read a day. */
export function EquityChart({ r, height = 150 }: { r: SimResult; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = r.curve;
  if (pts.length < 2) return null;
  const w = 300;
  const all = pts.flatMap((p) => [p.you, p.hold, ...(p.spy !== undefined ? [p.spy] : [])]).concat(r.amount);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (v: number) => height - 6 - ((v - min) / (max - min || 1)) * (height - 12);
  const path = (k: 'you' | 'hold' | 'spy') => pts.map((p, i) => (p[k] === undefined ? '' : `${x(i).toFixed(1)},${y(p[k]!).toFixed(1)}`)).filter(Boolean).join(' ');
  const pick = (clientX: number, el: Element) => {
    const b = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((clientX - b.left) / b.width) * (pts.length - 1)))));
  };
  const h = hover !== null ? pts[hover] : null;
  return (
    <figure className="space-y-2">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
        {LINES.filter((l) => l.key !== 'spy' || r.spy).map((l) => (
          <li key={l.key} className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke={l.color} strokeWidth="2.4" strokeDasharray={l.dash} strokeLinecap="round" /></svg>
            {l.key === 'hold' ? `Just holding ${r.symbol}` : l.name}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full touch-pan-y" style={{ height }} role="img"
          aria-label={`${fmtMoney(r.amount)} from ${r.from} to ${r.to}: following the rules ${fmtMoney(r.final)}, just holding ${fmtMoney(r.hold.final)}${r.spy ? `, S&P 500 ${fmtMoney(r.spy.final)}` : ''}`}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)} onPointerDown={(e) => pick(e.clientX, e.currentTarget)} onPointerLeave={() => setHover(null)}
        >
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} stroke="rgba(148,163,184,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <line x1="0" x2={w} y1={y(r.amount)} y2={y(r.amount)} stroke="rgba(148,163,184,0.35)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {[...LINES].reverse().filter((l) => l.key !== 'spy' || r.spy).map((l) => (
            <polyline key={l.key} points={path(l.key)} fill="none" stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {h && hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="rgba(226,232,240,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={x(hover)} cy={y(h.you)} r="3.5" fill={LINES[0].color} stroke="#05070f" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {h && (
          <div className="pointer-events-none absolute left-1 top-1 rounded-lg border border-cyan-300/25 bg-ink-950/95 px-2 py-1 text-[11px] leading-snug shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)] backdrop-blur">
            <p className="text-slate-400">{shortDate(h.date)}</p>
            <p className="num text-slate-100">Rules {fmtMoney(h.you)}</p>
            <p className="num text-slate-300">Holding {fmtMoney(h.hold)}</p>
            {h.spy !== undefined && <p className="num text-slate-300">S&amp;P 500 {fmtMoney(h.spy)}</p>}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500"><span>{shortDate(r.from)}</span><span>dashed line = your starting {fmtMoney(r.amount)}</span><span>{shortDate(r.to)}</span></div>
    </figure>
  );
}

function Big({ label, value, pct, strong }: { label: string; value: number; pct: number; strong?: boolean }) {
  return (
    <div className={`panel !p-2.5 ${strong ? '!border-cyan-300/40' : ''}`}>
      <p className="label !text-[10px]">{label}</p>
      <p className="num mt-0.5 text-lg font-semibold text-slate-50">{fmtMoney(value)}</p>
      <Change pct={pct} className="text-xs" />
    </div>
  );
}

/** The full result for one stock. Also drawn in the Guide with made-up prices (`example` = nothing to tap). */
export function WhatIfReport({ r, example = false }: { r: SimResult; example?: boolean }) {
  const [all, setAll] = useState(false);
  const beat = r.final - r.hold.final;
  const trades = [...r.trades].reverse();
  const shown = all || example ? trades : trades.slice(0, 8);
  const lv = Object.entries(r.presets).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${LEVEL[k as keyof typeof LEVEL].icon} ${LEVEL[k as keyof typeof LEVEL].name} ${Math.round((n / r.days) * 100)}%`);
  return (
    <div className="space-y-3">
      <p className="text-[15px] leading-relaxed text-slate-200">
        Following the app’s BUY and SELL on <b className="font-display">{r.symbol}</b> for {r.months} months, {fmtMoney(r.amount)} would now be <b className="num">{fmtMoney(r.final)}</b> ({signPct(r.ret)}).{' '}
        {Math.abs(beat) < r.amount * 0.005 ? 'About the same as just holding it.' : beat > 0 ? <>That’s <b className="num">{fmtMoney(beat)}</b> more than just holding it.</> : <>Just holding it would have made <b className="num">{fmtMoney(-beat)}</b> more.</>}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Big label="Rules" value={r.final} pct={r.ret} strong />
        <Big label={`Hold ${r.symbol}`} value={r.hold.final} pct={r.hold.ret} />
        {r.spy ? <Big label="S&P 500" value={r.spy.final} pct={r.spy.ret} /> : <div className="panel !p-2.5 text-xs text-slate-500">S&amp;P 500: no data</div>}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="panel !p-2"><p className="label !text-[10px]">Trades</p><p className="num text-[15px] font-semibold">{r.trades.length}</p><p className="text-[10px] text-slate-500">{r.closed} sold</p></div>
        <div className="panel !p-2"><p className="label !text-[10px]">Win rate</p><p className="num text-[15px] font-semibold">{r.winRate === null ? '–' : `${r.winRate}%`}</p><p className="text-[10px] text-slate-500">{r.winRate === null ? 'nothing sold' : `${r.wins} of ${r.closed} made money`}</p></div>
        <div className="panel !p-2"><p className="label !text-[10px]">Biggest drop</p><p className="num text-[15px] font-semibold text-red-300">▼ {Math.abs(r.maxDrop).toFixed(1)}%</p><p className="text-[10px] text-slate-500">from a high</p></div>
      </div>
      <EquityChart r={r} />
      <p className="text-xs text-slate-400">
        In the stock {r.invested}% of the days{r.open ? `; still holding ${r.open.shares} shares at the end (worth ${fmtMoney(r.open.value)}, ${signPct(r.open.pct)} on what it paid)` : ''}. Level used: {lv.join(' · ')}.
        {r.shortHistory ? ' Less than 6 months of prices before the start, so the first days judged the trend on a shorter history.' : ''}
      </p>
      <div>
        <p className="label mb-1.5">The simulated trades</p>
        {!r.trades.length ? (
          <p className="text-sm text-slate-400">No BUY in this period: the rules said WAIT or stay away every day, so the money stayed as cash ({fmtMoney(r.amount)}).</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {shown.map((t, i) => (
              <li key={`${t.date}${t.side}${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                <span className="num w-[72px] shrink-0 text-xs text-slate-400">{shortDate(t.date)}</span>
                <ActionChip action={t.side} size="sm" />
                <span className="num text-slate-200">{t.shares} sh at ${t.price}</span>
                {t.result ? <span className="ml-auto"><Change value={t.result.dollars} pct={t.result.pct} className="text-xs" /></span> : <span className="num ml-auto text-xs text-slate-400">{fmtMoney(t.dollars)}</span>}
                <span className="basis-full pl-[80px] text-xs text-slate-500">{t.why}</span>
              </li>
            ))}
          </ul>
        )}
        {!example && trades.length > 8 && <button className="btn-ghost mt-1 !px-1 text-xs" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${trades.length} trades`}</button>}
      </div>
    </div>
  );
}

/** One line per stock when testing several at once. */
export function WhatIfRow({ r, onOpen, open }: { r: SimResult; onOpen?: () => void; open?: boolean }) {
  const beat = r.ret - r.hold.ret;
  return (
    <button type="button" className={`tap panel flex w-full items-center gap-3 text-left ${open ? '!border-cyan-300/40' : ''}`} onClick={onOpen} aria-expanded={open}>
      <b className="w-16 shrink-0 font-display text-base">{r.symbol}</b>
      <span className="min-w-0 flex-1 text-xs text-slate-400">
        Rules <Change pct={r.ret} className="text-xs" /> · hold <Change pct={r.hold.ret} className="text-xs" />
        <span className="block">{r.trades.length} trades · {Math.abs(beat) < 0.5 ? 'about the same' : beat > 0 ? `beat holding by ${beat.toFixed(1)} pts` : `holding did ${(-beat).toFixed(1)} pts better`}</span>
      </span>
      <span className="num shrink-0 text-sm font-semibold">{fmtMoney(r.final)}</span>
    </button>
  );
}

/** What can't be replayed exactly like the live app. */
export function SimLimits() {
  return (
    <ul className="space-y-1 text-xs text-slate-400">
      {SIM_LIMITS.map((x) => <li key={x}>• {x}</li>)}
    </ul>
  );
}
