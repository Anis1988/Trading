import { finnhubNews, googleNews, nasdaqNews, secFilings, yahooNews, type ServerHeadline } from '../lib/feeds';
import { guard, json, parseSymbols } from '../lib/guard';
import { isAbout, profiles } from '../lib/relevance';

export const config = { path: '/api/news' };

// GET /api/news?symbols=AAPL,MSFT  ->  { headlines, errors }
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'news', 60);
  if (blocked) return blocked;
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'));
  if (!symbols.length) return json({ error: 'Provide ?symbols=AAPL,MSFT' }, 400);

  const key = process.env.FINNHUB_KEY;
  const jobs: Promise<ServerHeadline[]>[] = [];
  for (const s of symbols) {
    jobs.push(yahooNews(s), googleNews(s), nasdaqNews(s), secFilings(s));
    if (key) jobs.push(finnhubNews(s, key));
  }
  const [settled, prof] = await Promise.all([Promise.allSettled(jobs), profiles(symbols).catch(() => ({}) as Awaited<ReturnType<typeof profiles>>)]);
  const errors = new Set<string>();
  const seen = new Set<string>();
  const headlines: ServerHeadline[] = [];
  for (const r of settled) {
    if (r.status === 'rejected') errors.add(r.reason instanceof Error ? r.reason.message : String(r.reason));
    // Only headlines really about the stock: feeds also return general market news about other companies.
    else for (const h of r.value) if (isAbout(h.title, h.symbol, prof[h.symbol]) && !seen.has(h.title.toLowerCase())) (seen.add(h.title.toLowerCase()), headlines.push(h));
  }
  headlines.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // Short shared cache so frequent polling does not hammer the upstream sources.
  return json({ headlines, errors: [...errors] }, 200, { 'Cache-Control': 'private, max-age=25' });
};
