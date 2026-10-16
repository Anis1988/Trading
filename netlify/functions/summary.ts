import type { Settings } from '../../src/types';
import { resolveRules } from '../../src/lib/strictness';
import { cached, aiUsage, estimateCall, modelName, readAiDays, reviewModel } from '../lib/aiBudget';
import { buyNow, nyDay } from '../lib/briefCore';
import { getDividends } from '../lib/dividends';
import { yahooHistory, type History } from '../lib/feeds';
import { getInsights, getMarket } from '../lib/insights';
import { readState } from '../lib/state';

export const config = { path: '/api/summary' };

/**
 * 📊 GET /api/summary → a short read-only status for the owner's "My apps" page (LifeTracker's apps.html):
 * portfolio today, BUY signals now, the next earnings or dividend, and what the paid AI cost today / this week / this month.
 * Needs the header X-Access-Token = APP_ACCESS_TOKEN (the same access token the app asks for in Settings → Sync & access).
 * Only https://anis1988.github.io may call it from a browser. Free (no AI); cached 10 minutes.
 */
const ALLOWED = 'https://anis1988.github.io';
const hits: number[] = [];

function reply(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', ...(origin === ALLOWED ? { 'Access-Control-Allow-Origin': ALLOWED } : {}) },
  });
}
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};
const within = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

interface Line { icon: string; text: string; tone: 'good' | 'warn' | 'info' }

export default async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: origin === ALLOWED ? 204 : 403,
      headers: origin === ALLOWED ? { 'Access-Control-Allow-Origin': ALLOWED, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'X-Access-Token', 'Access-Control-Max-Age': '600', Vary: 'Origin' } : { Vary: 'Origin' },
    });
  }
  if (origin && origin !== ALLOWED && new URL(origin).host !== new URL(req.url).host) return reply({ error: 'This origin may not read the summary.' }, 403, origin);
  if (req.method !== 'GET') return reply({ error: 'GET only' }, 405, origin);
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return reply({ error: 'Set APP_ACCESS_TOKEN in Netlify first: the summary is never open without it.' }, 401, origin);
  if (!same(req.headers.get('x-access-token') ?? '', token)) return reply({ error: 'Missing or wrong access token.' }, 401, origin);
  const now = Date.now();
  while (hits.length && now - hits[0] > 60_000) hits.shift();
  if (hits.length >= 20) return reply({ error: 'Too many requests, try again in a minute.' }, 429, origin);
  hits.push(now);
  try {
    const lines = await cached('summary-cache', 'lines', 10 * 60_000, makeLines);
    return reply({ app: 'trading', lines, ai: await aiSummary(), at: new Date().toISOString() }, 200, origin);
  } catch (e) {
    return reply({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, 502, origin);
  }
};

