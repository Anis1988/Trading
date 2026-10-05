import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { reviewTrade, ReviewError } from '../lib/reviewCore';

export const config = { path: '/api/review' };

const Body = z.object({
  signal: z.object({
    symbol: z.string().regex(/^[A-Z.\-]{1,8}$/),
    side: z.enum(['BUY', 'SELL']),
    confidence: z.number(),
    reason: z.string().max(600),
    qty: z.number().int().positive().max(1_000_000),
  }),
  headlines: z
    .array(z.object({ title: z.string().max(300), source: z.string().max(80), publishedAt: z.string().max(40) }))
    .max(15),
  // What the user actually owns (entered in Settings). Empty = unknown.
  holdings: z.array(z.object({ symbol: z.string().regex(/^[A-Z.\-]{1,8}$/), shares: z.number().nonnegative().max(1e9), avgCost: z.number().nonnegative().max(1e7), boughtAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })).max(100).default([]),
  risk: z.object({ riskPerTrade: z.number().positive().max(1e7), stopLossPct: z.number().min(1).max(50), smartStop: z.boolean(), cash: z.number().nonnegative().max(1e10).optional(), horizon: z.enum(['short', 'medium', 'long']).optional() }).optional(),
});

// POST /api/review { signal, headlines, holdings } -> { verdict, confidence, rationale, risks, holdingNote, suggestedQty, quote, model }
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const blocked = guard(req, 'review', 12);
  if (blocked) return blocked;
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  try {
    return json(await reviewTrade(body));
  } catch (e) {
    const status = e instanceof ReviewError ? e.status : 502;
    console.error('review failed', e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : 'AI review failed.' }, status === 429 ? 429 : status === 503 ? 503 : 502);
  }
};
