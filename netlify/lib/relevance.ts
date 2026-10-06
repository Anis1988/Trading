import { readServer, writeServer } from './state';

/** What a ticker is, so headlines can be checked against it. */
export interface Profile { name?: string; etf?: boolean; at: number }

const UA = 'Mozilla/5.0 (compatible; TradingAssistant/1.0; +https://www.netlify.com)';
const MONTH = 30 * 86400_000;

// Names people use in headlines that differ from the official company name.
const ALIASES: Record<string, string[]> = {
  GOOGL: ['Google'], GOOG: ['Google'], META: ['Facebook', 'Instagram'], 'BRK-B': ['Berkshire'], 'BRK.B': ['Berkshire'],
};
const SUFFIX = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|sa|nv|ag|se|class [a-c]|common stock|the)\b\.?/gi;
const GENERIC = new Set(['bank', 'first', 'american', 'general', 'united', 'international', 'national', 'global', 'new', 'royal']);

/** Words that identify a company in a headline: "Apple Inc." -> ["Apple"], "Bank of America Corp" -> ["Bank of America"]. */
export function nameKeys(symbol: string, name?: string): string[] {
  const keys = [...(ALIASES[symbol] ?? [])];
  const clean = (name ?? '').replace(/[,.]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
  if (clean) {
    const first = clean.split(' ')[0];
    keys.push(first.length >= 3 && !GENERIC.has(first.toLowerCase()) ? first : clean);
  }
  return keys;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Is this headline really about this ticker? News feeds searched for "VTI" also return general market stories
 * about other companies, which must not count as VTI news. Funds (ETFs) only count when the ticker is named.
 * Unknown profile (lookup failed) keeps the headline, as before.
 */
export function isAbout(title: string, symbol: string, p: Profile | null | undefined): boolean {
  if (!p) return true;
  const t = esc(symbol);
  const ticker = symbol.length >= 3
    ? new RegExp(`(^|[^A-Za-z0-9])\\$?${t}([^A-Za-z0-9]|$)`)
    : new RegExp(`\\$${t}\\b|[(:]\\s*${t}\\)|\\b${t} (stock|shares)\\b`);
  if (ticker.test(title)) return true;
  if (p.etf) return false;
  return nameKeys(symbol, p.name).some((k) => new RegExp(`(^|[^A-Za-z0-9])${esc(k)}([^A-Za-z0-9]|$)`, 'i').test(title));
}

async function lookup(symbol: string): Promise<Profile | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const m = ((await res.json()) as any)?.chart?.result?.[0]?.meta;
  if (!m) return null;
  const name = m.shortName || m.longName;
  const type = String(m.instrumentType ?? '').toUpperCase();
  if (!name && !type) return null;
  return { name: name ? String(name).slice(0, 120) : undefined, etf: type === 'ETF' || type === 'MUTUALFUND', at: Date.now() };
}

/** Profiles for these tickers, cached for a month (names rarely change). */
export async function profiles(symbols: string[]): Promise<Record<string, Profile>> {
  const cache = await readServer<Record<string, Profile>>('profiles', {});
  const stale = symbols.filter((s) => !cache[s] || Date.now() - cache[s].at > MONTH);
  if (stale.length) {
    const got = await Promise.all(stale.map((s) => lookup(s).catch(() => null)));
    let changed = false;
    stale.forEach((s, i) => { if (got[i]) (cache[s] = got[i]!, changed = true); });
    if (changed) await writeServer('profiles', cache).catch(() => undefined);
  }
  return cache;
}
