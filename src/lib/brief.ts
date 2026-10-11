import type { Market } from './insightTypes';

/**
 * ☀️ Morning brief: made by the server on weekdays before the market opens (netlify/functions/brief.ts), sent as a phone
 * notification and email, and shown on Today. Free: no AI.
 */
export interface Brief {
  at: string; // when it was made
  day: string; // YYYY-MM-DD in New York
  market?: { trend: Market['trend']; ret1m: number };
  level: string; // "⚖️ Balanced", "🔄 Auto → 🛡️ Careful (market falling)"
  last?: { value: number; change: number; pct: number }; // your stocks on the last trading day
  movers: { symbol: string; pct: number; dollars: number }[]; // biggest moves among your stocks
  earnings: { symbol: string; inDays: number; text: string }[]; // in the next 7 days (yours and your watchlist)
  buys: { symbol: string; price: number; owned: boolean; idea: string }[]; // BUY now (yours and your watchlist)
  stops: { symbol: string; price: number; stop: number; away: number }[]; // at or close to your stop-loss
  alerts: { symbol: string; price: number; target: number; away: number }[]; // price alerts within 3%
}

const money = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const pct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`;
const MOOD: Record<Market['trend'], string> = { up: 'rising', down: 'falling', mixed: 'no clear direction' };

/** One short line for the phone notification. */
export function briefLine(b: Brief): string {
  return [
    b.market ? `Market ${MOOD[b.market.trend]}` : '',
    b.last ? `you ${money(b.last.change)} last day` : '',
    b.stops.length ? `🛑 ${b.stops.length} near stop` : '',
    b.earnings.length ? `${b.earnings.length} earnings this week` : '',
    b.buys.length ? `${b.buys.length} BUY idea${b.buys.length > 1 ? 's' : ''}` : 'no BUY today',
  ].filter(Boolean).join(' · ');
}

/** The full text (email). */
export function briefText(b: Brief, site = ''): string {
  return [
    'Good morning. Your brief before the market opens:',
    '',
    `Market: ${b.market ? `${MOOD[b.market.trend]} (S&P 500 ${pct(b.market.ret1m)} this month)` : 'not available'}. How careful: ${b.level}.`,
    b.last ? `Your stocks on the last trading day: ${money(b.last.change)} (${pct(b.last.pct)}), worth $${Math.round(b.last.value).toLocaleString('en-US')}.` : '',
    ...b.movers.map((m) => `- ${m.symbol} ${pct(m.pct)} (${money(m.dollars)})`),
    '',
    b.stops.length ? 'Stop-loss watch:' : 'Stop-loss watch: nothing close.',
    ...b.stops.map((s) => `- ${s.symbol} $${s.price}: ${s.away <= 0 ? 'BELOW' : `${s.away}% above`} your stop $${s.stop}`),
    b.alerts.length ? 'Price alerts close to firing:' : '',
    ...b.alerts.map((a) => `- ${a.symbol} $${a.price}, ${a.away}% from your $${a.target} alert`),
    b.earnings.length ? 'Earnings in the next 7 days (prices can jump either way):' : 'Earnings: none of your stocks this week.',
    ...b.earnings.map((e) => `- ${e.symbol}: ${e.text}`),
    '',
    b.buys.length ? 'BUY now (your stocks and watchlist):' : 'BUY now: nothing passes your rules today. Waiting is fine.',
    ...b.buys.map((x) => `- ${x.symbol} about $${x.price}${x.owned ? ' (add more)' : ''}: ${x.idea}`),
    '',
    `Ideas only, not advice: the app never places orders. You decide and trade in Fidelity${site ? `. Open the app: ${site}` : '.'}`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
