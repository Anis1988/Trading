export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const nowIso = () => new Date().toISOString();

export function cleanSymbol(s: string): string {
  return s.toUpperCase().replace(/[^A-Z.\-]/g, '').slice(0, 8);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassphrase(pass: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${pass}`);
}

export function newSalt(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacHex(key: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 30 -> "30 sec", 60 -> "1 min", 300 -> "5 min", 90 -> "1.5 min" */
export function fmtInterval(sec: number): string {
  if (sec < 60) return `${sec} sec`;
  const m = sec / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} min`;
}
