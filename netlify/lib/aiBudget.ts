import { readServer, readState, writeServer } from './state';

/** Cheapest model that still writes good plain-language reviews. Override with REVIEW_MODEL. */
export const reviewModel = () => process.env.REVIEW_MODEL || 'claude-sonnet-5-5';

export class BudgetError extends Error {
  status = 429;
}

const today = () => new Date().toISOString().slice(0, 10);

async function limit(): Promise<number> {
  const s = (await readState())?.data.settings;
  const n = Number(s?.aiDailyLimit ?? process.env.AI_DAILY_LIMIT ?? 20);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

export async function aiUsage(): Promise<{ used: number; limit: number }> {
  try {
    const u = await readServer<{ day: string; n: number }>('ai-usage', { day: today(), n: 0 });
    return { used: u.day === today() ? u.n : 0, limit: await limit() };
  } catch {
    return { used: 0, limit: 20 };
  }
}

/** Counts one paid AI call against today's limit (shared by the app, background alerts and Ideas). */
export async function takeAiCredit(): Promise<void> {
  let u: { day: string; n: number };
  try {
    u = await readServer('ai-usage', { day: today(), n: 0 });
  } catch {
    return; // no storage (local dev): do not block
  }
  if (u.day !== today()) u = { day: today(), n: 0 };
  const max = await limit();
  if (u.n >= max) throw new BudgetError(`Daily AI limit reached (${max} checks). It resets at midnight UTC; raise it in Settings if you want.`);
  await writeServer('ai-usage', { day: u.day, n: u.n + 1 });
}

/** Small time-limited cache so the same question is never paid for twice. */
export async function cached<T>(bucket: string, key: string, ttlMs: number, make: () => Promise<T>): Promise<T> {
  let store: Record<string, { at: number; v: T }> = {};
  try {
    store = await readServer(bucket, {});
  } catch {
    return make();
  }
  const hit = store[key];
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await make();
  const fresh = Object.fromEntries(Object.entries(store).filter(([, x]) => Date.now() - x.at < ttlMs).slice(-80));
  fresh[key] = { at: Date.now(), v };
  await writeServer(bucket, fresh).catch(() => undefined);
  return v;
}

export const hashKey = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** Gives the credit back when the AI call itself failed (nothing useful was bought). */
export async function refundAiCredit(): Promise<void> {
  try {
    const u = await readServer<{ day: string; n: number }>('ai-usage', { day: today(), n: 0 });
    if (u.day === today() && u.n > 0) await writeServer('ai-usage', { day: u.day, n: u.n - 1 });
  } catch {
    /* ignore */
  }
}

/* ---------- 📊 AI cost history (for the "My apps" summary, /api/summary) ---------- */

/**
 * Anthropic list prices in $ per million tokens (input, output), October 2026. Matched on the model name; an unknown
 * model is priced like Sonnet. Cache writes cost 1.25× input, cache reads 0.1× input.
 */
const PRICES: [RegExp, number, number, string][] = [
  [/fable|mythos/, 10, 50, 'Claude Fable'],
  [/opus-5-5/, 4, 20, 'Claude Opus 5.5'],
  [/opus/, 5, 25, 'Claude Opus'],
  [/sonnet-4/, 3, 15, 'Claude Sonnet 4.6'],
  [/sonnet/, 2, 10, 'Claude Sonnet'],
  [/haiku-4/, 1, 5, 'Claude Haiku 4.5'],
  [/haiku/, 0.1, 0.5, 'Claude Haiku'],
];
const priceOf = (model: string) => PRICES.find(([re]) => re.test(model)) ?? [/./, 2, 10, model] as const;
export const modelName = (model: string) => priceOf(model)[3];
/** Estimate for a call without token counts: a review is about 3,000 tokens in and 400 out (≈ 1 cent on Sonnet). */
export const estimateCall = (model: string) => (3000 * priceOf(model)[1] + 400 * priceOf(model)[2]) / 1e6;

export interface Usage { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }
export interface AiDay { calls: number; usd: number; est: number; models: Record<string, { calls: number; usd: number }> }
const AI_DAYS = 'ai-days';

/** $ for one call from its exact token counts (null when the API sent none). */
export function costOf(model: string, u?: Usage | null): number | null {
  if (!u || typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') return null;
  const [, pin, pout] = priceOf(model);
  return (u.input_tokens * pin + (u.cache_creation_input_tokens ?? 0) * pin * 1.25 + (u.cache_read_input_tokens ?? 0) * pin * 0.1 + u.output_tokens * pout) / 1e6;
}

/** Remembers one paid AI call and its cost, one entry per day, kept 90 days. Never throws. */
export async function recordAiCall(model: string, usage?: Usage | null): Promise<void> {
  try {
    const days = await readServer<Record<string, AiDay>>(AI_DAYS, {});
    const d = today();
    const exact = costOf(model, usage);
    const usd = exact ?? estimateCall(model);
    const e = days[d] ?? { calls: 0, usd: 0, est: 0, models: {} };
    e.calls++;
    e.usd += usd;
    if (exact === null) e.est++;
    const m = (e.models[model] ??= { calls: 0, usd: 0 });
    m.calls++;
    m.usd += usd;
    days[d] = e;
    const cut = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    await writeServer(AI_DAYS, Object.fromEntries(Object.entries(days).filter(([k]) => k >= cut)));
  } catch {
    /* no storage (local dev) */
  }
}

export const readAiDays = () => readServer<Record<string, AiDay>>(AI_DAYS, {});
