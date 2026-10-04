import { useState } from 'react';
import { useStore } from '../store';
import { historyToCsv } from '../lib/csv';
import { download } from '../lib/storage';
import type { HistoryItem, HistoryStatus } from '../types';
import { Scoreboard } from '../components/Scoreboard';

// Distinct colour per status (the text label is always shown too, never colour alone).
const STATUS: Record<HistoryStatus, { label: string; border: string; badge: string; active: string; idle: string; dot: string }> = {
  pending: { label: 'Pending', border: 'before:bg-amber-400', badge: 'border-amber-300/50 bg-amber-400/15 text-amber-200', active: 'border-amber-300/60 bg-amber-400/20 text-amber-100', idle: 'text-amber-200/70 hover:bg-amber-400/10', dot: 'bg-amber-400' },
  executed: { label: 'Executed', border: 'before:bg-emerald-400', badge: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200', active: 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100', idle: 'text-emerald-200/70 hover:bg-emerald-400/10', dot: 'bg-emerald-400' },
  cancelled: { label: 'Cancelled', border: 'before:bg-slate-500', badge: 'border-slate-300/30 bg-slate-400/10 text-slate-300', active: 'border-slate-300/50 bg-slate-400/20 text-slate-100', idle: 'text-slate-400 hover:bg-white/5', dot: 'bg-slate-400' },
  failed: { label: 'Failed', border: 'before:bg-red-400', badge: 'border-red-300/50 bg-red-400/15 text-red-200', active: 'border-red-300/60 bg-red-400/20 text-red-100', idle: 'text-red-200/70 hover:bg-red-400/10', dot: 'bg-red-400' },
};
const FILTERS = ['all', 'pending', 'executed', 'cancelled', 'failed'] as const;

export function History() {
  const { history, patchHistory, toast } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [price, setPrice] = useState('');

  const items = history.filter((h) => !h.deleted);
  const shown = filter === 'all' ? items : items.filter((h) => h.status === filter);
  const count = (f: (typeof FILTERS)[number]) => (f === 'all' ? items.length : items.filter((h) => h.status === f).length);

  const openExecuted = (h: HistoryItem) => {
    setEditing(h.id);
    setOrderId(h.orderId ?? '');
    setPrice(h.executedPrice !== undefined ? String(h.executedPrice) : '');
  };

  const saveExecuted = (h: HistoryItem) => {
    const p = Number(price);
    if (!orderId.trim() || !(p > 0)) return toast('error', 'Enter an order id and a positive executed price.');
    patchHistory(h.id, { status: 'executed', orderId: orderId.trim(), executedPrice: p, executedAt: h.executedAt ?? new Date().toISOString() });
    setEditing(null);
    toast('success', `${h.symbol} marked executed.`);
  };

  const setStatus = (h: HistoryItem, status: HistoryStatus) => {
    if (status === 'executed') return openExecuted(h);
    // Leaving "executed" clears the fill details so they cannot be mistaken for a real order.
    patchHistory(h.id, { status, orderId: undefined, executedPrice: undefined, executedAt: undefined });
    setEditing(null);
    toast('info', `${h.symbol} set to ${STATUS[status].label.toLowerCase()}.`);
  };

  const remove = (h: HistoryItem) => {
    if (!window.confirm(`Delete this ${h.side} ${h.qty} ${h.symbol} entry from History? This cannot be undone.`)) return;
    patchHistory(h.id, { deleted: true });
    toast('success', `${h.symbol} entry deleted.`);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">History <span className="num text-base text-slate-400">{items.length}</span></h2>
        <button className="btn" onClick={() => download(`history-${Date.now()}.csv`, historyToCsv(items), 'text/csv')}>Export CSV</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px] xl:items-start">
      <div className="order-2 xl:order-1">

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${filter === f ? (f === 'all' ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : STATUS[f].active) : 'border-white/15 text-slate-300'}`}
          >
            {f === 'all' ? 'All' : STATUS[f].label} · {count(f)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.length ? shown.map((h) => {
          const st = STATUS[h.status];
          return (
            <div key={h.id} className={`card relative overflow-hidden !p-3 text-sm before:absolute before:inset-y-0 before:left-0 before:w-1 sm:!p-4 ${st.border} ${h.status === 'cancelled' ? 'opacity-80' : ''}`}>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <b className={`font-display text-base ${h.status === 'cancelled' ? 'line-through' : ''}`}>{h.side} <span className="num">{h.qty}</span> {h.symbol}</b>
                    <span className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.badge}`}>{st.label}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(h.createdAt).toLocaleString()} · {h.orderType}{h.limitPrice ? ` @ ${h.limitPrice}` : ''} · {h.channel}
                  </p>
                  <p className="mt-1.5 break-words text-slate-300">{h.reason}</p>
                  {h.note && <p className="mt-1 text-xs text-slate-500">{h.note}</p>}
                  {h.status === 'executed' && (
                    <p className="mt-1 text-xs text-emerald-300">Order {h.orderId} @ ${h.executedPrice}{h.executedAt ? ` · ${new Date(h.executedAt).toLocaleDateString()}` : ''}</p>
                  )}
                  {editing === h.id && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <input className="input w-full sm:w-36" placeholder="Order id" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
                      <input className="input w-full sm:w-36" placeholder="Price paid" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                      <button className="btn-primary" onClick={() => saveExecuted(h)}>Save</button>
                      <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  )}
                  <button className="mt-2 text-xs text-slate-500 underline-offset-2 hover:text-red-300 hover:underline" onClick={() => remove(h)}>Delete</button>
                </div>

                {/* Status switches: small, stacked on the right, one colour each */}
                <div className="flex w-[92px] shrink-0 flex-col gap-1.5 self-start" role="group" aria-label="Set status">
                  {(['pending', 'executed', 'cancelled'] as const).map((s) => {
                    const on = h.status === s;
                    return (
                      <button
                        key={s}
                        aria-pressed={on}
                        onClick={() => (on && s !== 'executed' ? undefined : setStatus(h, s))}
                        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition active:scale-95 ${on ? STATUS[s].active : `border-white/10 bg-transparent ${STATUS[s].idle}`}`}
                      >
                        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS[s].dot}`} />
                        {on && s === 'executed' ? 'Edit' : STATUS[s].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }) : <p className="text-sm text-slate-500">{items.length ? 'Nothing with this status.' : 'No instructions yet. Emailing or copying a signal creates an entry.'}</p>}
      </div>
      </div>
      <aside className="order-1 space-y-4 xl:sticky xl:top-20 xl:order-2">
        <Scoreboard />
        <section className="card grid grid-cols-3 gap-2 text-center">
          {(['pending', 'executed', 'cancelled'] as const).map((k) => (
            <div key={k} className="panel !p-2">
              <p className="label !text-[10px]">{STATUS[k].label}</p>
              <p className="num text-xl font-semibold">{count(k)}</p>
            </div>
          ))}
        </section>
      </aside>
      </div>
    </div>
  );
}
