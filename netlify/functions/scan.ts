import { googleNews, yahooHistory, yahooNews, type History, type ServerHeadline } from '../lib/feeds';
import { guard, json } from '../lib/guard';
import { UNIVERSE } from '../../src/lib/universe';
import { analyze } from '../../src/lib/trend';
import { toIdea, type Idea } from '../../src/lib/picks';
import { keywordScore, sentimentScore } from '../../src/lib/signals';

export const config = { path: '/api/scan' };

type Body = { ideas: Idea[]; scanned: number; inRange: number; errors: string[] };
const cache = new Map<string, { at: number; body: Body }>();

async function pool<T, R>(items: T[], size: number, deadline: number, fn: (x: T) => Promise<R>): Promise<Array<R | undefined>> {
  const out: Array<R | undefined> = new Array(items.length).fill(undefined);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length && Date.now() < deadline) {
        const i = next++;
        try {
          const left = Math.max(0, deadline - Date.now());
          out[i] = await Promise.race([fn(items[i]), new Promise<undefined>((r) => setTimeout(() => r(undefined), left))]);
        } catch {
          out[i] = undefined;
        }
      }
    }),
  );
  return out;
}

const newsNet = (hs: ServerHeadline[]) => hs.slice(0, 12).reduce((t, h) => t + keywordScore(h.title).score + sentimentScore(h.title) * 0.5, 0);

// GET /api/scan -> ranked buy ideas from a broad universe (cached 10 minutes)
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'scan', 6);
  if (blocked) return blocked;
  const q = new URL(req.url).searchParams;
  const min = Math.max(0, Number(q.get('min')) || 0);
  const max = Number(q.get('max')) > 0 ? Number(q.get('max')) : Infinity;
  const ck = `${min}-${max}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 10 * 60_000) return json(hit.body, 200, { 'Cache-Control': 'private, max-age=300' });

  const start = Date.now();
  const errors: string[] = [];
  // 1. price history for the whole universe (bounded so we stay within the function time limit)
  const hist = await pool(UNIVERSE, 12, start + 5500, (s) => yahooHistory(s).catch((e) => (errors.push(`${s}: ${e instanceof Error ? e.message : e}`), null)));
  const analyzed = UNIVERSE.map((s, i) => ({ s, h: hist[i] as History | null | undefined }))
    .filter((x): x is { s: string; h: History } => !!x.h)
    .map((x) => analyze(x.s, x.h.closes))
    .filter((a): a is NonNullable<typeof a> => !!a);

  // 2. rank by trend, then read the news for the best candidates only
  // Price range first, so the news check (the slow part) is spent on stocks you can actually afford.
  const inRange = analyzed.filter((a) => a.price >= min && a.price <= max);
  const prelim = inRange.map((a) => toIdea(a)).sort((a, b) => b.score - a.score).slice(0, 14);
  const news = await pool(prelim, 7, start + 8000, async (i) => {
    const [g, y] = await Promise.allSettled([googleNews(i.symbol), yahooNews(i.symbol)]);
    const hs = [...(g.status === 'fulfilled' ? g.value : []), ...(y.status === 'fulfilled' ? y.value : [])].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return { net: newsNet(hs), top: hs[0] };
  });
  const byAnalysis = new Map(analyzed.map((a) => [a.symbol, a]));
  const ideas = prelim
    .map((i, k) => {
      const n = news[k];
      const a = byAnalysis.get(i.symbol)!;
      return toIdea(a, n?.net ?? 0, n?.top?.title, n?.top?.url);
    })
    .sort((a, b) => b.score - a.score);

  const body: Body = { ideas, scanned: analyzed.length, inRange: inRange.length, errors: [...new Set(errors)].slice(0, 3) };
  if (analyzed.length) cache.set(ck, { at: Date.now(), body });
  return json(body, 200, { 'Cache-Control': 'private, max-age=300' });
};
