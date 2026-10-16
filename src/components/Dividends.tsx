import { useEffect, useState } from 'react';
import type { Holding } from '../lib/holdings';
import { fetchDividends } from '../lib/api';
import { OFTEN, nextDay, yearlyIncome, type DivInfo } from '../lib/dividends';
import { Skeleton, fmtMoney } from './ui';

const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const today = () => new Date().toISOString().slice(0, 10);

// Kept for this visit: dividend dates change slowly (the server keeps them 12 hours too).
let memo: { key: string; at: number; v: Record<string, DivInfo>; errors: string[] } | null = null;

/** Loads the dividend info for what you own. */
export function useDividends(symbols: string[]) {
  const key = [...symbols].sort().join(',');
  const [state, setState] = useState<{ info: Record<string, DivInfo> | null; errors: string[]; loading: boolean }>(() => memo?.key === key ? { info: memo.v, errors: memo.errors, loading: false } : { info: null, errors: [], loading: !!key });
  useEffect(() => {
    if (!key || (memo?.key === key && Date.now() - memo.at < 3600_000)) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fetchDividends(key.split(','))
      .then((r) => { memo = { key, at: Date.now(), v: r.info, errors: r.errors }; if (live) setState({ info: r.info, errors: r.errors, loading: false }); })
      .catch((e) => live && setState({ info: null, errors: [e instanceof Error ? e.message : String(e)], loading: false }));
    return () => { live = false; };
  }, [key]);
  return state;
}

/** 💵 Dividend calendar card (Today). Also drawn in the Guide with made-up data. */
export function DividendCard({ holdings, info, loading, errors = [] }: { holdings: Holding[]; info: Record<string, DivInfo> | null; loading?: boolean; errors?: string[] }) {
  const [all, setAll] = useState(false);
  if (!holdings.length) return null;
  if (!info) {
    return (
      <section className="card space-y-2">
        <p className="label">💵 Dividends</p>
        {loading ? <><Skeleton className="h-8 w-40" /><Skeleton className="h-4" /><Skeleton className="h-4 w-3/4" /></> : <p className="text-sm text-slate-400">Dividend dates could not load right now{errors[0] ? ` (${errors[0]})` : ''}.</p>}
      </section>
    );
  }
  const year = yearlyIncome(holdings, info);
  const payers = holdings.filter((h) => info[h.symbol]?.pays).sort((a, b) => nextDay(info[a.symbol]).localeCompare(nextDay(info[b.symbol])));
  const none = holdings.filter((h) => info[h.symbol] && !info[h.symbol].pays).map((h) => h.symbol);
  const unknown = holdings.filter((h) => !info[h.symbol]).map((h) => h.symbol);
  const shown = all ? payers : payers.slice(0, 4);
  const sources = [...new Set(holdings.map((h) => info[h.symbol]?.source).filter(Boolean))];
  const t = today();
  return (
    <section className="card space-y-3">
      <p className="label">💵 Dividends</p>
      {payers.length ? (
        <div>
          <p className="num text-3xl font-semibold text-slate-50">≈ {fmtMoney(year)}<span className="ml-1 text-sm font-normal text-slate-400">a year</span></p>
          <p className="text-xs text-slate-400">About {fmtMoney(year / 12)} a month, before tax, if the companies keep paying the same.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-300">None of your stocks pays a dividend right now.</p>
      )}
      {shown.length > 0 && (
        <ul className="divide-y divide-white/5">
          {shown.map((h) => {
            const i = info[h.symbol];
            const n = i.next;
            const exPassed = n && n.exDate < t;
            return (
              <li key={h.symbol} className="py-2 text-sm">
                <div className="flex items-baseline gap-2">
                  <b className="font-display">{h.symbol}</b>
                  {n?.estimated && <span className="rounded-md border border-white/15 px-1 text-[10px] uppercase tracking-wider text-slate-400">estimate</span>}
                  <span className="num ml-auto text-slate-200">{n ? `+${fmtMoney(n.amount * h.shares)}` : ''}</span>
                </div>
                {n ? (
                  <p className="text-xs text-slate-400">
                    {exPassed ? <>You qualified (ex-date {nice(n.exDate)}) · paid <b className="text-slate-200">{nice(n.payDate!)}</b></> : <>Own it before <b className="text-slate-200">{nice(n.exDate)}</b> (ex-date){n.payDate ? <> · paid {nice(n.payDate)}</> : ''}</>}
                    {' '}· ${n.amount.toFixed(2)}/share
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">Next date not known yet.</p>
                )}
                <p className="text-[11px] text-slate-500">${i.annual.toFixed(2)}/share a year{i.perYear ? `, ${OFTEN[i.perYear] ?? `${i.perYear}× a year`}` : ''}{i.yieldPct ? ` · yield ${i.yieldPct}%` : ''} · you: {fmtMoney(i.annual * h.shares)}/year</p>
              </li>
            );
          })}
        </ul>
      )}
      {payers.length > 4 && <button className="btn-ghost !px-1 text-xs" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${payers.length}`}</button>}
      {none.length > 0 && <p className="text-xs text-slate-400">No dividend: {none.join(', ')}.</p>}
      {unknown.length > 0 && <p className="text-xs text-slate-500">No dividend data for {unknown.join(', ')}.</p>}
      <p className="text-[11px] text-slate-500">
        From {sources.join(' and ') || 'Nasdaq / Yahoo Finance'}. Dates can change until the company announces them; “estimate” = guessed from past payments. To get a payment you must own the shares before the ex-date.
      </p>
    </section>
  );
}
