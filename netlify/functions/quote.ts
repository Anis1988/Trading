import { yahooQuote, type Quote } from '../lib/feeds';
import { guard, json, parseSymbols } from '../lib/guard';

export const config = { path: '/api/quote' };

// GET /api/quote?symbols=AAPL,MSFT  ->  { quotes: { AAPL: {...} }, errors }
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'quote', 60);
  if (blocked) return blocked;
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'));
  if (!symbols.length) return json({ error: 'Provide ?symbols=AAPL,MSFT' }, 400);
  const quotes: Record<string, Quote> = {};
  const errors: string[] = [];
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const q = await yahooQuote(s);
        if (q) quotes[s] = q;
        else errors.push(`${s}: no quote`);
      } catch (e) {
        errors.push(`${s}: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
  return json({ quotes, errors }, 200, { 'Cache-Control': 'private, max-age=15' });
};
