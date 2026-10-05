import { analyze } from '../../src/lib/trend';
import type { Health, Insight, Insiders, Market } from '../../src/lib/insightTypes';
import { yahooHistory } from './feeds';
import { cached } from './aiBudget';
import { getBuzz } from './reddit';

const FINNHUB = 'https://finnhub.io/api/v1';
const day = (d: Date) => d.toISOString().slice(0, 10);

async function finnhub<T>(path: string): Promise<T | null> {
  const key = process.env.FINNHUB_KEY;
  if (!key) return null;
  const res = await fetch(`${FINNHUB}${path}`, { headers: { 'X-Finnhub-Token': key }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`finnhub.io: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** S&P 500 (SPY) trend, the backdrop for every BUY. Cached 1 hour. */
export function getMarket(): Promise<Market | null> {
  return cached('insights-cache', `market-${day(new Date())}-${new Date().getUTCHours()}`, 3600_000, async () => {
    const h = await yahooHistory('SPY');
    const a = h && analyze('SPY', h.closes);
    if (!a) return null;
    const trend: Market['trend'] = a.price > a.sma50 && a.sma20 >= a.sma50 ? 'up' : a.price < a.sma50 && a.sma20 < a.sma50 ? 'down' : 'mixed';
    return { trend, price: a.price, ret1m: a.ret1m, ret3m: a.ret3m, closes: a.closes.slice(-60) };
  }).catch(() => null);
}

/** Upcoming earnings for the next 3 weeks, all US companies in one call. Cached 6 hours. */
async function earningsMap(): Promise<Record<string, { date: string; hour?: string }>> {
  const from = new Date();
  const to = new Date(Date.now() + 21 * 86400_000);
  return cached('insights-cache', `earnings-${day(from)}`, 6 * 3600_000, async () => {
    const j = await finnhub<{ earningsCalendar?: { symbol: string; date: string; hour?: string }[] }>(`/calendar/earnings?from=${day(from)}&to=${day(to)}`);
    const out: Record<string, { date: string; hour?: string }> = {};
    for (const e of j?.earningsCalendar ?? []) if (!out[e.symbol] || e.date < out[e.symbol].date) out[e.symbol] = { date: e.date, hour: e.hour };
    return out;
  }).catch(() => ({}));
}

type Info = Pick<Insight, 'analysts' | 'basics' | 'health' | 'insiders'>;

/** Simple 4-point check of the company's last 12 months. Banks and funds often lack these numbers. */
function health(m: Record<string, number | null>, num: (v: unknown) => number | undefined): Health | undefined {
  const h: Health = {
    label: 'ok',
    revGrowth: num(m.revenueGrowthTTMYoy),
    epsGrowth: num(m.epsGrowthTTMYoy),
    margin: num(m.netProfitMarginTTM),
    debtEq: num(m['totalDebt/totalEquityQuarterly'] ?? m['totalDebt/totalEquityAnnual']),
  };
  const known = [h.revGrowth, h.epsGrowth, h.margin, h.debtEq].filter((v) => v !== undefined).length;
  if (known < 2) return undefined;
  let score = 0;
  if (h.revGrowth !== undefined) score += h.revGrowth >= 5 ? 1 : h.revGrowth < -5 ? -1 : 0;
  if (h.epsGrowth !== undefined) score += h.epsGrowth >= 5 ? 1 : h.epsGrowth < -15 ? -1 : 0;
  if (h.margin !== undefined) score += h.margin >= 10 ? 1 : h.margin < 0 ? -1 : 0;
  if (h.debtEq !== undefined) score += h.debtEq < 0.5 ? 1 : h.debtEq > 2 ? -1 : 0;
  h.label = score >= 2 ? 'strong' : score <= -1 ? 'weak' : 'ok';
  return h;
}

/** Open-market buys (code P) and sells (code S) by company insiders in the last 90 days. */
function insiders(rows: { name: string; change: number; transactionCode: string; transactionPrice: number; transactionDate: string }[]): Insiders {
  const since = day(new Date(Date.now() - 90 * 86400_000));
  const out: Insiders = { bought: 0, sold: 0, buyers: 0 };
  const who = new Set<string>();
  for (const r of rows) {
    if (r.transactionDate < since || !(r.transactionPrice > 0)) continue;
    const value = Math.abs(r.change) * r.transactionPrice;
    if (r.transactionCode === 'P') (out.bought += value), who.add(r.name);
    else if (r.transactionCode === 'S') out.sold += value;
  }
  out.buyers = who.size;
  out.bought = Math.round(out.bought);
  out.sold = Math.round(out.sold);
  return out;
}

/** Analyst ratings, company basics and health, insider trades for one stock. Cached 12 hours. */
function stockInfo(symbol: string): Promise<Info> {
  return cached('insights-cache', `info2-${symbol}-${day(new Date())}`, 12 * 3600_000, async () => {
    const from = day(new Date(Date.now() - 90 * 86400_000));
    const [rec, met, ins] = await Promise.all([
      finnhub<{ period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[]>(`/stock/recommendation?symbol=${encodeURIComponent(symbol)}`).catch(() => null),
      finnhub<{ metric?: Record<string, number | null> }>(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`).catch(() => null),
      finnhub<{ data?: Parameters<typeof insiders>[0] }>(`/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&from=${from}`).catch(() => null),
    ]);
    const r = rec?.[0];
    const m = met?.metric ?? {};
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : undefined);
    return {
      analysts: r && r.strongBuy + r.buy + r.hold + r.sell + r.strongSell > 0 ? { buy: r.strongBuy + r.buy, hold: r.hold, sell: r.sell + r.strongSell, period: r.period } : undefined,
      basics: met
        ? {
            pe: num(m.peTTM ?? m.peBasicExclExtraTTM),
            divYield: num(m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual),
            high52: num(m['52WeekHigh']),
            low52: num(m['52WeekLow']),
            beta: num(m.beta),
          }
        : undefined,
      health: met ? health(m, num) : undefined,
      insiders: ins?.data ? insiders(ins.data) : undefined,
    };
  });
}

export async function getInsights(symbols: string[]): Promise<Record<string, Insight>> {
  const [earnings, buzz] = await Promise.all([earningsMap(), getBuzz(symbols).catch(() => ({}) as Awaited<ReturnType<typeof getBuzz>>)]);
  const today = Date.parse(day(new Date()));
  const out: Record<string, Insight> = {};
  await Promise.all(
    symbols.map(async (s) => {
      const e = earnings[s];
      const info = await stockInfo(s).catch(() => ({}) as Info);
      out[s] = {
        ...info,
        earnings: e ? { date: e.date, hour: e.hour, inDays: Math.round((Date.parse(e.date) - today) / 86400_000) } : undefined,
        buzz: buzz[s],
      };
    }),
  );
  return out;
}

export const EARNINGS_WAIT_DAYS = 5;
