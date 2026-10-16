import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* ---------- one action vocabulary for the whole app ---------- */
export type Action = 'BUY' | 'SELL' | 'HOLD' | 'WAIT' | 'SKIP' | 'CHECKING';

const ACTION: Record<Action, { cls: string; icon: string; label: string }> = {
  BUY: { cls: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200 shadow-[0_0_14px_-2px_rgba(52,211,153,0.45)]', icon: '▲', label: 'BUY' },
  SELL: { cls: 'border-red-300/50 bg-red-400/15 text-red-200 shadow-[0_0_14px_-2px_rgba(248,113,113,0.45)]', icon: '▼', label: 'SELL' },
  HOLD: { cls: 'border-slate-300/30 bg-slate-400/10 text-slate-200', icon: '●', label: 'HOLD' },
  WAIT: { cls: 'border-amber-300/50 bg-amber-400/15 text-amber-200', icon: '◆', label: 'WAIT' },
  SKIP: { cls: 'border-slate-400/30 bg-slate-500/10 text-slate-400', icon: '✕', label: 'SKIP' },
  CHECKING: { cls: 'border-cyan-300/40 bg-cyan-400/10 text-cyan-200', icon: '◌', label: 'CHECKING' },
};

export function ActionChip({ action, size = 'md', suffix }: { action: Action; size?: 'sm' | 'md' | 'lg'; suffix?: string }) {
  const a = ACTION[action];
  const sz = size === 'lg' ? 'px-3 py-1 text-sm' : size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-lg border font-mono font-bold tracking-wider ${sz} ${a.cls}`}>
      <span aria-hidden="true">{action === 'CHECKING' ? <span className="spinner !h-2.5 !w-2.5" /> : a.icon}</span>
      {a.label}
      {suffix && <span className="font-medium opacity-80">{suffix}</span>}
    </span>
  );
}

/* ---------- numbers ---------- */
export const fmtMoney = (n: number) => {
  const a = Math.abs(n);
  return `$${a >= 1000 ? Math.round(a).toLocaleString() : a.toFixed(2)}`;
};
/** Signed money with an arrow so gain/loss is never colour-only. */
export function Change({ value, pct, className = '' }: { value?: number; pct?: number; className?: string }) {
  const v = value ?? pct ?? 0;
  const up = v >= 0;
  return (
    <span className={`num inline-flex items-center gap-1 ${up ? 'text-emerald-300' : 'text-red-300'} ${className}`}>
      <span aria-hidden="true" className="text-[0.7em]">{up ? '▲' : '▼'}</span>
      {value !== undefined && `${up ? '+' : '-'}${fmtMoney(value)}`}
      {pct !== undefined && <span className={value !== undefined ? 'opacity-80' : ''}>{value !== undefined ? ' (' : ''}{up ? '+' : '-'}{Math.abs(pct).toFixed(1)}%{value !== undefined ? ')' : ''}</span>}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className="panel !p-2">
      <p className="label !text-[10px]">{label}</p>
      <p className={`num mt-0.5 text-[15px] font-semibold ${tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-red-300' : 'text-slate-100'}`}>{value}</p>
    </div>
  );
}

/* ---------- containers ---------- */
export function Section({ title, subtitle, icon, defaultOpen = false, children, right }: {
  title: string; subtitle?: string; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode; right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="card !p-0">
      <button className="tap flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-200 shadow-[0_0_16px_-4px_rgba(34,211,238,0.5)]">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-display font-semibold">{title}</span>
          {subtitle && <span className="block truncate text-xs text-slate-400">{subtitle}</span>}
        </span>
        {right}
        <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-400 transition-transform duration-300 ${open ? 'rotate-180 text-cyan-200' : ''}`}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && <div id={id} className="qt-enter space-y-3 border-t border-white/[0.07] px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-slate-200">{label}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="toggle disabled:opacity-40" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export const Skeleton = ({ className = 'h-24' }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-8 text-center">
      <div aria-hidden="true" className="relative mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-200 shadow-[0_0_28px_-6px_rgba(34,211,238,0.6)]">{Icon.today}</div>
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-slate-400">{children}</p>}
      {action}
    </div>
  );
}

/* ---------- sliding segmented control (tabs inside a page) ---------- */
export function Seg<T extends string>({ value, options, onChange, label, className = '' }: {
  value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (v: T) => void; label: string; className?: string;
}) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  const n = options.length;
  return (
    <div className={`seg ${className}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} role="tablist" aria-label={label}>
      <span aria-hidden="true" className="seg-thumb" style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${i * 100}%)` }} />
      {options.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

/* ---------- sheet: slides up from the bottom on phones, a centred panel on big screens; drawn over the page in a portal ---------- */
export function Sheet({ children, onClose, labelledBy }: { children: ReactNode; onClose?: () => void; labelledBy?: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="qt-scrim absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="qt-sheet glass relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl px-4 pt-3 sm:max-w-sm sm:rounded-3xl">
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- single-series price line with a hover/touch crosshair ---------- */
export function Sparkline({ values, dates, height = 56, interactive = false, label }: {
  values: number[]; dates?: string[]; height?: number; interactive?: boolean; label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2) return null;
  const w = 300;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? '#34d399' : '#f87171';
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  const baseY = y(values[0]);
  const gid = `g${label.replace(/\W/g, '')}${up ? 'u' : 'd'}`;
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(values.length - 1, Math.round(((clientX - r.left) / r.width) * (values.length - 1)))));
  };
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img"
        aria-label={`${label}: from ${values[0]} to ${values[values.length - 1]}, ${up ? 'rising' : 'falling'}`}
        onPointerMove={interactive ? (e) => pick(e.clientX, e.currentTarget) : undefined}
        onPointerLeave={interactive ? () => setHover(null) : undefined}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.32" />
            <stop offset="70%" stopColor={stroke} stopOpacity="0.05" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* faint guide lines and the starting price (dashed), so the move is easy to read */}
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} stroke="rgba(148,163,184,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        <line x1="0" x2={w} y1={baseY} y2={baseY} stroke="rgba(148,163,184,0.28)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <polygon points={`0,${height} ${pts} ${w},${height}`} fill={`url(#${gid})`} />
        <polyline className="spark-line" style={{ ['--spark' as string]: up ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.55)' }} points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={height} stroke="rgba(226,232,240,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(values[hover])} r="4" fill={stroke} stroke="#05070f" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hover === null && (
        <span aria-hidden="true" className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2" style={{ left: 'calc(100% - 4px)', top: y(values[last]) }}>
          <span className="spark-ping absolute inset-0 rounded-full" style={{ background: stroke }} />
          <span className="absolute inset-0 rounded-full border border-[#05070f]" style={{ background: stroke, boxShadow: `0 0 10px ${stroke}` }} />
        </span>
      )}
      {hover !== null && (
        <div className="pointer-events-none absolute -top-1 right-0 rounded-lg border border-cyan-300/25 bg-ink-950/95 px-2 py-1 text-xs shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)] backdrop-blur">
          <span className="num font-semibold text-slate-100">${values[hover].toFixed(2)}</span>
          {dates?.[hover] && <span className="ml-1.5 text-slate-400">{dates[hover]}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- small line icons (24x24, stroke = currentColor) ---------- */
const P = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  today: P(<><path d="M3 12h4l3 7 4-14 3 7h4" /></>),
  ideas: P(<><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></>),
  history: P(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>),
  settings: P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
  wallet: P(<><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h2M3 10h18" /></>),
  bell: P(<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>),
  shield: P(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></>),
  sync: P(<><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5M3 21v-5h5" /></>),
  wrench: P(<><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.4-.4-2.6 2.4-2.4Z" /></>),
  stop: P(<><rect x="6" y="6" width="12" height="12" rx="2" /></>),
  words: P(<><path d="M4 19V6a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2" /><path d="M8 15l2.5-7 2.5 7M9 12.5h3" /></>),
  whatif: P(<><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /><path d="M8 15l3-3 2 2 3-4" /></>),
  guide: P(<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h13M9 7h6M9 11h4" /></>),
};
