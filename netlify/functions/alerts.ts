import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { readServer, type ServerLogEntry } from '../lib/state';
import { serverEmailReady, sendServerEmail } from '../lib/mailer';
import { getSubscriptions, pushAll, pushReady, removeSubscription, saveSubscription } from '../lib/push';
import { runWatch } from '../lib/watchCore';
import { aiUsage, reviewModel } from '../lib/aiBudget';
import { redditReady } from '../lib/reddit';
import { runWeekly } from '../lib/weeklyCore';
import { textEmailParams } from '../../src/lib/emailParams';

export const config = { path: '/api/alerts' };

const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe'), subscription: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }) }),
  z.object({ action: z.literal('unsubscribe'), endpoint: z.string().max(1000) }),
  z.object({ action: z.literal('test-push') }),
  z.object({ action: z.literal('test-email'), to: z.string().email().max(200) }),
  z.object({ action: z.literal('run-now') }),
  z.object({ action: z.literal('weekly-now') }),
]);

// GET  /api/alerts -> status of background alerts, server email and notifications
// POST /api/alerts {action: ...} -> subscribe / unsubscribe / test-push / test-email / run-now / weekly-now
export default async (req: Request): Promise<Response> => {
  const blocked = guard(req, 'alerts', 20);
  if (blocked) return blocked;
  if (!process.env.APP_ACCESS_TOKEN) return json({ error: 'Background alerts need APP_ACCESS_TOKEN set in Netlify.' }, 503);
  try {
    if (req.method === 'GET') {
      return json({
        lastRun: await readServer<string | null>('lastRun', null),
        log: await readServer<ServerLogEntry[]>('log', []),
        ready: { ai: !!process.env.ANTHROPIC_API_KEY, email: serverEmailReady(), push: pushReady(), reddit: redditReady() },
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
        devices: (await getSubscriptions()).length,
        ai: { ...(await aiUsage()), model: reviewModel() },
      });
    }
    if (req.method !== 'POST') return json({ error: 'GET or POST only' }, 405);
    let body: z.infer<typeof Post>;
    try {
      body = Post.parse(await req.json());
    } catch {
      return json({ error: 'Invalid request.' }, 400);
    }
    switch (body.action) {
      case 'subscribe':
        if (!pushReady()) return json({ error: 'Notifications need VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Netlify.' }, 503);
        return json({ devices: await saveSubscription(body.subscription) });
      case 'unsubscribe':
        await removeSubscription(body.endpoint);
        return json({ ok: true });
      case 'test-push': {
        const n = await pushAll({ title: 'Trading Assistant', body: 'Notifications work on this device.', tag: 'test' });
        return n ? json({ sent: n }) : json({ error: 'No device received it. Turn notifications on first.' }, 400);
      }
      case 'test-email':
        await sendServerEmail(textEmailParams('Test from your Trading Assistant', 'Background email works. Alerts will arrive like this even when the app is closed.', body.to));
        return json({ ok: true });
      case 'run-now':
        return json(await runWatch({ force: true }));
      case 'weekly-now':
        return json(await runWeekly({ force: true }));
    }
  } catch (e) {
    return json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, 502);
  }
};
