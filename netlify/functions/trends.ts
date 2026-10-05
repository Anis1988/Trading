import { yahooHistory, type History } from '../lib/feeds';
import { guard, json, parseSymbols } from '../lib/guard';

export const config = { path: '/api/trends' };

// GET /api/trends?symbols=AAPL,MSFT[&range=2y]  ->  { series: { AAPL: { dates, closes, currency } }, errors }
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'trends', 20);
  if (blocked) return blocked;
  const url = new URL(req.url);
  const symbols = parseSymbols(url.searchParams.get('symbols'), 30);
  const range = url.searchParams.get('range') === '2y' ? '2y' : '6mo';
  if (!symbols.length) return json({ error: 'Provide ?symbols=AAPL,MSFT' }, 400);
  const series: Record<string, History> = {};
  const errors: string[] = [];
  await Promise.all(
    symbols.map(async (s) => {
      try {
        const h = await yahooHistory(s, range);
        if (h) series[s] = h;
        else errors.push(`${s}: no price history`);
      } catch (e) {
        errors.push(`${s}: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
  return json({ series, errors }, 200, { 'Cache-Control': 'private, max-age=300' });
};
