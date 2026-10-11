import { NEAR_PCT, STOP_PCTS, stopFor, stopSettings, stopWhy, type StopLine, type StopWatch } from '../lib/stopWatch';
import type { Holding } from '../lib/holdings';
import { Field, Toggle } from './ui';

/** The one-line stop on a Today tile: "🛑 Stop $205 · 6.1% away". Red when hit, amber when close. */
export function StopBadge({ l }: { l: StopLine }) {
  const tone = l.hit ? 'border-red-400/50 bg-red-500/15 text-red-100' : l.near ? 'border-amber-300/50 bg-amber-400/15 text-amber-100' : 'border-white/10 bg-white/5 text-slate-300';
  return (
    <p className={`mt-2 rounded-lg border px-2 py-1.5 text-xs ${tone}`}>
      🛑 Stop-loss <span className="num">${l.stop}</span> · {l.hit ? <b>reached: your call (sell in Fidelity if you want out)</b> : `${l.away}% away${l.near ? ': close' : ''}`}
    </p>
  );
}

/** One row of the Settings list (also the Guide example: no `onPct`). */
export function StopRow({ h, l, custom, onPct }: { h: Holding; l: StopLine | null; custom?: number; onPct?: (pct: number | null) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
      <b className="font-display w-14">{h.symbol}</b>
      <span className="min-w-0 flex-1 text-xs text-slate-400">
        {l ? <><span className={`num text-sm ${l.hit ? 'text-red-300' : l.near ? 'text-amber-200' : 'text-slate-200'}`}>${l.stop}</span> · {stopWhy(l, h)} · {l.hit ? 'reached' : `${l.away}% away`}</> : 'Waiting for the price…'}
      </span>
      <select className="input !w-24 !py-1 text-xs" value={custom ?? ''} aria-label={`${h.symbol} stop distance`} onChange={(e) => onPct?.(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Same</option>
        {STOP_PCTS.map((p) => <option key={p} value={p}>{p}%</option>)}
      </select>
    </li>
  );
}

/** Settings → Alerts & email → 🛑 Stop-loss watch. */
export function StopWatchPanel({ settings, holdings, price, history, onChange }: {
  settings: { stopWatch?: StopWatch };
  holdings: Holding[];
  price: (sym: string) => number | undefined;
  history: (sym: string) => { dates?: string[]; closes?: number[] };
  onChange?: (sw: StopWatch) => void;
}) {
  const sw = stopSettings(settings);
  const set = (p: Partial<StopWatch>) => onChange?.({ ...sw, ...p });
  return (
    <div className="panel space-y-2">
      <Field label="🛑 Stop-loss watch" hint="A warning (email + notification) when a stock you own falls too far. Checked hourly with the background alerts. The app never sells: you decide.">
        <Toggle on={sw.on} onChange={(v) => set({ on: v })} label="Stop-loss watch" />
      </Field>
      {sw.on && (
        <>
          <Field label="Warn me when it falls" hint="Below what you paid for it.">
            <select className="input w-24" value={sw.pct} aria-label="Stop distance" onChange={(e) => set({ pct: Number(e.target.value) })}>
              {STOP_PCTS.map((p) => <option key={p} value={p}>{p}%</option>)}
            </select>
          </Field>
          <Field label="Follow the price up (trailing)" hint="Also measured from the highest close since you bought, so a gain is protected too. Needs the date you bought (My holdings).">
            <Toggle on={sw.trailing} onChange={(v) => set({ trailing: v })} label="Trailing stop" />
          </Field>
          {holdings.length > 0 && (
            <ul className="divide-y divide-white/5">
              {holdings.map((h) => {
                const p = price(h.symbol);
                const hist = history(h.symbol);
                const l = p ? stopFor(h, p, sw, hist.dates, hist.closes) : null;
                return (
                  <StopRow key={h.symbol} h={h} l={l} custom={sw.custom?.[h.symbol]} onPct={(pct) => {
                    const custom = { ...(sw.custom ?? {}) };
                    if (pct === null) delete custom[h.symbol]; else custom[h.symbol] = pct;
                    set({ custom });
                  }} />
                );
              })}
            </ul>
          )}
          <p className="text-xs text-slate-500">"Same" uses {sw.pct}%. Within {NEAR_PCT}% of a stop, Today shows it in amber and the morning brief lists it. {settings && !holdings.some((h) => h.boughtAt) && sw.trailing ? 'Add the date you bought to use trailing.' : ''}</p>
        </>
      )}
    </div>
  );
}
