import { z } from 'zod';
import { guard, json } from '../lib/guard';
import { readServer, type ServerLogEntry } from '../lib/state';
import { serverEmailReady, sendServerEmail } from '../lib/mailer';
import { getSubscriptions, pushAll, pushReady, removeSubscription, saveSubscription } from '../lib/push';
import { runWatch } from '../lib/watchCore';
import { firebaseKey, getFcmTokens, parseFirebaseKey, removeFcmToken, saveFcmToken, saveFirebaseKey } from '../lib/fcm';
import { aiUsage, reviewModel } from '../lib/aiBudget';
import { redditReady } from '../lib/reddit';
import { runWeekly } from '../lib/weeklyCore';
import type { BackOn, PriceHit } from '../lib/extraAlerts';
import { textEmailParams } from '../../src/lib/emailParams';

export const config = { path: '/api/alerts' };

const Post = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe'), subscription: z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }) }),
  z.object({ action: z.literal('unsubscribe'), endpoint: z.string().max(1000) }),
  z.object({ action: z.literal('test-push') }),
  // Android app: the phone's Firebase address, and the Firebase key file (uploaded once in Settings, kept on the server only).
  z.object({ action: z.literal('subscribe-app'), token: z.string().min(20).max(4096) }),
  z.object({ action: z.literal('unsubscribe-app'), token: z.string().max(4096) }),
  z.object({ action: z.literal('firebase-key'), key: z.record(z.string(), z.unknown()).nullable() }),
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
        phones: (await getFcmTokens()).length,
        firebase: (await firebaseKey())?.project_id ?? null,
        ai: { ...(await aiUsage()), model: reviewModel() },
        priceFired: await readServer<Record<string, PriceHit>>('priceFired', {}),
        backOn: (await readServer<BackOn[]>('backOn', [])).slice(0, 10),
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
      case 'subscribe-app':
        if (!(await firebaseKey())) return json({ error: 'Phone notifications need the Firebase key: on the website, open Settings → Notifications and upload it.' }, 503);
        return json({ phones: await saveFcmToken(body.token) });
      case 'unsubscribe-app':
        await removeFcmToken(body.token);
        return json({ ok: true });
      case 'firebase-key': {
        if (body.key === null) return (await saveFirebaseKey(null), json({ firebase: null }));
        const k = parseFirebaseKey(body.key);
        if (!k) return json({ error: 'That is not a Firebase service account key file (it should contain "type": "service_account").' }, 400);
        await saveFirebaseKey(k);
        return json({ firebase: k.project_id });
      }
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