async function makeLines(): Promise<Line[]> {
  const state = await readState();
  const s = (state?.data.settings ?? {}) as Partial<Settings>;
  const holdings = (s.holdings ?? []).slice(0, 20);
  const watch = (state?.data.watchlist ?? []).filter((x) => !holdings.some((h) => h.symbol === x)).slice(0, 10);
  const symbols = [...holdings.map((h) => h.symbol), ...watch];
  if (!symbols.length) return [{ icon: '💼', text: 'No stocks entered yet', tone: 'info' }];
  const series: Record<string, History> = {};
  const [market, info, divs] = await Promise.all([
    within(getMarket(), 6000, null),
    within(getInsights(symbols), 6000, {} as Awaited<ReturnType<typeof getInsights>>),
    within(getDividends(holdings.map((h) => h.symbol)), 6000, { info: {}, errors: [] } as Awaited<ReturnType<typeof getDividends>>),
    Promise.all(symbols.map(async (sym) => { const h = await within(yahooHistory(sym), 6000, null); if (h) series[sym] = h; })),
  ]);
  const lines: Line[] = [];

  // 1. Portfolio today (last close vs the one before; during market hours Yahoo's last point is today's price).
  let value = 0, change = 0;
  for (const h of holdings) {
    const c = series[h.symbol]?.closes;
    if (!c || c.length < 2) continue;
    const [prev, last] = c.slice(-2);
    value += last * h.shares;
    change += (last - prev) * h.shares;
  }
  if (value > 0) {
    const p = (change / (value - change)) * 100;
    lines.push({ icon: change >= 0 ? '📈' : '📉', text: `Portfolio ${change >= 0 ? '▲' : '▼'} ${pct(p)} today (${change >= 0 ? '+' : '−'}${money(change)}), worth ${money(value)}`, tone: change >= 0 ? 'good' : 'warn' });
  } else if (holdings.length) lines.push({ icon: '💼', text: 'Portfolio: prices not available right now', tone: 'info' });

  // 2. BUY signals now: the same rules as the stock tiles (your 🎚️ level).
  const lv = resolveRules(s, market);
  const buys = buyNow(symbols, holdings, series, info, market, lv.rules);
  lines.push(buys.length
    ? { icon: '🟢', text: `BUY now: ${buys.slice(0, 4).map((b) => b.symbol).join(', ')}${buys.length > 4 ? ` +${buys.length - 4}` : ''}`, tone: 'good' }
    : { icon: '⏸️', text: `No BUY signal now${market?.trend === 'down' ? ' (market falling)' : ''}`, tone: 'info' });

  // 3. What's next: the nearest earnings (3 weeks) and dividend date.
  const earn = symbols.flatMap((sym) => { const e = info[sym]?.earnings; return e && e.inDays >= 0 ? [{ sym, d: e.inDays }] : []; }).sort((a, b) => a.d - b.d)[0];
  const today = nyDay();
  const div = Object.values(divs.info).flatMap((i) => (i.pays && i.next ? [{ sym: i.symbol, ex: i.next.exDate >= today, d: i.next.exDate >= today ? i.next.exDate : i.next.payDate ?? '', est: !!i.next.estimated }] : [])).filter((x) => x.d >= today).sort((a, b) => a.d.localeCompare(b.d))[0];
  const parts = [
    earn ? `${earn.sym} earnings ${earn.d === 0 ? 'today' : earn.d === 1 ? 'tomorrow' : `in ${earn.d} days`}` : '',
    div ? `${div.sym} ${div.ex ? 'ex-dividend' : 'dividend paid'} ${nice(div.d)}${div.est ? ' (est.)' : ''}` : '',
  ].filter(Boolean);
  lines.push(parts.length ? { icon: '🗓️', text: `Next: ${parts.join(' · ')}`, tone: earn && earn.d <= 5 ? 'warn' : 'info' } : { icon: '🗓️', text: 'No earnings or dividend dates coming up', tone: 'info' });
  return lines.slice(0, 3);
}

/** Paid AI (Claude) calls and cost from the per-day history; calls made before the history started are estimated. */
async function aiSummary() {
  const days = await readAiDays().catch(() => ({}) as Awaited<ReturnType<typeof readAiDays>>);
  const d = new Date().toISOString().slice(0, 10); // the AI limit resets at midnight UTC
  const weekFrom = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const monthFrom = `${d.slice(0, 7)}-01`;
  const used = (await aiUsage()).used; // today's counter (older than the history)
  const sum = (from: string) => {
    let calls = 0, usd = 0, est = 0;
    for (const [k, v] of Object.entries(days)) if (k >= from && k <= d) (calls += v.calls, usd += v.usd, est += v.est);
    const missing = Math.max(0, (from <= d ? used : 0) - (days[d]?.calls ?? 0)); // today's calls from before the history began
    calls += missing;
    usd += missing * estimateCall(reviewModel());
    return { calls, usd: Math.round(usd * 100) / 100, est: est + missing };
  };
  const t = sum(d), w = sum(weekFrom), m = sum(monthFrom);
  const byModel = Object.entries(days[d]?.models ?? {}).map(([model, v]) => ({ model: modelName(model), calls: v.calls, usd: Math.round(v.usd * 100) / 100 }));
  const first = Object.keys(days).sort()[0] ?? d;
  return {
    today: { calls: t.calls, usd: t.usd },
    week: { calls: w.calls, usd: w.usd },
    month: { calls: m.calls, usd: m.usd },
    byModel,
    estimate: t.est + w.est + m.est > 0,
    ...(first > monthFrom ? { countingSince: first } : {}), // the history started then: week/month count from that day
  };
}
