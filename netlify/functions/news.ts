import { finnhubNews, googleNews, nasdaqNews, secFilings, yahooNews, type ServerHeadline } from '../lib/feeds';
import { guard, json, parseSymbols } from '../lib/guard';

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
  const settled = await Promise.allSettled(jobs);
  const errors = new Set<string>();
  const seen = new Set<string>();
  const headlines: ServerHeadline[] = [];
  for (const r of settled) {
    if (r.status === 'rejected') errors.add(r.reason instanceof Error ? r.reason.message : String(r.reason));
    else for (const h of r.value) if (!seen.has(h.title.toLowerCase())) (seen.add(h.title.toLowerCase()), headlines.push(h));
  }
  headlines.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // Short shared cache so frequent polling does not hammer the upstream sources.
  return json({ headlines, errors: [...errors] }, 200, { 'Cache-Control': 'private, max-age=25' });
};
