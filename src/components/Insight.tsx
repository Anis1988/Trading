import type { Insight, Market } from '../lib/insightTypes';
import { HEALTH_LABEL, analystText, earningsText, healthText, insiderText } from '../lib/insightTypes';
import { Change, Sparkline } from './ui';
import { EARNINGS_SOON_DAYS } from '../lib/concentration';

export function EarningsBadge({ e }: { e?: Insight['earnings'] }) {
  if (!e || e.inDays < 0 || e.inDays > 14) return null;
  const soon = e.inDays <= EARNINGS_SOON_DAYS;
  return (
    <span title={earningsText(e)} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${soon ? 'border-amber-300/50 bg-amber-400/15 text-amber-200' : 'border-white/15 text-slate-300'}`}>
      ◷ Earnings {e.inDays <= 0 ? 'today' : e.inDays === 1 ? 'tomorrow' : `in ${e.inDays}d`}
    </span>
  );
}

export function InsightLines({ i }: { i?: Insight }) {
  if (!i) return null;
  const b = i.basics;
  const parts = [
    b?.pe ? `P/E ${b.pe}` : '',
    b?.divYield ? `dividend ${b.divYield}%` : '',
    b?.low52 && b?.high52 ? `52-week $${b.low52}–$${b.high52}` : '',
  ].filter(Boolean);
  return (
    <div className="space-y-0.5 text-xs text-slate-400">
      {i.earnings && i.earnings.inDays >= 0 && <p>{earningsText(i.earnings)}</p>}
      {i.analysts && (
        <div className="flex items-center gap-2">
          <span>{analystText(i.analysts)}</span>
          <AnalystBar a={i.analysts} />
        </div>
      )}
      {i.health && (
        <p>
          <span className={`font-semibold ${i.health.label === 'strong' ? 'text-emerald-300' : i.health.label === 'weak' ? 'text-red-300' : 'text-amber-200'}`}>{i.health.label === 'strong' ? '▲' : i.health.label === 'weak' ? '▼' : '◆'} {HEALTH_LABEL[i.health.label]}</span>
          {healthText(i.health).replace(HEALTH_LABEL[i.health.label], '')}
        </p>
      )}
      {i.insiders && (i.insiders.bought > 0 || i.insiders.sold > 0) && <p className={i.insiders.bought > 0 ? 'text-emerald-200/90' : ''}>👔 {insiderText(i.insiders)}</p>}
      {parts.length > 0 && <p>{parts.join(' · ')}</p>}
    </div>
  );
}

function AnalystBar({ a }: { a: NonNullable<Insight['analysts']> }) {
  const t = a.buy + a.hold + a.sell || 1;
  return (
    <span className="flex h-1.5 w-20 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
      <span className="bg-emerald-400" style={{ width: `${(a.buy / t) * 100}%` }} />
      <span className="bg-slate-400" style={{ width: `${(a.hold / t) * 100}%` }} />
      <span className="bg-red-400" style={{ width: `${(a.sell / t) * 100}%` }} />
    </span>
  );
}

const TREND = {
  up: { label: 'Rising', icon: '▲', cls: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200' },
  down: { label: 'Falling', icon: '▼', cls: 'border-red-300/50 bg-red-400/15 text-red-200' },
  mixed: { label: 'Sideways', icon: '◆', cls: 'border-amber-300/50 bg-amber-400/15 text-amber-200' },
} as const;

export function MarketCard({ m }: { m: Market }) {
  const t = TREND[m.trend];
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between">
        <p className="label">Market · S&amp;P 500</p>
        <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold tracking-wider ${t.cls}`}>{t.icon} {t.label}</span>
      </div>
      <Sparkline values={m.closes} height={44} label="S&P 500, last 3 months" />
      <p className="text-xs text-slate-400">1 month <Change pct={m.ret1m} /> · 3 months <Change pct={m.ret3m} /></p>
      {m.trend === 'down' && <p className="text-xs text-red-200">While the market falls, new BUY signals are held as WAIT.</p>}
    </section>
  );
}
