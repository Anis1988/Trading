import webpush, { type PushSubscription } from 'web-push';
import { readServer, writeServer } from './state';

export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function getSubscriptions(): Promise<PushSubscription[]> {
  return readServer<PushSubscription[]>('push-subs', []);
}

export async function saveSubscription(sub: PushSubscription): Promise<number> {
  const subs = (await getSubscriptions()).filter((s) => s.endpoint !== sub.endpoint);
  subs.push(sub);
  await writeServer('push-subs', subs.slice(-10));
  return subs.length;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await writeServer('push-subs', (await getSubscriptions()).filter((s) => s.endpoint !== endpoint));
}

/** Sends to every registered device; drops subscriptions the browser has revoked. Returns how many were delivered. */
export async function pushAll(payload: { title: string; body: string; tag?: string }): Promise<number> {
  if (!pushReady()) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:alerts@example.com', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await getSubscriptions();
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) await writeServer('push-subs', subs.filter((s) => !dead.includes(s.endpoint)));
  return sent;
}
