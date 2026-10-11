import { call } from './api';
import { isNative } from './native';
import { PushNotifications } from '@capacitor/push-notifications';
import type { Brief } from './brief';

export interface AlertStatus {
  lastRun: string | null;
  log: { ts: string; level: 'info' | 'warn' | 'error'; msg: string }[];
  ready: { ai: boolean; email: boolean; push: boolean; reddit?: boolean };
  vapidPublicKey: string | null;
  devices: number;
  phones?: number; // Android app phones that get notifications
  firebase?: string | null; // Firebase project of the uploaded key (the key itself stays on the server)
  ai?: { used: number; limit: number; model: string };
  priceFired?: Record<string, { at: string; price: number }>;
  stopFired?: Record<string, { at: string; price: number; stop: number }>;
  brief?: Brief | null;
  backOn?: { symbol: string; rule: string; at: string; price: number; text: string }[];
}

export const getAlertStatus = () => call<AlertStatus>('/api/alerts');

export const alertAction = <T = Record<string, unknown>>(body: Record<string, unknown>) =>
  call<T>('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ---------- installable app + notifications ---------- */
export function registerServiceWorker(): void {
  // Not in the Android app: it loads its screens from the phone itself, and web alerts don't reach an app.
  if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative()) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}

export const pushSupported = () => isNative() ? appPushReady() : 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () =>
  isNative() || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function keyToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission, subscribe this device and register it with the server. */
export async function enablePush(vapidPublicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error(isIos() && !isStandalone() ? 'On iPhone, first add the app to your Home Screen, open it from there, then turn this on.' : 'This browser does not support notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your browser or phone settings.');
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidPublicKey) }));
  await alertAction({ action: 'subscribe', subscription: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await alertAction({ action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

/* Chrome/Android "Install app" prompt: captured once so Settings can offer a button. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as InstallEvent;
    listeners.forEach((f) => f());
  });
}
export const canPromptInstall = () => !!deferredInstall;
export const onInstallAvailable = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  return outcome === 'accepted';
}

/* ---------- Android app: phone notifications through Firebase ---------- */
const APP_TOKEN_KEY = 'ta.appPushToken';
const savedAppToken = (): string => { try { return localStorage.getItem(APP_TOKEN_KEY) ?? ''; } catch { return ''; } };
const keepAppToken = (t: string) => { try { if (t) localStorage.setItem(APP_TOKEN_KEY, t); else localStorage.removeItem(APP_TOKEN_KEY); } catch { /* ignore */ } };

/** The app was built with Firebase (google-services.json present when GitHub built it). */
export const appPushReady = () => isNative() && import.meta.env.VITE_FCM === '1';
export const appPushOn = () => appPushReady() && !!savedAppToken();

/** This phone's Firebase address (asks Android for it; it can change after an app update or reinstall). */
function appToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const subs = [
      PushNotifications.addListener('registration', (t) => { done(); resolve(t.value); }),
      PushNotifications.addListener('registrationError', (e) => { done(); reject(new Error(`Could not register for notifications: ${e.error}`)); }),
    ];
    const timer = setTimeout(() => { done(); reject(new Error('Android did not answer. Check the internet connection and try again.')); }, 20_000);
    const done = () => { clearTimeout(timer); subs.forEach((s) => void s.then((x) => x.remove())); };
    void PushNotifications.register().catch((e) => { done(); reject(e); });
  });
}

const channel = () => PushNotifications.createChannel({ id: 'alerts', name: 'Trading alerts', description: 'BUY/SELL calls, price alerts and summaries', importance: 5, visibility: 1, vibration: true });

export async function enableAppPush(): Promise<void> {
  let p = await PushNotifications.checkPermissions();
  if (p.receive !== 'granted') p = await PushNotifications.requestPermissions();
  if (p.receive !== 'granted') throw new Error('Notifications were not allowed. Allow them in Android Settings → Apps → Trading → Notifications, then try again.');
  await channel();
  const token = await appToken();
  await alertAction({ action: 'subscribe-app', token });
  keepAppToken(token);
}

export async function disableAppPush(): Promise<void> {
  const token = savedAppToken();
  if (token) await alertAction({ action: 'unsubscribe-app', token }).catch(() => undefined);
  await PushNotifications.unregister().catch(() => undefined);
  keepAppToken('');
}

/** On app start: keeps the server's copy of this phone's address current, and shows alerts that arrive while the app is open. */
export function startAppPush(onAlert: (title: string, body: string) => void): () => void {
  if (!appPushReady()) return () => undefined;
  const h = PushNotifications.addListener('pushNotificationReceived', (n) => onAlert(n.title ?? 'Trading', n.body ?? ''));
  if (savedAppToken()) {
    void channel().then(appToken).then(async (t) => {
      if (t !== savedAppToken()) { await alertAction({ action: 'subscribe-app', token: t }); keepAppToken(t); }
    }).catch(() => undefined);
  }
  return () => void h.then((x) => x.remove());
}
