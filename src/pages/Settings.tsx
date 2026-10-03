import { useRef, useState } from 'react';
import { useStore } from '../store';
import { config, emailConfigured, mcpConfigured } from '../lib/config';
import { buildBackup, download } from '../lib/storage';
import type { HistoryItem } from '../types';
import { cleanSymbol } from '../lib/util';
import { getAccessToken, setAccessToken } from '../lib/api';

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
    <span className="text-slate-300">{label}</span>
    {children}
  </label>
);

const Badge = ({ ok }: { ok: boolean }) => (
  <span className={ok ? 'text-emerald-400' : 'text-slate-500'}>{ok ? 'set' : 'not set'}</span>
);

export function Settings() {
  const st = useStore();
  const { settings: s, update } = st;
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const [hSym, setHSym] = useState('');
  const [hShares, setHShares] = useState('');
  const [hCost, setHCost] = useState('');
  const addHolding = () => {
    const symbol = cleanSymbol(hSym);
    const shares = Number(hShares);
    const avgCost = Number(hCost);
    if (!symbol || !(shares > 0) || !(avgCost >= 0)) return setMsg('Holding needs a symbol, shares > 0 and an average cost.');
    update({ holdings: [...s.holdings.filter((h) => h.symbol !== symbol), { symbol, shares, avgCost }] });
    setHSym(''); setHShares(''); setHCost(''); setMsg('');
  };

  const savePass = async () => {
    if (pass.length < 8) return setMsg('Passphrase must be at least 8 characters.');
    if (pass !== pass2) return setMsg('Passphrases do not match.');
    await st.setPassphrase(pass);
    setPass('');
    setPass2('');
    setMsg('Passphrase saved (stored as a salted hash in this browser only).');
  };

  const importBackup = async (f: File) => {
    try {
      const b = JSON.parse(await f.text());
      if (b?.version !== 1) throw new Error('Unknown backup version');
      if (b.settings) update({ ...b.settings, passphraseHash: s.passphraseHash, passphraseSalt: s.passphraseSalt, stopped: s.stopped, autoEmail: false });
      if (Array.isArray(b.watchlist)) st.setWatchlist(b.watchlist.map(cleanSymbol).filter(Boolean));
      if (Array.isArray(b.history)) st.setHistory(b.history as HistoryItem[]);
      setMsg('Backup imported. Auto-email was left OFF.');
    } catch (e) {
      setMsg(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card">
        <h2 className="mb-2 font-semibold">Mode & safety</h2>
        <Row label={`Mode: ${s.mockMode ? 'Mock / demo' : 'LIVE'}`}>
          {s.mockMode ? (
            <button className="btn" disabled={config.forceMock} onClick={() => void st.goLive()}>
              {config.forceMock ? 'Locked to mock (FORCE_MOCK)' : 'Enable live mode…'}
            </button>
          ) : (
            <button className="btn" onClick={st.goMock}>Back to mock mode</button>
          )}
        </Row>
        <Row label="Passphrase (required to unlock live mode, MCP and any email)">
          <span className="text-xs">{s.passphraseHash ? 'configured' : 'not set'} · session {st.unlocked ? 'unlocked' : 'locked'}</span>
        </Row>
        <div className="flex flex-wrap gap-2">
          <input className="input" type="password" placeholder="New passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
          <input className="input" type="password" placeholder="Repeat" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <button className="btn" onClick={() => void savePass()}>{s.passphraseHash ? 'Change' : 'Set'}</button>
        </div>
        {msg && <p className="mt-2 text-xs text-amber-300">{msg}</p>}
        <hr className="my-3 border-slate-800" />
        <Row label="Enable Auto-Email">
          <input type="checkbox" className="h-4 w-4" checked={s.autoEmail} onChange={(e) => void st.setAutoEmail(e.target.checked)} />
        </Row>
        <Row label="Recipient email">
          <input className="input w-60" type="email" value={s.toEmail} onChange={(e) => update({ toEmail: e.target.value.trim() })} />
        </Row>
        <p className="text-xs text-slate-500">Auto-email is always switched OFF on page load and by Panic Stop. The session re-locks after 30 minutes. Max 10 auto-emails/hour.</p>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Polling & strategy</h2>
        <Row label="Poll interval (seconds, min 10)">
          <input className="input w-24" type="number" min={10} value={s.pollIntervalSec} onChange={(e) => update({ pollIntervalSec: Math.max(10, Number(e.target.value) || 30) })} />
        </Row>
        <Row label="Default quantity">
          <input className="input w-24" type="number" min={1} value={s.defaultQty} onChange={(e) => update({ defaultQty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
        </Row>
        <Row label={`Min confidence: ${(s.minConfidence * 100).toFixed(0)}%`}>
          <input type="range" min={0.3} max={0.95} step={0.05} value={s.minConfidence} onChange={(e) => update({ minConfidence: Number(e.target.value) })} />
        </Row>
        <p className="mt-2 text-sm text-slate-300">Limit prices (optional, per symbol; blank = MARKET order)</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {st.watchlist.map((w) => (
            <label key={w} className="flex items-center gap-1 text-xs">
              {w}
              <input className="input w-20" inputMode="decimal" placeholder="MKT" value={s.limits[w] ?? ''}
                onChange={(e) => {
                  const next = { ...s.limits };
                  const n = Number(e.target.value);
                  if (n > 0) next[w] = n; else delete next[w];
                  update({ limits: next });
                }} />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">My holdings (what I own in Fidelity)</h2>
        <p className="mb-2 text-xs text-slate-500">
          Entered by hand and kept in this browser only. The AI review compares each signal with this: it will not let you sell what you do not own,
          lowers a sell to the shares you have, and shows your profit or loss. Leave empty to skip this check.
        </p>
        <div className="mb-2 flex flex-wrap gap-2">
          <input className="input w-24" placeholder="Symbol" value={hSym} onChange={(e) => setHSym(e.target.value)} />
          <input className="input w-24" placeholder="Shares" inputMode="decimal" value={hShares} onChange={(e) => setHShares(e.target.value)} />
          <input className="input w-28" placeholder="Avg cost $" inputMode="decimal" value={hCost} onChange={(e) => setHCost(e.target.value)} />
          <button className="btn" onClick={addHolding}>Add / update</button>
        </div>
        <ul className="space-y-1 text-sm">
          {s.holdings.map((h) => (
            <li key={h.symbol} className="flex items-center justify-between rounded bg-slate-800 px-2 py-1">
              <span>{h.symbol} · {h.shares} sh @ ${h.avgCost}</span>
              <button className="text-slate-400 hover:text-red-400" aria-label={`Remove ${h.symbol}`} onClick={() => update({ holdings: s.holdings.filter((x) => x.symbol !== h.symbol) })}>×</button>
            </li>
          ))}
          {!s.holdings.length && <li className="text-xs text-slate-500">None entered.</li>}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Data sources</h2>
        <Row label="Fetch news via Netlify function (recommended, avoids CORS blocks)">
          <input type="checkbox" className="h-4 w-4" checked={s.useServerFeeds} onChange={(e) => update({ useServerFeeds: e.target.checked })} />
        </Row>
        <p className="text-xs text-slate-500">Server-side: Yahoo Finance + Google News (+ Finnhub if FINNHUB_KEY is set). Needs Netlify or <code>npm run dev:full</code>. The sources below only apply when this is off.</p>
        <Row label={`NewsAPI (key ${config.newsApiKey ? 'set' : 'missing'})`}>
          <input type="checkbox" className="h-4 w-4" checked={s.useNewsApi} disabled={!config.newsApiKey} onChange={(e) => update({ useNewsApi: e.target.checked })} />
        </Row>
        <Row label="RSS feeds">
          <input type="checkbox" className="h-4 w-4" checked={s.useRss} onChange={(e) => update({ useRss: e.target.checked })} />
        </Row>
        <textarea className="input h-24 w-full font-mono text-xs" value={s.rssFeeds.join('\n')}
          onChange={(e) => update({ rssFeeds: e.target.value.split('\n').map((x) => x.trim()).filter((x) => /^https:\/\//.test(x)) })} />
        <p className="text-xs text-slate-500">One https URL per line; <code>{'{SYMBOL}'}</code> is substituted. Many feeds block browsers (CORS).</p>
        <Row label="CORS proxy template (optional)">
          <input className="input w-full" placeholder="https://your-proxy.example/?url={URL}" value={s.corsProxy} onChange={(e) => update({ corsProxy: e.target.value.trim() })} />
        </Row>
        <p className="text-xs text-amber-300">A proxy sees every request you make. Only use one you control or trust. X/Twitter search is not fetched in-browser; route it through MCP.</p>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">AI trade review</h2>
        <Row label="Ask Claude to review each signal (REJECT blocks emails)">
          <input type="checkbox" className="h-4 w-4" checked={s.useAiReview} onChange={(e) => update({ useAiReview: e.target.checked })} />
        </Row>
        <p className="text-xs text-slate-500">
          Runs in the <code>/api/review</code> function using ANTHROPIC_API_KEY (never in the browser). With this on: REJECT blocks all emails, auto-email needs APPROVE,
          and a failed review blocks auto-email. Demo mode uses a simulated review. It is a second opinion, not financial advice.
        </p>
        <Row label="Access token (only if APP_ACCESS_TOKEN is set on Netlify; kept for this tab session)">
          <input className="input w-48" type="password" defaultValue={getAccessToken()} onChange={(e) => setAccessToken(e.target.value)} />
        </Row>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">MCP (optional)</h2>
        <Row label={`Use MCP for signals (endpoint/key ${mcpConfigured() ? 'configured' : 'missing'})`}>
          <input type="checkbox" className="h-4 w-4" checked={s.useMcp} onChange={(e) => void st.setUseMcp(e.target.checked)} />
        </Row>
        <p className="text-xs text-slate-500">Responses must include a valid <code>X-MCP-Signature</code> (HMAC-SHA256 of body with the API key). MCP is only called in live mode.</p>
        <p className="mt-2 text-sm">Last MCP response</p>
        <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-2 text-xs">{st.mcpLast || 'none yet'}</pre>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Netlify environment (build-time)</h2>
        <ul className="text-sm">
          <li>NETLIFY_MCP_ENDPOINT: <Badge ok={!!config.mcpEndpoint} /></li>
          <li>NETLIFY_MCP_API_KEY: <Badge ok={!!config.mcpApiKey} /></li>
          <li>EMAILJS_SERVICE_ID / TEMPLATE_ID / USER_ID: <Badge ok={emailConfigured()} /></li>
          <li>NEWSAPI_KEY: <Badge ok={!!config.newsApiKey} /></li>
          <li>FORCE_MOCK: {config.forceMock ? 'true' : 'false'}</li>
        </ul>
        <p className="mt-2 text-xs text-slate-400">
          Netlify dashboard → Site configuration → Environment variables, then redeploy. These values are compiled into the public
          JS bundle: use restricted keys and see the README security note.
        </p>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Import / export</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => download('trading-assistant-backup.json', JSON.stringify(buildBackup(s, st.watchlist, st.history), null, 2), 'application/json')}>Export settings + history (JSON)</button>
          <button className="btn" onClick={() => file.current?.click()}>Import JSON</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Exports exclude the passphrase hash. History CSV export is on the History page.</p>
      </section>
    </div>
  );
}
