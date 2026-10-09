import { call } from './api';

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
  backOn?: { symbol: string; rule: string; at: string; price: number; text: string }[];
}

export const getAlertStatus = () => call<AlertStatus>('/api/alerts');

export const alertAction = <T = Record<string, unknown>>(body: Record<string, unknown>) =>
  call<T>('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ---------- installable app + notifications ---------- */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
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
