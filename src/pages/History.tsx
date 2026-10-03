import { useState } from 'react';
import { useStore } from '../store';
import { historyToCsv } from '../lib/csv';
import { download } from '../lib/storage';
import type { HistoryItem, HistoryStatus } from '../types';

// Distinct colour per status (the text label is always shown too, never colour alone).
const STATUS: Record<HistoryStatus, { label: string; border: string; badge: string; active: string }> = {
  pending: { label: 'Pending', border: 'border-l-amber-500', badge: 'bg-amber-600 text-white', active: 'bg-amber-600 border-amber-500 text-white' },
  executed: { label: 'Executed', border: 'border-l-emerald-500', badge: 'bg-emerald-600 text-white', active: 'bg-emerald-600 border-emerald-500 text-white' },
  cancelled: { label: 'Cancelled', border: 'border-l-slate-500', badge: 'bg-slate-600 text-white', active: 'bg-slate-600 border-slate-400 text-white' },
  failed: { label: 'Failed', border: 'border-l-red-500', badge: 'bg-red-600 text-white', active: 'bg-red-600 border-red-500 text-white' },
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
        <h2 className="font-semibold">History / audit trail ({items.length})</h2>
        <button className="btn" onClick={() => download(`history-${Date.now()}.csv`, historyToCsv(items), 'text/csv')}>Export CSV</button>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${filter === f ? (f === 'all' ? 'border-slate-300 bg-slate-700 text-white' : STATUS[f].active) : 'border-slate-700 text-slate-300'}`}
          >
            {f === 'all' ? 'All' : STATUS[f].label} · {count(f)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.length ? shown.map((h) => {
          const st = STATUS[h.status];
          return (
            <div key={h.id} className={`card border-l-4 text-sm ${st.border} ${h.status === 'cancelled' ? 'opacity-75' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <b className={h.status === 'cancelled' ? 'line-through' : ''}>{h.side} {h.qty} {h.symbol}</b>
                <span>{h.orderType}{h.limitPrice ? ` @ ${h.limitPrice}` : ''}</span>
                <span className="rounded bg-slate-800 px-2 text-xs">{h.channel}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${st.badge}`}>{st.label}</span>
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
                        className={`min-h-[40px] rounded border px-2 text-xs font-medium transition active:scale-95 ${h.status === s ? STATUS[s].active : 'border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                      >
                        {h.status === s && s === 'executed' ? '✎ Edit executed' : STATUS[s].label}
                      </button>
                    ))}
                  </div>
                  <button className="text-xs text-red-400 underline" onClick={() => remove(h)}>Delete this entry</button>
                </div>
              )}
            </div>
          );
        }) : <p className="text-sm text-slate-500">{items.length ? 'Nothing with this status.' : 'No instructions yet. Emailing or copying a signal creates an entry.'}</p>}
      </div>
    </div>
  );
}
