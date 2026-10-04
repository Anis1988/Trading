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
