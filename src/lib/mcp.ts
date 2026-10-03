import type { Headline, Side, Signal } from '../types';
import { config } from './config';
import { hmacHex, nowIso, timingSafeEqual, uid } from './util';

export interface McpResult {
  signals: Signal[];
  raw: string;
}

/**
 * POSTs headlines to the MCP endpoint. Trust checks before signals are accepted:
 *  1. HTTPS endpoint only.
 *  2. Response must carry `X-MCP-Signature` = hex HMAC-SHA256(body, apiKey). Mismatch => rejected.
 *     (The server must add `Access-Control-Expose-Headers: X-MCP-Signature` for browsers to read it.)
 *  3. Payload shape is validated; unknown sides / bad numbers are dropped.
 */
export async function callMcp(headlines: Headline[], symbols: string[], defaultQty: number): Promise<McpResult> {
  if (!config.mcpEndpoint || !config.mcpApiKey) throw new Error('MCP is not configured (NETLIFY_MCP_ENDPOINT / NETLIFY_MCP_API_KEY).');
  if (!/^https:\/\//i.test(config.mcpEndpoint)) throw new Error('MCP endpoint must use https://');

  let res: Response;
  try {
    res = await fetch(config.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.mcpApiKey}`,
        'X-API-Key': config.mcpApiKey,
      },
      body: JSON.stringify({
        headlines: headlines.map(({ title, url, source, publishedAt, symbol }) => ({ title, url, source, publishedAt, symbol })),
        symbols,
        context: { defaultQty, sentAt: nowIso() },
      }),
    });
  } catch {
    throw new Error('MCP request failed (network error or CORS). Ensure the MCP server allows this origin.');
  }
  if (!res.ok) throw new Error(`MCP returned HTTP ${res.status}`);

  const raw = await res.text();
  const sig = res.headers.get('x-mcp-signature');
  if (!sig) throw new Error('MCP response rejected: missing X-MCP-Signature header.');
  const expected = await hmacHex(config.mcpApiKey, raw);
  if (!timingSafeEqual(sig.toLowerCase(), expected)) throw new Error('MCP response rejected: signature mismatch.');

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('MCP response rejected: invalid JSON.');
  }
  if (!json || !Array.isArray(json.signals)) throw new Error('MCP response rejected: missing "signals" array.');

  const allowed = new Set(symbols);
  const signals: Signal[] = [];
  for (const s of json.signals) {
    const side = String(s?.side).toUpperCase() as Side;
    const symbol = String(s?.symbol ?? '').toUpperCase();
    const confidence = Number(s?.confidence);
    if ((side !== 'BUY' && side !== 'SELL') || !allowed.has(symbol) || !(confidence >= 0 && confidence <= 1)) continue;
    const qty = Number.isFinite(Number(s.qty)) && Number(s.qty) > 0 ? Math.floor(Number(s.qty)) : defaultQty;
    signals.push({
      id: uid(),
      symbol,
      side,
      confidence,
      qty,
      reason: String(s.reason ?? 'MCP signal').slice(0, 500),
      createdAt: nowIso(),
      status: 'new',
      source: 'mcp',
      autoEmail: s.autoEmail === true,
    });
  }
  return { signals, raw };
}
