import type { ReactNode } from 'react';

export type NavTab = readonly [string, ReactNode];

/** Floating glass tab bar at the bottom (phones and tablets): a pill slides to the open tab. `inline` = the Guide's picture of it. */
export function TabBar<T extends string>({ tabs, current, onPick, badge, inline = false }: {
  tabs: readonly (readonly [T, ReactNode])[]; current: T; onPick: (t: T) => void; badge?: Partial<Record<T, number>>; inline?: boolean;
}) {
  const i = Math.max(0, tabs.findIndex(([t]) => t === current));
  const n = tabs.length;
  return (
    <nav
      className={inline ? '' : 'qt-tabbar pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 lg:hidden'}
      aria-label={inline ? 'Example of the tab bar' : 'Main'}
    >
      <div className="glass pointer-events-auto relative mx-auto grid max-w-md rounded-[1.4rem] !bg-[rgba(7,11,22,0.95)] p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="qt-pill bottom-1 left-1 top-1" style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${i * 100}%)` }} />
        {tabs.map(([t, icon]) => {
          const on = t === current;
          const b = badge?.[t] ?? 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onPick(t)}
              aria-current={on ? 'page' : undefined}
              className={`relative z-10 flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[10.5px] font-medium tracking-wide transition-colors ${on ? 'text-cyan-100' : 'text-slate-400'}`}
            >
              <span className={`transition-transform duration-300 ${on ? '-translate-y-px scale-110 drop-shadow-[0_0_8px_rgba(103,232,249,0.8)]' : ''}`}>{icon}</span>
              <span className="max-w-full truncate">{t}</span>
              {b > 0 && <span className="num absolute right-1.5 top-1 min-w-[18px] rounded-full bg-cyan-300 px-1 text-center text-[10px] font-bold leading-[18px] text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.8)]">{b}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The same tabs in the header on wide screens, with the same sliding pill. */
export function TopTabs<T extends string>({ tabs, current, onPick, badge }: {
  tabs: readonly (readonly [T, ReactNode])[]; current: T; onPick: (t: T) => void; badge?: Partial<Record<T, number>>;
}) {
  const i = Math.max(0, tabs.findIndex(([t]) => t === current));
  return (
    <nav className="relative ml-4 hidden rounded-2xl border border-white/[0.08] bg-black/30 p-1 lg:flex" aria-label="Main">
      <span aria-hidden="true" className="qt-pill bottom-1 left-1 top-1 w-[96px]" style={{ transform: `translateX(${i * 96}px)` }} />
      {tabs.map(([t, icon]) => {
        const on = t === current;
        const b = badge?.[t] ?? 0;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            aria-current={on ? 'page' : undefined}
            className={`relative z-10 flex h-9 w-[96px] items-center justify-center gap-1.5 rounded-xl text-sm transition-colors ${on ? 'text-cyan-50' : 'text-slate-400 hover:text-slate-100'}`}
          >
            <span className="scale-[0.85]">{icon}</span>
            {t}
            {b > 0 && <span className="num absolute -right-0.5 -top-1 min-w-[18px] rounded-full bg-cyan-300 px-1 text-center text-[10px] font-bold leading-[18px] text-slate-950">{b}</span>}
          </button>
        );
      })}
    </nav>
  );
}
