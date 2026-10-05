import type { PriceAlert, ScoreEntry, Settings } from '../../src/types';
import { analyze } from '../../src/lib/trend';
import { buyWait, type WaitRule } from '../../src/lib/waitRules';
import { yahooHistory, yahooQuote } from './feeds';
import { getInsights, getMarket } from './insights';
import { readServer, writeServer } from './state';

export type Notify = (title: string, body: string) => Promise<boolean>;
export type Say = (level: 'info' | 'warn' | 'error', msg: string) => void;

export interface PriceHit { at: string; price: number }
export interface BackOn { symbol: string; rule: string; at: string; price: number; text: string; waitAt: string }

/** Price alerts the user set ("tell me if NVDA drops to $160"). Each one fires once; the server remembers which. */
export async function checkPriceAlerts(alerts: PriceAlert[], notify: Notify, say: Say): Promise<number> {
  const fired = await readServer<Record<string, PriceHit>>('priceFired', {});
  const open = alerts.filter((a) => !fired[a.id]).slice(0, 20);
  let n = 0;
  if (open.length) {
    const prices = new Map<string, number | null>();
    await Promise.all([...new Set(open.map((a) => a.symbol))].map(async (sym) => prices.set(sym, (await yahooQuote(sym).catch(() => null))?.price ?? null)));
    for (const a of open) {
      const p = prices.get(a.symbol);
      if (!p) continue;
      if (a.op === 'below' ? p > a.price : p < a.price) continue;
      const body = `${a.symbol} is now $${p}, ${a.op === 'below' ? 'at or below' : 'at or above'} your $${a.price} alert. Just a price alert, not advice: open the app to see what it says.`;
      if (await notify(`🔔 ${a.symbol} ${a.op === 'below' ? 'dropped to' : 'reached'} $${a.price}`, body)) {
        fired[a.id] = { at: new Date().toISOString(), price: p };
        say('info', `Price alert: ${body}`);
        n++;
      }
    }
  }
  // Forget alerts the user deleted.
  const ids = new Set(alerts.map((a) => a.id));
  await writeServer('priceFired', Object.fromEntries(Object.entries(fired).filter(([id]) => ids.has(id))));
  return n;
}

const CLEARED: Record<WaitRule, string> = {
  earnings: 'Earnings are done.',
  market: 'The market stopped falling.',
  'reddit-bad': 'The bad buzz on Reddit has calmed down.',
  'reddit-hype': 'The Reddit hype has cooled off.',
  weak: 'Company finances no longer look weak.',
};
const RULES = new Set(Object.keys(CLEARED));
const WATCH_DAYS = 14;
export const BACK_ON_EVERY_MS = 3600_000;

/**
 * "Tell me when a WAIT turns into a BUY": stocks held back by a free rule in the last 14 days
 * (alerts, stock tiles, Ideas) are re-checked hourly; when the reason is gone and the trend is still good, notify once.
 */
export async function checkBackOn(s: Partial<Settings>, scoreLog: ScoreEntry[], notify: Notify, say: Say): Promise<number> {
  const since = new Date(Date.now() - WATCH_DAYS * 86400_000).toISOString();
  const latest = new Map<string, ScoreEntry>();
  for (const e of scoreLog) {
    if (e.side !== 'BUY' || e.verdict !== 'CAUTION' || !e.why || !RULES.has(e.why) || e.createdAt < since) continue;
    const cur = latest.get(e.symbol);
    if (!cur || e.createdAt > cur.createdAt) latest.set(e.symbol, e);
  }
  const done = await readServer<BackOn[]>('backOn', []);
  const todo = [...latest.values()].filter((e) => !done.some((d) => d.symbol === e.symbol && d.waitAt >= e.createdAt)).slice(0, 10);
  if (!todo.length) return 0;

  const [market, info] = await Promise.all([getMarket(), getInsights(todo.map((e) => e.symbol)).catch(() => ({}) as Awaited<ReturnType<typeof getInsights>>)]);
  let n = 0;
  for (const e of todo) {
    const hist = await yahooHistory(e.symbol).catch(() => null);
    const owned = s.holdings?.find((h) => h.symbol === e.symbol);
    const a = hist ? analyze(e.symbol, hist.closes, owned) : null;
    if (!a) continue;
    const good = owned ? a.action === 'BUY' : a.ideaKind === 'buy';
    if (!good || buyWait({ info: info[e.symbol], market, ret1m: a.ret1m, rsi: a.rsi })) continue;
    const text = `${CLEARED[e.why as WaitRule]} The trend still looks good, so BUY is back on at about $${a.price}. Open the app to check it.`;
    if (await notify(`✅ ${e.symbol}: BUY is back on`, text)) {
      done.unshift({ symbol: e.symbol, rule: e.why!, at: new Date().toISOString(), price: a.price, text, waitAt: e.createdAt });
      say('info', `${e.symbol}: back on BUY. ${text}`);
      n++;
    }
  }
  await writeServer('backOn', done.slice(0, 30));
  return n;
}
