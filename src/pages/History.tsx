import { useState } from 'react';
import { useStore } from '../store';
import { historyToCsv } from '../lib/csv';
import { download } from '../lib/storage';
import type { HistoryItem } from '../types';

export function History() {
  const { history, patchHistory } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [price, setPrice] = useState('');

  const markExecuted = (h: HistoryItem) => {
    const p = Number(price);
    if (!orderId.trim() || !(p > 0)) return alert('Enter an order id and a positive executed price.');
    patchHistory(h.id, { status: 'executed', orderId: orderId.trim(), executedPrice: p, executedAt: new Date().toISOString() });
    setEditing(null);
    setOrderId('');
    setPrice('');
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">History / audit trail ({history.length})</h2>
        <button className="btn" onClick={() => download(`history-${Date.now()}.csv`, historyToCsv(history), 'text/csv')}>Export CSV</button>
      </div>
      <div className="space-y-2">
        {history.length ? history.map((h) => (
          <div key={h.id} className="card text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <b>{h.side} {h.qty} {h.symbol}</b>
              <span>{h.orderType}{h.limitPrice ? ` @ ${h.limitPrice}` : ''}</span>
              <span className="rounded bg-slate-800 px-2 text-xs">{h.channel}</span>
              <span className={`rounded px-2 text-xs ${h.status === 'executed' ? 'bg-emerald-800' : h.status === 'failed' ? 'bg-red-800' : 'bg-slate-700'}`}>{h.status}</span>
              <span className="ml-auto text-xs text-slate-500">{new Date(h.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-1 break-words text-slate-400">{h.reason} ({(h.confidence * 100).toFixed(0)}%)</p>
            {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
            {h.status === 'executed' && <p className="text-xs text-emerald-400">Order {h.orderId} @ {h.executedPrice} — {h.executedAt && new Date(h.executedAt).toLocaleString()}</p>}
            {h.status === 'pending' && (editing === h.id ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <input className="input" placeholder="Order id" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
                <input className="input" placeholder="Executed price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
                <button className="btn-primary" onClick={() => markExecuted(h)}>Save</button>
                <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button className="btn" onClick={() => setEditing(h.id)}>Mark executed</button>
                <button className="btn" onClick={() => patchHistory(h.id, { status: 'cancelled' })}>Cancel instruction</button>
              </div>
            ))}
          </div>
        )) : <p className="text-sm text-slate-500">No instructions yet. Emailing or copying a signal creates an entry.</p>}
      </div>
    </div>
  );
}
