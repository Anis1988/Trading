import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

/**
 * 📱 The Android "Portfolio today" home-screen widget (native code: android/…/PortfolioWidget.java, WidgetPlugin.java).
 * The app sends the lines, already in words, each time Today loads prices. Up/down always has a ▲/▼ word, not colour alone.
 */
export interface WidgetData { value: string; change: string; up: boolean; mover: string; at: string }
const Widget = registerPlugin<{ update: (d: WidgetData) => Promise<void> }>('Widget');

const usd = (n: number) => `$${Math.abs(n) >= 1000 ? Math.round(Math.abs(n)).toLocaleString('en-US') : Math.abs(n).toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;

/** The widget's lines from your stocks' last two prices (shared by Today and the Guide's picture). */
export function widgetData(rows: { symbol: string; shares: number; price: number; prevClose: number }[], now = new Date()): WidgetData | null {
  const ok = rows.filter((r) => r.price > 0 && r.prevClose > 0 && r.shares > 0);
  if (!ok.length) return null;
  const value = ok.reduce((s, r) => s + r.shares * r.price, 0);
  const change = ok.reduce((s, r) => s + r.shares * (r.price - r.prevClose), 0);
  const p = value - change > 0 ? (change / (value - change)) * 100 : 0;
  const top = [...ok].map((r) => ({ s: r.symbol, p: ((r.price - r.prevClose) / r.prevClose) * 100 })).sort((a, b) => Math.abs(b.p) - Math.abs(a.p))[0];
  return {
    value: usd(value),
    change: `${change >= 0 ? '▲' : '▼'} ${change >= 0 ? '+' : '−'}${usd(change)} (${pct(p)}) today`,
    up: change >= 0,
    mover: `Top mover: ${top.s} ${top.p >= 0 ? '▲' : '▼'} ${pct(top.p)}`,
    at: `Updated ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
  };
}

let last = '';
export function pushWidget(d: WidgetData | null): void {
  if (!d || !isNative()) return;
  const key = JSON.stringify({ ...d, at: '' });
  if (key === last) return;
  last = key;
  void Widget.update(d).catch(() => undefined);
}
