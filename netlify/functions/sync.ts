import { getStore } from '@netlify/blobs';
import { z } from 'zod';
import { guard, json } from '../lib/guard';

export const config = { path: '/api/sync' };

// One private document with the user's settings, watchlist, holdings and history so every device sees the same data.
const Data = z.object({
  settings: z.record(z.string(), z.unknown()),
  watchlist: z.array(z.string().max(8)).max(100),
  history: z.array(z.record(z.string(), z.unknown())).max(2000),
});
const Put = z.object({ baseUpdatedAt: z.string().nullable(), data: Data });

interface Stored {
  updatedAt: string;
  data: z.infer<typeof Data>;
}

// GET  /api/sync            -> { updatedAt, data } (both null if nothing saved yet)
// PUT  /api/sync {baseUpdatedAt, data} -> { updatedAt } | 409 { updatedAt, data } when another device saved first
async function handle(req: Request): Promise<Response> {
  const blocked = guard(req, 'sync', 60);
  if (blocked) return blocked;
  // Holdings and history are private: refuse to run without an access token configured.
  if (!process.env.APP_ACCESS_TOKEN) return json({ error: 'Sync needs APP_ACCESS_TOKEN to be set in Netlify.' }, 503);

  const store = getStore('trading-sync');
  const current = (await store.get('state', { type: 'json' })) as Stored | null;

  if (req.method === 'GET') return json(current ?? { updatedAt: null, data: null });
  if (req.method !== 'PUT') return json({ error: 'GET or PUT only' }, 405);

  const text = await req.text();
  if (text.length > 1_000_000) return json({ error: 'Payload too large.' }, 413);
  let body: z.infer<typeof Put>;
  try {
    body = Put.parse(JSON.parse(text));
  } catch {
    return json({ error: 'Invalid sync payload.' }, 400);
  }
  if (current && current.updatedAt !== body.baseUpdatedAt) return json(current, 409);

  const next: Stored = { updatedAt: new Date().toISOString(), data: body.data };
  await store.setJSON('state', next);
  return json({ updatedAt: next.updatedAt });
}

export default async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (e) {
    console.error('sync failed', e instanceof Error ? e.message : e);
    return json({ error: `Sync storage error: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` }, 500);
  }
};
