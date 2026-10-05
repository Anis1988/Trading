import { useState } from 'react';
import { useStore } from '../store';
import { useTrends } from '../lib/useTrends';
import { cleanSymbol, uid } from '../lib/util';
import type { AlertStatus } from '../lib/alerts';
import type { PriceAlert } from '../types';

const niceDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One alert row. Also used as the live example in the Guide (pass `price` and `hit`, no `onRemove`). */
export function PriceAlertRow({ a, price, hit, onRemove }: { a: PriceAlert; price?: number; hit?: { at: string; price: number }; onRemove?: () => void }) {
  const away = price ? ((a.price - price) / price) * 100 : null;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span aria-hidden="true">{hit ? '✅' : '🔔'}</span>
      <span className="min-w-0 flex-1">
        <b className="font-display">{a.symbol}</b> {a.op === 'below' ? 'drops to' : 'rises to'} <span className="num">${a.price}</span>
        <span className="block text-xs text-slate-400">
          {hit ? `Hit on ${niceDay(hit.at)} at $${hit.price}. You were notified.` : price ? `Now $${price} · needs a ${Math.abs(away!).toFixed(1)}% ${away! < 0 ? 'drop' : 'rise'}` : 'Checking the price…'}
        </span>
      </span>
      {onRemove && <button className="px-2 text-slate-400 hover:text-red-300" aria-label={`Remove ${a.symbol} alert`} onClick={onRemove}>✕</button>}
    </li>
  );
}

/** "Tell me if NVDA drops to $160". Saved with your settings (synced); the background check sends the alert. */
export function PriceAlerts({ status }: { status: AlertStatus | null }) {
  const { settings, update, toast } = useStore();
  const alerts = settings.priceAlerts ?? [];
  const [sym, setSym] = useState('');
  const [op, setOp] = useState<PriceAlert['op']>('below');
  const [price, setPrice] = useState('');
  const { rows } = useTrends([...new Set(alerts.map((a) => a.symbol))], settings);

  const add = () => {
    const symbol = cleanSymbol(sym);
    const p = Number(price);
    if (!symbol || !(p > 0)) return toast('error', 'Enter a symbol and a price above 0.');
    if (alerts.length >= 20) return toast('error', 'Up to 20 price alerts. Remove one first.');
    update({ priceAlerts: [...alerts, { id: uid(), symbol, op, price: Math.round(p * 100) / 100, createdAt: new Date().toISOString() }] });
    toast('success', `You'll be told when ${symbol} ${op === 'below' ? 'drops to' : 'rises to'} $${p}.`);
    setSym('');
    setPrice('');
  };

  return (
    <section className="card space-y-3">
      <p className="label">Price alerts</p>
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <input className="input w-full min-w-0" placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Symbol" />
        <select className="input w-full min-w-0" value={op} onChange={(e) => setOp(e.target.value as PriceAlert['op'])} aria-label="When">
          <option value="below">drops to</option>
          <option value="above">rises to</option>
        </select>
        <input className="input w-full min-w-0" placeholder="Price $" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Price" />
        <button className="btn-primary" onClick={add}>Add alert</button>
      </div>
      {alerts.length > 0 && (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <PriceAlertRow key={a.id} a={a} price={rows.find((r) => r.symbol === a.symbol)?.price} hit={status?.priceFired?.[a.id]} onRemove={() => update({ priceAlerts: alerts.filter((x) => x.id !== a.id) })} />
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        {settings.serverAlerts
          ? 'Checked once an hour on weekdays (about 7am–7pm New York), even with the app closed. You get an email and/or a phone notification once.'
          : '⚠ Background alerts are off, so nothing will be sent. Turn them on in Settings → Alerts & email.'}
      </p>
    </section>
  );
}
