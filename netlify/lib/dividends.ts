import { fromNasdaq, fromYahoo, type DivInfo } from '../../src/lib/dividends';
import { readServer, writeServer } from './state';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TTL = 12 * 3600_000;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...headers }, signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  return res.json();
}

/** Nasdaq first (announced ex/pay dates, yearly rate), stocks then funds; else Yahoo's past payments. */
async function load(symbol: string): Promise<DivInfo> {
  const nasdaq = { Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
  for (const cls of ['stocks', 'etf']) {
    try {
      const i = fromNasdaq(symbol, await getJson(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?assetclass=${cls}`, nasdaq));
      if (i) return i;
    } catch { /* try the next source */ }
  }
  const y = fromYahoo(symbol, await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1mo&events=div`));
  if (!y) throw new Error('no data');
  return y;
}

/** Dividend info per symbol, each kept 12 hours (dates rarely change faster). */
export async function getDividends(symbols: string[]): Promise<{ info: Record<string, DivInfo>; errors: string[] }> {
  let store: Record<string, { at: number; v: DivInfo }> = {};
  try { store = await readServer('dividend-cache', {}); } catch { /* local dev: no storage */ }
  const info: Record<string, DivInfo> = {};
  const errors: string[] = [];
  let changed = false;
  await Promise.all(symbols.map(async (s) => {
    const hit = store[s];
    if (hit && Date.now() - hit.at < TTL) return void (info[s] = hit.v);
    try {
      info[s] = await load(s);
      store[s] = { at: Date.now(), v: info[s] };
      changed = true;
    } catch (e) {
      if (hit) info[s] = hit.v; // an older answer beats none
      else errors.push(`${s}: ${e instanceof Error ? e.message : e}`);
    }
  }));
  if (changed) {
    const fresh = Object.fromEntries(Object.entries(store).filter(([, x]) => Date.now() - x.at < 7 * 86400_000).slice(-150));
    await writeServer('dividend-cache', fresh).catch(() => undefined);
  }
  return { info, errors };
}
