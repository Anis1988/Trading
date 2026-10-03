import type { Headline } from '../types';

export class SourceError extends Error {
  constructor(message: string, public cors = false) {
    super(message);
  }
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export function parseFeed(xml: string, source: string, symbol?: string): Headline[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new SourceError(`${source}: response was not valid XML/RSS`);
  const out: Headline[] = [];
  const items = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')];
  for (const it of items.slice(0, 25)) {
    const title = it.querySelector('title')?.textContent?.trim();
    if (!title) continue;
    const linkEl = it.querySelector('link');
    const url = linkEl?.getAttribute('href') || linkEl?.textContent?.trim() || '';
    const date = it.querySelector('pubDate, published, updated')?.textContent?.trim();
    const t = date ? new Date(date) : new Date();
    out.push({
      id: hash(url || title),
      title,
      url,
      source,
      publishedAt: (isNaN(t.getTime()) ? new Date() : t).toISOString(),
      symbol,
    });
  }
  return out;
}

export function proxied(url: string, corsProxy: string): string {
  if (!corsProxy) return url;
  return corsProxy.includes('{URL}') ? corsProxy.replace('{URL}', encodeURIComponent(url)) : corsProxy + url;
}

export async function fetchFeed(url: string, corsProxy: string, symbol?: string): Promise<Headline[]> {
  const host = new URL(url).hostname;
  let res: Response;
  try {
    res = await fetch(proxied(url, corsProxy), { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  } catch {
    throw new SourceError(
      `${host}: request blocked (most likely CORS). Browsers cannot read this feed directly — configure a CORS proxy in Settings or let your MCP server fetch it server-side.`,
      true,
    );
  }
  if (res.status === 429) throw new SourceError(`${host}: rate limited (429)`);
  if (!res.ok) throw new SourceError(`${host}: HTTP ${res.status}`);
  return parseFeed(await res.text(), host, symbol);
}
