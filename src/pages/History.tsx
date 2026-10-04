import { useState } from 'react';
import { useStore } from '../store';
import { historyToCsv } from '../lib/csv';
import { download } from '../lib/storage';
import type { HistoryItem, HistoryStatus } from '../types';
import { Scoreboard } from '../components/Scoreboard';

// Distinct colour per status (the text label is always shown too, never colour alone).
const STATUS: Record<HistoryStatus, { label: string; border: string; badge: string; active: string }> = {
  pending: { label: 'Pending', border: 'before:bg-amber-400', badge: 'border-amber-300/50 bg-amber-400/15 text-amber-200', active: 'border-amber-300/60 bg-amber-400/20 text-amber-100' },
  executed: { label: 'Executed', border: 'before:bg-emerald-400', badge: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200', active: 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100' },
  cancelled: { label: 'Cancelled', border: 'before:bg-slate-500', badge: 'border-slate-300/30 bg-slate-400/10 text-slate-300', active: 'border-slate-300/50 bg-slate-400/20 text-slate-100' },
  failed: { label: 'Failed', border: 'before:bg-red-400', badge: 'border-red-300/50 bg-red-400/15 text-red-200', active: 'border-red-300/60 bg-red-400/20 text-red-100' },
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

      <div className="mb-4"><Scoreboard /></div>

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
            <div key={h.id} className={`card relative overflow-hidden text-sm before:absolute before:inset-y-0 before:left-0 before:w-1 ${st.border} ${h.status === 'cancelled' ? 'opacity-75' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <b className={`font-display ${h.status === 'cancelled' ? 'line-through' : ''}`}>{h.side} <span className="num">{h.qty}</span> {h.symbol}</b>
                <span>{h.orderType}{h.limitPrice ? ` @ ${h.limitPrice}` : ''}</span>
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">{h.channel}</span>
                <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${st.badge}`}>{st.label}</span>
                <span className="ml-auto text-xs text-slate-500">{new Date(h.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 break-words text-slate-400">{h.reason} ({(h.confidence * 100).toFixed(0)}%)</p>
              {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
              {h.status === 'executed' && (
                <p className="mt-1 text-xs text-emerald-400">Order {h.orderId} @ {h.executedPrice}{h.executedAt ? ` — ${new Date(h.executedAt).toLocaleString()}` : ''}</p>
              )}

              {editing === h.id ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="input" placeholder="Order id" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
                  <input className="input" placeholder="Executed price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <button className="btn-primary" onClick={() => saveExecuted(h)}>Save executed</button>
                  <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-1" role="group" aria-label="Set status">
                    {(['pending', 'executed', 'cancelled'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => (h.status === s && s !== 'executed' ? undefined : setStatus(h, s))}
                        className={`min-h-[40px] rounded-xl border px-2 text-xs font-medium transition active:scale-95 ${h.status === s ? STATUS[s].active : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                      >
                        {h.status === s && s === 'executed' ? '✎ Edit executed' : STATUS[s].label}
                      </button>
                    ))}
                  </div>
                  <button className="text-xs text-red-300 underline" onClick={() => remove(h)}>Delete this entry</button>
                </div>
              )}
            </div>
          );
        }) : <p className="text-sm text-slate-500">{items.length ? 'Nothing with this status.' : 'No instructions yet. Emailing or copying a signal creates an entry.'}</p>}
      </div>
    </div>
  );
}
