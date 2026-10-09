import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { config, emailConfigured, mcpConfigured } from '../lib/config';
import { buildBackup, download } from '../lib/storage';
import type { HistoryItem } from '../types';
import { cleanSymbol, fmtInterval } from '../lib/util';
import { Logs } from './Logs';
import { useTrends } from '../lib/useTrends';
import { taxInfo, taxText } from '../lib/holdings';
import { getAccessToken, setAccessToken } from '../lib/api';
import {
  alertAction, canPromptInstall, currentSubscription, disablePush, enablePush, getAlertStatus, isIos, isStandalone, onInstallAvailable, promptInstall, pushSupported,
  type AlertStatus,
} from '../lib/alerts';
import { ActionChip, Change, Field, Icon, Section, Toggle } from '../components/ui';

const Ready = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${ok ? 'border-emerald-300/40 text-emerald-200' : 'border-white/15 text-slate-400'}`}>
    {ok ? '✓' : '○'} {label}
  </span>
);

export function Settings() {
  const st = useStore();
  const { settings: s, update, toast } = st;
  const [tok, setTok] = useState(getAccessToken());
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const holdTrends = useTrends(s.holdings.map((h) => h.symbol), s);
  const [hSym, setHSym] = useState('');
  const [hShares, setHShares] = useState('');
  const [hCost, setHCost] = useState('');
  const [hDate, setHDate] = useState('');
  const [wSym, setWSym] = useState('');
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [busy, setBusy] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [installable, setInstallable] = useState(canPromptInstall());

  const loadStatus = async () => {
    try {
      setStatus(await getAlertStatus());
      setStatusErr('');
    } catch (e) {
      setStatusErr(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (getAccessToken()) void loadStatus();
    void currentSubscription().then((x) => setPushOn(!!x));
    const off = onInstallAvailable(() => setInstallable(true));
    return () => {
      off();
    };
  }, []);

  const addHolding = () => {
    const symbol = cleanSymbol(hSym);
    const shares = Number(hShares);
    const avgCost = Number(hCost);
    if (!symbol || !(shares > 0) || !(avgCost >= 0)) return toast('error', 'Enter a symbol, shares above 0 and the average price you paid.');
    const today = new Date().toISOString().slice(0, 10);
    if (hDate && hDate > today) return toast('error', 'The date you bought it can\'t be in the future.');
    // Keep the earlier purchase date when updating shares without entering a new one.
    const boughtAt = hDate || s.holdings.find((h) => h.symbol === symbol)?.boughtAt;
    update({ holdings: [...s.holdings.filter((h) => h.symbol !== symbol), { symbol, shares, avgCost, ...(boughtAt ? { boughtAt } : {}) }] });
    toast('success', `${symbol} saved.`);
    setHSym(''); setHShares(''); setHCost(''); setHDate('');
  };
  const addWatch = () => {
    const sym = cleanSymbol(wSym);
    if (sym && !st.watchlist.includes(sym)) st.setWatchlist([...st.watchlist, sym]);
    setWSym('');
  };

  const savePass = async () => {
    if (pass.length < 8) return toast('error', 'Use at least 8 characters.');
    if (pass !== pass2) return toast('error', 'The two passphrases do not match.');
    await st.setPassphrase(pass);
    setPass(''); setPass2('');
    toast('success', 'Passphrase saved (as a salted hash).');
  };

  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label);
    try {
      await f();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const setServerAlerts = (on: boolean) =>
    run('server', async () => {
      if (!on) {
        update({ serverAlerts: false });
        return toast('info', 'Background alerts are off.');
      }
      if (!getAccessToken()) throw new Error('Turn on sync first (Sync & access): background alerts read your synced holdings.');
      if (!s.passphraseHash) throw new Error('Set a passphrase first (just above).');
      if (!/^\S+@\S+\.\S+$/.test(s.toEmail)) throw new Error('Enter the email address to send to first.');
      if (!(await st.requestUnlock('Turn on background alerts: the server will check once an hour on weekdays and email you approved trades, even with the app closed.'))) return;
      update({ serverAlerts: true });
      toast('success', 'Background alerts are on. They start within the hour (weekdays, about 7am-7pm New York).');
      void loadStatus();
    });

  const togglePush = (on: boolean) =>
    run('push', async () => {
      if (!on) {
        await disablePush();
        setPushOn(false);
        return toast('info', 'Notifications are off on this device.');
      }
      const st2 = status ?? (await getAlertStatus());
      if (!st2.vapidPublicKey) throw new Error('Notifications need VAPID keys in Netlify (see the README).');
      await enablePush(st2.vapidPublicKey);
      setPushOn(true);
      toast('success', 'Notifications are on for this device.');
      void loadStatus();
    });

  const importBackup = async (f: File) => {
    try {
      const b = JSON.parse(await f.text());
      if (b?.version !== 1) throw new Error('Unknown backup version');
      if (b.settings) update({ ...b.settings, passphraseHash: s.passphraseHash, passphraseSalt: s.passphraseSalt, stopped: s.stopped, autoEmail: false });
      if (Array.isArray(b.watchlist)) st.setWatchlist(b.watchlist.map(cleanSymbol).filter(Boolean));
      if (Array.isArray(b.history)) st.setHistory(b.history as HistoryItem[]);
      toast('success', 'Backup imported. Auto-email was left off.');
    } catch (e) {
      toast('error', `Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const limitSymbols = [...new Set([...s.holdings.map((h) => h.symbol), ...st.watchlist])];

  return (
    <div className="mx-auto max-w-[1400px] space-y-3">
      <h2 className="text-2xl font-semibold">Settings</h2>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
        <div className="space-y-3">
      {/* ---------------- holdings ---------------- */}
      <Section title="My holdings" subtitle={`${s.holdings.length} stock${s.holdings.length === 1 ? '' : 's'} · what you own in Fidelity`} icon={Icon.wallet} defaultOpen>
        <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-2 sm:grid-cols-[1fr_1fr_1fr_1.3fr_auto]">
          <input className="input w-full min-w-0" placeholder="Symbol" value={hSym} onChange={(e) => setHSym(e.target.value)} aria-label="Symbol" />
          <input className="input w-full min-w-0" placeholder="Shares" inputMode="decimal" value={hShares} onChange={(e) => setHShares(e.target.value)} aria-label="Shares" />
          <input className="input w-full min-w-0" placeholder="Avg price $" inputMode="decimal" value={hCost} onChange={(e) => setHCost(e.target.value)} aria-label="Average price paid" />
          <label className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
            <span className="shrink-0 text-xs text-slate-400">Bought</span>
            <input className="input w-full min-w-0" type="date" value={hDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setHDate(e.target.value)} aria-label="Date you bought it (optional)" />
          </label>
          <button className="btn-primary col-span-1" onClick={addHolding}>Save</button>
        </div>
        <ul className="space-y-2">
          {s.holdings.map((h) => {
            const t = holdTrends.rows.find((r) => r.symbol === h.symbol);
            return (
              <li key={h.symbol} className="panel">
                <div className="flex items-center gap-2">
                  <b className="font-display text-base">{h.symbol}</b>
                  {t?.action && <ActionChip action={t.action} size="sm" />}
                  <span className="num text-sm text-slate-400">{h.shares} sh @ ${h.avgCost}</span>
                  <button className="ml-auto px-2 text-slate-400 hover:text-red-300" aria-label={`Remove ${h.symbol}`} onClick={() => window.confirm(`Remove ${h.symbol} from your holdings?`) && update({ holdings: s.holdings.filter((x) => x.symbol !== h.symbol) })}>✕</button>
                </div>
                {t ? (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                    <span className="num">${t.price}</span>
                    <Change value={(t.price - h.avgCost) * h.shares} pct={h.avgCost > 0 ? ((t.price - h.avgCost) / h.avgCost) * 100 : 0} />
                    <span className="basis-full text-xs text-slate-400">{t.idea}</span>
                    {taxInfo(h) && <span className="basis-full text-xs text-slate-500">🧾 Bought {h.boughtAt} · {taxText(taxInfo(h)!, t.price - h.avgCost)}</span>}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">{holdTrends.loading ? 'Checking…' : 'No price yet.'}</p>
                )}
              </li>
            );
          })}
        </ul>
        {s.holdings.length > 0 && (
          <div className="flex items-center gap-2">
            <button className="btn" disabled={holdTrends.loading} onClick={() => void holdTrends.reload()}>{holdTrends.loading ? <><span className="spinner" /> Checking…</> : 'Check again'}</button>
            {holdTrends.updated && <span className="text-xs text-slate-500">Updated {holdTrends.updated}</span>}
          </div>
        )}
        <p className="text-xs text-slate-500">"Bought" is optional: the date of your first purchase. It lets the app warn you before selling a gain that is close to becoming long-term (lower tax). To add a date later, enter the stock again with the date.</p>
        <div className="space-y-1 border-t border-white/10 pt-3">
          <Field label="Cash ready to invest ($)" hint="Optional. Cash sitting in your Fidelity account. Used to warn when a buy costs more than you have, and counted in 'Where your money is'.">
            <input className="input w-32" type="number" min={0} inputMode="decimal" placeholder="e.g. 2000" value={s.cash ?? ''} onChange={(e) => update({ cash: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="How long will you keep this money invested?" hint="Optional. Helps the AI judge risk: short = avoid jumpy stocks, long = daily noise matters less.">
            <select className="input w-full sm:w-52" value={s.horizon ?? ''} onChange={(e) => update({ horizon: (e.target.value || undefined) as typeof s.horizon })}>
              <option value="">Not set</option>
              <option value="short">Under 1 year</option>
              <option value="medium">1 to 5 years</option>
              <option value="long">More than 5 years</option>
            </select>
          </Field>
        </div>
        <div className="border-t border-white/10 pt-3">
          <p className="text-sm text-slate-200">Also watching <span className="text-slate-500">(optional, not owned)</span></p>
          <div className="mt-2 flex gap-2">
            <input className="input w-full" placeholder="Symbol, e.g. NVDA" value={wSym} onChange={(e) => setWSym(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWatch()} />
            <button className="btn" onClick={addWatch}>Add</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {st.watchlist.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm">
                {w}
                <button aria-label={`Remove ${w}`} className="px-1 text-slate-400 hover:text-red-300" onClick={() => st.setWatchlist(st.watchlist.filter((x) => x !== w))}>✕</button>
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------------- risk ---------------- */}
      <Section title="Risk & orders" subtitle={`Risk ${'$' + s.riskPerTrade} per trade · stop-loss ${s.smartStop ? 'smart' : s.stopLossPct + '%'}`} icon={Icon.shield}>
        <Field label="Most I want to lose on one trade ($)" hint="Used to suggest how many shares to buy.">
          <input className="input w-28" type="number" min={1} value={s.riskPerTrade} onChange={(e) => update({ riskPerTrade: Math.max(1, Number(e.target.value) || 100) })} />
        </Field>
        <Field label="Smart stop-loss" hint="Sized to each stock's normal daily moves (2.5× a typical day, 3–15%). Off = the fixed % below.">
          <Toggle on={s.smartStop} onChange={(v) => update({ smartStop: v })} label="Smart stop-loss" />
        </Field>
        <Field label={s.smartStop ? 'Fixed stop-loss (used when a stock has no price history)' : 'Stop-loss (% below the buy price)'}>
          <input className="input w-28" type="number" min={1} max={50} value={s.stopLossPct} onChange={(e) => update({ stopLossPct: Math.min(50, Math.max(1, Number(e.target.value) || 5)) })} />
        </Field>
        <Field label="Default number of shares">
          <input className="input w-28" type="number" min={1} value={s.defaultQty} onChange={(e) => update({ defaultQty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
        </Field>
        <Field label={`Ignore signals below ${(s.minConfidence * 100).toFixed(0)}%`}>
          <input type="range" className="accent-cyan-400" min={0.3} max={0.95} step={0.05} value={s.minConfidence} onChange={(e) => update({ minConfidence: Number(e.target.value) })} />
        </Field>
        {limitSymbols.length > 0 && (
          <div>
            <p className="text-sm text-slate-200">Limit prices <span className="text-slate-500">(optional; empty = market order)</span></p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {limitSymbols.map((w) => (
                <label key={w} className="flex items-center gap-2 text-xs">
                  <span className="w-12 font-semibold">{w}</span>
                  <input className="input w-full" inputMode="decimal" placeholder="MKT" value={s.limits[w] ?? ''}
                    onChange={(e) => { const next = { ...s.limits }; const n = Number(e.target.value); if (n > 0) next[w] = n; else delete next[w]; update({ limits: next }); }} />
                </label>
              ))}
            </div>
          </div>
        )}
      </Section>

        </div>
        <div className="space-y-3">
      {/* ---------------- alerts ---------------- */}
      <Section
        title="Alerts & email"
        subtitle={`Auto-email ${s.autoEmail ? 'on' : 'off'} · background ${s.serverAlerts ? 'on' : 'off'}`}
        icon={Icon.bell}
      >
        <Field label="Passphrase" hint={`${s.passphraseHash ? 'Set' : 'Not set yet'} · this device is ${st.unlocked ? 'unlocked (24 h)' : 'locked'}`}>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input className="input flex-1 sm:w-36" type="password" placeholder="New passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
            <input className="input flex-1 sm:w-28" type="password" placeholder="Repeat" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            <button className="btn" onClick={() => void savePass()}>{s.passphraseHash ? 'Change' : 'Set'}</button>
          </div>
        </Field>
        <Field label="Send emails to">
          <input className="input w-full sm:w-64" type="email" value={s.toEmail} onChange={(e) => update({ toEmail: e.target.value.trim() })} placeholder="you@example.com" />
        </Field>
        <Field label="AI check on every signal" hint="Claude reviews each signal against your holdings. SKIP blocks the email.">
          <Toggle on={s.useAiReview} onChange={(v) => update({ useAiReview: v })} label="AI check" />
        </Field>
        <div className="panel space-y-2">
          <p className="label">Save AI credits</p>
          <Field label={`Only auto-check signals scoring ${(s.aiMinConfidence * 100).toFixed(0)}% or more`} hint="Weaker signals get an AI check button instead of a paid automatic check.">
            <input type="range" className="accent-cyan-400" min={0.5} max={0.95} step={0.05} value={s.aiMinConfidence} onChange={(e) => update({ aiMinConfidence: Number(e.target.value) })} />
          </Field>
          <Field label="Most AI checks per day" hint="All devices, Ideas and background alerts together. Resets at midnight UTC.">
            <input className="input w-24" type="number" min={0} max={500} value={s.aiDailyLimit} onChange={(e) => update({ aiDailyLimit: Math.min(500, Math.max(0, Math.floor(Number(e.target.value)) || 0)) })} />
          </Field>
          <p className="text-xs text-slate-500">
            {status?.ai ? `Today: ${status.ai.used} of ${status.ai.limit} used · model ${status.ai.model}. ` : ''}
            Repeated questions are answered from a 2-hour cache for free, and "sell what you don't own" is caught by a free rule. Roughly 1 cent per check.
          </p>
        </div>
        <Field label="Check the news every" hint="While the app is open.">
          <select className="input" value={s.pollIntervalSec} onChange={(e) => update({ pollIntervalSec: Number(e.target.value) })}>
            {[...new Set([60, 120, 300, 600, 900, 1800, s.pollIntervalSec])].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{fmtInterval(v)}</option>)}
          </select>
        </Field>

        <div className="panel space-y-2">
          <Field label="Auto-email (app open)" hint="Emails approved signals automatically while this device has the app open.">
            <Toggle on={s.autoEmail} onChange={(v) => void st.setAutoEmail(v)} label="Auto-email" />
          </Field>
          <Field label={`Only when the signal score is ${(s.autoEmailMinConfidence * 100).toFixed(0)}% or more`} hint="Also used by background alerts.">
            <input type="range" className="accent-cyan-400" min={0.6} max={0.95} step={0.05} value={s.autoEmailMinConfidence} onChange={(e) => update({ autoEmailMinConfidence: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="panel space-y-2">
          <Field label="Background alerts (app closed)" hint="The server checks once an hour on weekdays (about 7am-7pm New York) and emails / notifies you only when the AI approves.">
            <Toggle on={s.serverAlerts} disabled={busy === 'server'} onChange={(v) => void setServerAlerts(v)} label="Background alerts" />
          </Field>
          <Field label="Weekly summary" hint="Friday after the close: profit/loss, this week's alerts and the scoreboard.">
            <Toggle on={s.weeklySummary} onChange={(v) => update({ weeklySummary: v })} label="Weekly summary" />
          </Field>
          {status && (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <Ready ok={status.ready.ai} label="AI key" />
                <Ready ok={status.ready.email} label="Server email" />
                <Ready ok={status.ready.push} label="Notifications" />
                <Ready ok={!!status.ready.reddit} label="Reddit" />
                <span className="text-slate-500">{status.lastRun ? `Last check ${new Date(status.lastRun).toLocaleString()}` : 'No background check yet'}</span>
              </div>
              {status.log.slice(0, 4).map((l, i) => <p key={i} className={l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-amber-200' : 'text-slate-400'}>{new Date(l.ts).toLocaleTimeString()} · {l.msg}</p>)}
            </div>
          )}
          {statusErr && <p className="text-xs text-amber-200">{statusErr}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={!!busy} onClick={() => void run('run', async () => { const r = await alertAction<{ ran: boolean; reason?: string; signals?: number; emailed?: number }>({ action: 'run-now' }); toast(r.ran ? 'success' : 'info', r.ran ? `Checked: ${r.signals ?? 0} signal(s), ${r.emailed ?? 0} email(s).` : r.reason ?? 'Did not run.'); void loadStatus(); })}>{busy === 'run' ? <><span className="spinner" /> Checking…</> : 'Run a check now'}</button>
            <button className="btn" disabled={!!busy || !s.toEmail} onClick={() => void run('mail', async () => { await alertAction({ action: 'test-email', to: s.toEmail }); toast('success', `Test email sent to ${s.toEmail}.`); })}>Test email</button>
            <button className="btn" disabled={!!busy} onClick={() => void run('weekly', async () => { const r = await alertAction<{ sent: boolean; reason?: string }>({ action: 'weekly-now' }); toast(r.sent ? 'success' : 'info', r.sent ? 'Weekly summary sent.' : r.reason ?? 'Not sent.'); })}>Send summary now</button>
          </div>
        </div>

        <div className="panel space-y-2">
          <Field label="Notifications on this device" hint={pushSupported() ? 'A phone/computer alert when a background alert fires.' : isIos() && !isStandalone() ? 'On iPhone: add the app to your Home Screen first, then open it from there.' : 'Not supported in this browser.'}>
            <Toggle on={pushOn} disabled={busy === 'push' || !pushSupported()} onChange={(v) => void togglePush(v)} label="Notifications" />
          </Field>
          <Field label="Android app notifications" hint={status?.firebase ? `Firebase key saved (project ${status.firebase}). ${status.phones ?? 0} phone(s) get alerts.` : 'Upload your Firebase key file once (from your computer) so the Android app can get phone alerts. See Guide → Android app.'}>
            <div className="flex flex-wrap gap-2">
              <label className={`btn ${busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                {busy === 'fb' ? <><span className="spinner" /> Saving…</> : status?.firebase ? 'Replace key file' : 'Upload key file'}
                <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void run('fb', async () => {
                    let key: unknown;
                    try { key = JSON.parse(await f.text()); } catch { throw new Error('That file is not a Firebase key file (.json).'); }
                    const r = await alertAction<{ firebase: string }>({ action: 'firebase-key', key });
                    toast('success', `Firebase key saved (project ${r.firebase}).`);
                    void loadStatus();
                  });
                }} />
              </label>
              {status?.firebase && <button className="btn" disabled={!!busy} onClick={() => window.confirm('Remove the Firebase key? Phones stop getting notifications.') && void run('fbx', async () => { await alertAction({ action: 'firebase-key', key: null }); toast('success', 'Firebase key removed.'); void loadStatus(); })}>Remove</button>}
            </div>
          </Field>
          {pushOn && <button className="btn" disabled={!!busy} onClick={() => void run('tp', async () => { await alertAction({ action: 'test-push' }); toast('success', 'Test notification sent.'); })}>Send test notification</button>}
          {!isStandalone() && (
            <Field label="Install as an app" hint={isIos() ? 'Safari: tap Share, then "Add to Home Screen".' : installable ? 'Adds a full-screen icon to your home screen.' : 'Use your browser menu: "Install app" or "Add to Home screen".'}>
              {installable && <button className="btn" onClick={() => void promptInstall().then((ok) => ok && toast('success', 'Installed.'))}>Install</button>}
            </Field>
          )}
        </div>
      </Section>

      {/* ---------------- sync ---------------- */}
      <Section
        title="Sync & access"
        subtitle={st.syncStatus === 'ok' ? 'Synced across your devices' : st.syncStatus === 'error' ? 'Sync error' : 'Off'}
        icon={Icon.sync}
        right={<span className={`h-2 w-2 rounded-full ${st.syncStatus === 'ok' ? 'bg-emerald-400' : st.syncStatus === 'error' ? 'bg-red-400' : 'bg-slate-500'}`} />}
      >
        <p className="text-xs text-slate-400">
          Enter the same access token (Netlify <code>APP_ACCESS_TOKEN</code>) on each device. Holdings, history, settings and the scoreboard then sync.
          Stop Alerts, auto-email, MCP and notifications stay per device.
        </p>
        <div className="flex flex-wrap gap-2">
          <input className="input w-full sm:w-64" type="password" placeholder="Access token" value={tok} onChange={(e) => setTok(e.target.value)} />
          <button className="btn-primary" disabled={st.syncStatus === 'syncing'} onClick={() => { setAccessToken(tok.trim()); void st.syncNow(true).then(loadStatus); }}>
            {st.syncStatus === 'syncing' ? <><span className="spinner" /> Syncing…</> : 'Save & sync now'}
          </button>
        </div>
        <p className={`text-sm ${st.syncStatus === 'error' ? 'text-red-300' : st.syncStatus === 'ok' ? 'text-emerald-300' : 'text-slate-400'}`}>
          {st.syncStatus === 'off' ? 'Sync is off.' : st.syncStatus === 'ok' ? `✓ ${st.syncMessage} (${new Date(st.lastSync).toLocaleTimeString()})` : st.syncStatus === 'error' ? `✕ ${st.syncMessage}` : 'Syncing…'}
        </p>
      </Section>

      {/* ---------------- advanced ---------------- */}
      <Section title="Advanced" subtitle="Data sources, MCP, backups, activity log" icon={Icon.wrench}>
        <div className="panel space-y-1 text-sm text-slate-300">
          <p className="label">Status</p>
          <p>News checks: {s.stopped ? <b className="text-red-300">stopped</b> : st.polling ? `every ${fmtInterval(s.pollIntervalSec)}` : 'idle'}{st.lastPoll ? ` · last ${new Date(st.lastPoll).toLocaleTimeString()}` : ''}</p>
          <p className="text-xs text-slate-500">
            Build settings: EmailJS {emailConfigured() ? '✓' : '—'} · MCP {mcpConfigured() ? '✓' : '—'} · NewsAPI {config.newsApiKey ? '✓' : '—'}
            {config.siteName && <> · <a className="text-cyan-300 underline" href={`https://app.netlify.com/sites/${config.siteName}/deploys`} target="_blank" rel="noopener noreferrer">Netlify deploys</a></>}
          </p>
        </div>

        <p className="label pt-1">News sources</p>
        <Field label="Fetch news through the Netlify function" hint="Recommended: Yahoo, Google News, Nasdaq, official SEC filings (+ Finnhub). Avoids browser blocks.">
          <Toggle on={s.useServerFeeds} onChange={(v) => update({ useServerFeeds: v })} label="Server news" />
        </Field>
        <Field label={`NewsAPI (key ${config.newsApiKey ? 'set' : 'missing'})`} hint="Only used when the option above is off.">
          <Toggle on={s.useNewsApi} disabled={!config.newsApiKey} onChange={(v) => update({ useNewsApi: v })} label="NewsAPI" />
        </Field>
        <Field label="RSS feeds in the browser" hint="Only used when the server option is off. Many feeds block browsers.">
          <Toggle on={s.useRss} onChange={(v) => update({ useRss: v })} label="RSS" />
        </Field>
        <textarea className="input h-20 w-full font-mono text-xs" value={s.rssFeeds.join('\n')} aria-label="RSS feed URLs"
          onChange={(e) => update({ rssFeeds: e.target.value.split('\n').map((x) => x.trim()).filter((x) => /^https:\/\//.test(x)) })} />
        <input className="input w-full" placeholder="CORS proxy template, e.g. https://proxy.example/?url={URL}" value={s.corsProxy} onChange={(e) => update({ corsProxy: e.target.value.trim() })} />

        <p className="label pt-2">MCP</p>
        <Field label={`Use MCP for signals (${mcpConfigured() ? 'configured' : 'not configured'})`} hint="Responses must carry a valid X-MCP-Signature. Live mode only.">
          <Toggle on={s.useMcp} onChange={(v) => void st.setUseMcp(v)} label="MCP" />
        </Field>
        {st.mcpLast && <pre className="panel max-h-32 overflow-auto text-xs">{st.mcpLast}</pre>}

        <p className="label pt-2">Backup</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => download('trading-assistant-backup.json', JSON.stringify(buildBackup(s, st.watchlist, st.history), null, 2), 'application/json')}>Export (JSON)</button>
          <button className="btn" onClick={() => file.current?.click()}>Import</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])} />
        </div>

        <p className="label pt-2">Activity log</p>
        <Logs />
      </Section>
        </div>
      </div>
    </div>
  );
}
