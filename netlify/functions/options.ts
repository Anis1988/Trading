import { yahooHistory, yahooQuote } from '../lib/feeds';
import { guard, json, parseSymbols } from '../lib/guard';
import { cached } from '../lib/aiBudget';
import { earningsMap } from '../lib/insights';
import { estimateChain, histVol, parseOcc, type Chain, type OptQuote } from '../../src/lib/options';

export const config = { path: '/api/options' };

const UA = 'Mozilla/5.0 (compatible; TradingAssistant/1.0; +https://www.netlify.com)';
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);

/**
 * 🎯 GET /api/options?symbol=AAPL → the option chain the Options helper needs (free, no key):
 * Cboe's delayed quotes (about 15 minutes old, with delta and implied volatility), only dates 5–75 days out and
 * strikes within 35% of the price. If Cboe can't answer, an estimate from the stock's recent moves (marked "estimate").
 * Cached 10 minutes, so opening the screen again costs nothing. Read-only: no orders anywhere.
 */
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'options', 30);
  if (blocked) return blocked;
  const [symbol] = parseSymbols(new URL(req.url).searchParams.get('symbol'), 1);
  if (!symbol) return json({ error: 'Provide ?symbol=AAPL' }, 400);
  try {
    const chain = await cached('options-cache', `${symbol}-${Math.floor(Date.now() / 600_000)}`, 600_000, () => load(symbol));
    return json(chain, 200, { 'Cache-Control': 'private, max-age=300' });
  } catch (e) {
    return json({ error: `${symbol}: ${e instanceof Error ? e.message : e}` }, 502);
  }
};

async function load(symbol: string): Promise<Chain> {
  const earnings = (await earningsMap().catch(() => ({} as Record<string, { date: string }>)))[symbol]?.date ?? null;
  try {
    const c = await cboe(symbol);
    if (c.options.length) return { ...c, earnings };
  } catch { /* fall back to the estimate below */ }
  const [q, h] = await Promise.all([yahooQuote(symbol), yahooHistory(symbol)]);
  if (!q) throw new Error('no price for this symbol');
  const vol = (h && histVol(h.closes)) || 0.3;
  return { ...estimateChain(symbol, q.price, vol), earnings };
}

async function cboe(symbol: string): Promise<Chain> {
  const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol.replace('.', '_'))}.json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`cboe.com: HTTP ${res.status}`);
  const j = (await res.json()) as { timestamp?: string; data?: { current_price?: number; close?: number; options?: Record<string, unknown>[] } };
  const d = j.data;
  let price = num(d?.current_price) ?? num(d?.close);
  if (!price) price = (await yahooQuote(symbol))?.price;
  if (!price) throw new Error('no price');
  const today = Date.now();
  const options: OptQuote[] = [];
  for (const o of d?.options ?? []) {
    const p = parseOcc(String(o.option ?? ''));
    if (!p) continue;
    const days = (Date.parse(`${p.expiry}T20:00:00Z`) - today) / 86400_000;
    if (days < 5 || days > 75 || p.strike < price * 0.65 || p.strike > price * 1.35) continue;
    const bid = num(o.bid) ?? 0, ask = num(o.ask) ?? 0;
    if (!(ask > 0)) continue;
    options.push({ type: p.type, expiry: p.expiry, strike: p.strike, bid, ask, iv: num(o.iv), delta: num(o.delta), oi: num(o.open_interest), vol: num(o.volume) });
  }
  return { symbol, price, asOf: j.timestamp ? new Date(j.timestamp.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(j.timestamp) ? '' : 'Z')).toISOString() : new Date().toISOString(), source: 'cboe', options, note: 'Cboe delayed quotes (about 15 minutes old).' };
}
