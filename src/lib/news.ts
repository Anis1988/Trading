import type { Headline, Settings } from '../types';
import { config } from './config';
import { fetchFeed, SourceError } from './rss';

async function fetchNewsApi(symbol: string): Promise<Headline[]> {
  const url =
    'https://newsapi.org/v2/everything?pageSize=15&sortBy=publishedAt&language=en' +
    `&q=${encodeURIComponent(symbol)}&apiKey=${encodeURIComponent(config.newsApiKey)}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new SourceError('newsapi.org: request blocked (CORS). NewsAPI only allows browser calls from localhost on free plans — use MCP to fetch server-side.', true);
  }
  if (res.status === 429) throw new SourceError('newsapi.org: rate limited (429)');
  if (!res.ok) throw new SourceError(`newsapi.org: HTTP ${res.status}`);
  const json = await res.json();
  return (json.articles ?? []).map((a: any) => ({
    id: String(a.url),
    title: String(a.title ?? ''),
    url: String(a.url ?? ''),
    source: String(a.source?.name ?? 'NewsAPI'),
    publishedAt: new Date(a.publishedAt ?? Date.now()).toISOString(),
    symbol,
  }));
}

export interface FetchResult {
  headlines: Headline[];
  errors: string[];
}

/** Fetches every enabled source for every symbol. Individual failures are collected, not thrown. */
export async function fetchAllNews(symbols: string[], s: Settings): Promise<FetchResult> {
  const tasks: Promise<Headline[]>[] = [];
  for (const sym of symbols) {
    if (s.useNewsApi && config.newsApiKey) tasks.push(fetchNewsApi(sym));
    if (s.useRss) for (const f of s.rssFeeds) tasks.push(fetchFeed(f.replace('{SYMBOL}', encodeURIComponent(sym)), s.corsProxy, sym));
  }
  const settled = await Promise.allSettled(tasks);
  const headlines: Headline[] = [];
  const errors = new Set<string>();
  for (const r of settled) {
    if (r.status === 'fulfilled') headlines.push(...r.value);
    else errors.add(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  const seen = new Set<string>();
  const unique = headlines.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
  // If every task failed, surface it so the poller backs off.
  if (tasks.length > 0 && settled.every((r) => r.status === 'rejected')) {
    throw new SourceError([...errors].join(' | '));
  }
  return { headlines: unique, errors: [...errors] };
}
