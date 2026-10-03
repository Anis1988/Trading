export interface ServerHeadline {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  symbol: string;
}

const UA = 'Mozilla/5.0 (compatible; TradingAssistant/1.0; +https://www.netlify.com)';

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .trim();

const tag = (block: string, name: string) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

export function parseRss(xml: string, source: string, symbol: string): ServerHeadline[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: ServerHeadline[] = [];
  for (const it of items.slice(0, 20)) {
    const title = tag(it, 'title');
    if (!title) continue;
    const url = tag(it, 'link');
    const d = new Date(tag(it, 'pubDate'));
    out.push({
      id: `${source}:${url || title}`.slice(0, 300),
      title: title.slice(0, 300),
      url,
      source,
      publishedAt: (isNaN(d.getTime()) ? new Date() : d).toISOString(),
      symbol,
    });
  }
  return out;
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname}: HTTP ${res.status}`);
  return res;
}

export async function yahooNews(symbol: string): Promise<ServerHeadline[]> {
  const res = await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`);
  return parseRss(await res.text(), 'Yahoo Finance', symbol);
}

export async function googleNews(symbol: string): Promise<ServerHeadline[]> {
  const q = encodeURIComponent(`${symbol} stock when:2d`);
  const res = await get(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`);
  return parseRss(await res.text(), 'Google News', symbol);
}

export async function finnhubNews(symbol: string, key: string): Promise<ServerHeadline[]> {
  const to = new Date();
  const from = new Date(Date.now() - 2 * 86400_000);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const res = await get(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${f(from)}&to=${f(to)}`, { 'X-Finnhub-Token': key });
  const arr = (await res.json()) as Array<{ id: number; headline: string; url: string; source: string; datetime: number }>;
  return arr.slice(0, 20).map((a) => ({
    id: `finnhub:${a.id}`,
    title: String(a.headline).slice(0, 300),
    url: String(a.url),
    source: String(a.source || 'Finnhub'),
    publishedAt: new Date(a.datetime * 1000).toISOString(),
    symbol,
  }));
}

export interface Quote {
  price: number;
  prevClose: number;
  changePct: number;
  closes: number[]; // last ~5 daily closes, oldest first
  currency?: string;
}

/** Yahoo chart endpoint (no key). Returns null when the symbol is unknown/unavailable. */
export async function yahooQuote(symbol: string): Promise<Quote | null> {
  const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`);
  const j = (await res.json()) as any;
  const r = j?.chart?.result?.[0];
  const price = r?.meta?.regularMarketPrice;
  if (typeof price !== 'number') return null;
  const closes: number[] = (r.indicators?.quote?.[0]?.close ?? []).filter((c: unknown): c is number => typeof c === 'number');
  const prevClose: number = r.meta.chartPreviousClose ?? closes[closes.length - 2] ?? price;
  return {
    price,
    prevClose,
    changePct: prevClose ? Math.round(((price - prevClose) / prevClose) * 10000) / 100 : 0,
    closes: closes.slice(-5),
    currency: r.meta.currency,
  };
}

export interface History {
  dates: string[]; // YYYY-MM-DD
  closes: number[];
  currency?: string;
}

/** ~6 months of daily closes from Yahoo's chart endpoint (no key). */
export async function yahooHistory(symbol: string): Promise<History | null> {
  const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`);
  const j = (await res.json()) as any;
  const r = j?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const cl: Array<number | null> = r?.indicators?.quote?.[0]?.close ?? [];
  const dates: string[] = [];
  const closes: number[] = [];
  ts.forEach((t, i) => {
    const c = cl[i];
    if (typeof c === 'number' && isFinite(c)) {
      dates.push(new Date(t * 1000).toISOString().slice(0, 10));
      closes.push(Math.round(c * 100) / 100);
    }
  });
  return closes.length >= 30 ? { dates, closes, currency: r?.meta?.currency } : null;
}
