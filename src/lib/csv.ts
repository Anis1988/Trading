import type { HistoryItem } from '../types';

const COLS: (keyof HistoryItem)[] = [
  'id', 'createdAt', 'symbol', 'side', 'qty', 'orderType', 'limitPrice', 'confidence',
  'reason', 'channel', 'status', 'orderId', 'executedPrice', 'executedAt', 'note',
];

function esc(v: unknown): string {
  let s = v === undefined || v === null ? '' : String(v);
  // Neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function historyToCsv(items: HistoryItem[]): string {
  const rows = items.map((h) => COLS.map((c) => esc(h[c])).join(','));
  return [COLS.join(','), ...rows].join('\n');
}
