import { guard, json, parseSymbols } from '../lib/guard';
import { getInsights, getMarket } from '../lib/insights';

export const config = { path: '/api/insights' };

// GET /api/insights?symbols=AAPL,MSFT -> { market, stocks: { AAPL: { earnings, analysts, basics } }, finnhub }
// Free data only (Yahoo + Finnhub free tier). No AI involved.
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'insights', 30);
  if (blocked) return blocked;
  const symbols = parseSymbols(new URL(req.url).searchParams.get('symbols'), 25);
  try {
    const [market, stocks] = await Promise.all([getMarket(), symbols.length ? getInsights(symbols) : Promise.resolve({})]);
    return json({ market, stocks, finnhub: !!process.env.FINNHUB_KEY }, 200, { 'Cache-Control': 'private, max-age=900' });
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, 502);
  }
};
