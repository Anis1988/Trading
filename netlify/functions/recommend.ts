import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { guard, json } from '../lib/guard';

export const config = { path: '/api/recommend' };

const Body = z.object({
  rows: z
    .array(
      z.object({
        symbol: z.string().regex(/^[A-Z.\-]{1,8}$/),
        price: z.number(),
        ret1m: z.number(),
        ret3m: z.number(),
        rsi: z.number(),
        aboveSma50: z.boolean(),
        trend: z.string().max(40),
        owned: z.object({ shares: z.number(), avgCost: z.number() }).nullable(),
      }),
    )
    .min(1)
    .max(40),
});

const Out = z.object({
  summary: z.string(),
  picks: z.array(z.object({ symbol: z.string(), action: z.enum(['BUY', 'SELL', 'WATCH']), reason: z.string() })),
});

const SYSTEM = `You help a beginner investor look at price trends. You get a table of stocks with simple trend numbers (1-month and 3-month change in %, RSI, whether price is above its 50-day average, a trend label) and whether the user owns each one.

Rules:
- Use ONLY symbols from the table. You only see price trends: no news, no company financials. Say so if it matters.
- Choose at most 3 BUY ideas (stocks worth a closer look to buy; prefer steady uptrends that are not overheated, RSI above 70 means stretched) and at most 2 SELL ideas (only stocks the user OWNS that are in a clear downtrend). Use WATCH for interesting but not-yet ideas. Fewer picks is fine; an empty list is fine if nothing looks good.
- Never call anything a sure thing. No price targets.
- WRITING STYLE: plain everyday words, short sentences, no jargon, no abbreviations. "reason": one short sentence. "summary": at most 2 short sentences about the overall picture.`;

// POST /api/recommend { rows } -> { summary, picks, model }
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const blocked = guard(req, 'recommend', 6);
  if (blocked) return blocked;
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY is not set in Netlify.' }, 503);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const symbols = new Set(body.rows.map((r) => r.symbol));
  const owned = new Set(body.rows.filter((r) => r.owned).map((r) => r.symbol));
  const table = body.rows
    .map((r) => `${r.symbol} | price ${r.price} | 1m ${r.ret1m}% | 3m ${r.ret3m}% | RSI ${r.rsi} | above 50-day avg: ${r.aboveSma50 ? 'yes' : 'no'} | ${r.trend} | ${r.owned ? `OWNED ${r.owned.shares} sh @ ${r.owned.avgCost}` : 'not owned'}`)
    .join('\n');

  const model = process.env.REVIEW_MODEL || 'claude-opus-5-5';
  const client = new Anthropic({ timeout: 22_000, maxRetries: 1 });
  try {
    const res = await client.messages.parse({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `Today is ${new Date().toISOString().slice(0, 10)}.\n${table}` }],
      output_config: { effort: 'low', format: zodOutputFormat(Out) },
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return json({ summary: 'The AI gave no usable answer. Try again.', picks: [], model });
    // Enforce the rules in code, not just in the prompt.
    const picks = res.parsed_output.picks
      .filter((p) => symbols.has(p.symbol) && (p.action !== 'SELL' || owned.has(p.symbol)))
      .slice(0, 6)
      .map((p) => ({ ...p, reason: p.reason.slice(0, 250) }));
    return json({ summary: res.parsed_output.summary.slice(0, 400), picks, model });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status ?? 502 : 502;
    const detail = (e instanceof Error ? e.message : String(e)).replace(/sk-ant-[A-Za-z0-9_-]+/g, '[key]').slice(0, 400);
    console.error('recommend failed', model, detail);
    return json({ error: `AI request failed (${status}, model ${model}): ${detail}` }, status === 429 ? 429 : 502);
  }
};
