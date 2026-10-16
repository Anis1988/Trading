import { guard, json, parseSymbols } from '../lib/guard';
import { getDividends } from '../lib/dividends';

export const config = { path: '/api/dividends' };

// GET /api/dividends?symbols=KO,AAPL → { info: { KO: DivInfo, … }, errors } (free; cached 12 hours on the server)
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'dividends', 20);
  if (blocked) return blocked;
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'), 30);
  if (!symbols.length) return json({ error: 'Provide ?symbols=KO,AAPL' }, 400);
  return json(await getDividends(symbols), 200, { 'Cache-Control': 'private, max-age=1800' });
};
