// Shared request guard for the Netlify functions. The functions spend API credits / hit
// third parties on your behalf, so they must not be an open relay.

const hits = new Map<string, number[]>();

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Returns an error Response if the request must be rejected, otherwise null. */
export function guard(req: Request, name: string, maxPerMinute: number): Response | null {
  // 1. Same-origin only (blocks other websites from calling your functions from a browser).
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
    } catch {
      return json({ error: 'Bad origin.' }, 403);
    }
  }
  // 2. Optional shared access token (set APP_ACCESS_TOKEN in Netlify; enter it once in Settings).
  const token = process.env.APP_ACCESS_TOKEN;
  if (token && !safeEqual(req.headers.get('x-access-token') ?? '', token)) {
    return json({ error: 'Missing or wrong access token (APP_ACCESS_TOKEN).' }, 401);
  }
  // 3. Best-effort per-IP rate limit (per warm function instance).
  const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'local';
  const key = `${name}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= maxPerMinute) return json({ error: 'Rate limit exceeded, slow down.' }, 429, { 'Retry-After': '30' });
  recent.push(now);
  hits.set(key, recent);
  return null;
}

export function parseSymbols(raw: string | null, max = 10): string[] {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z.\-]{1,8}$/.test(s)))].slice(0, max);
}
