import { createSign } from 'node:crypto';
import { readServer, writeServer } from './state';

/**
 * Phone notifications for the Android app, through Google's free Firebase Cloud Messaging (FCM).
 * The Firebase key (a "service account" file) is uploaded once in Settings and kept only on the server
 * (Netlify Blobs; it is never sent back to the app). FIREBASE_SERVICE_ACCOUNT in Netlify works too.
 */
export interface FirebaseKey { project_id: string; client_email: string; private_key: string }

export function parseFirebaseKey(raw: unknown): FirebaseKey | null {
  const k = (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as Partial<FirebaseKey> & { type?: string } | null;
  if (!k || k.type !== 'service_account' || !k.project_id || !k.client_email || !k.private_key?.includes('PRIVATE KEY')) return null;
  return { project_id: String(k.project_id), client_email: String(k.client_email), private_key: String(k.private_key) };
}

export async function firebaseKey(): Promise<FirebaseKey | null> {
  return parseFirebaseKey(process.env.FIREBASE_SERVICE_ACCOUNT ?? '') ?? (await readServer<FirebaseKey | null>('fcm-key', null));
}
export const saveFirebaseKey = (k: FirebaseKey | null) => writeServer('fcm-key', k);

export const getFcmTokens = () => readServer<string[]>('fcm-tokens', []);
export async function saveFcmToken(token: string): Promise<number> {
  const list = [...(await getFcmTokens()).filter((t) => t !== token), token].slice(-10);
  await writeServer('fcm-tokens', list);
  return list.length;
}
export async function removeFcmToken(token: string): Promise<void> {
  await writeServer('fcm-tokens', (await getFcmTokens()).filter((t) => t !== token));
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');
let cached: { token: string; exp: number; email: string } | null = null;

/** A short-lived Google access token, made from the key (signed JWT, no extra library). */
async function accessToken(k: FirebaseKey): Promise<string> {
  if (cached && cached.email === k.client_email && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(k.private_key.replace(/\\n/g, '\n'), 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Firebase sign-in failed: ${j.error_description ?? `HTTP ${res.status}`}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, email: k.client_email };
  return j.access_token;
}

/** Sends to every phone with the app; drops phones that uninstalled the app. Returns how many were delivered. */
export async function fcmAll(payload: { title: string; body: string; tag?: string }): Promise<number> {
  const k = await firebaseKey();
  const tokens = await getFcmTokens();
  if (!k || !tokens.length) return 0;
  const auth = await accessToken(k);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(tokens.map(async (token) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${k.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title.slice(0, 120), body: payload.body.slice(0, 900) },
          android: { priority: 'high', ttl: '3600s', notification: { channel_id: 'alerts', ...(payload.tag ? { tag: payload.tag.slice(0, 60) } : {}) } },
        },
      }),
    }).catch(() => null);
    if (res?.ok) sent++;
    else if (res && (res.status === 404 || (res.status === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(await res.text().catch(() => ''))))) dead.push(token);
  }));
  if (dead.length) await writeServer('fcm-tokens', tokens.filter((t) => !dead.includes(t)));
  return sent;
}
