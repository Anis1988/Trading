import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Headline, HistoryItem, LogEntry, Review, ScoreEntry, Settings, Signal } from './types';
import { fetchReview } from './lib/api';
import { emailConfigured, mcpConfigured } from './lib/config';
import { KEYS, load, loadSettings, save } from './lib/storage';
import { fetchAllNews } from './lib/news';
import { generateSignals, isDuplicate } from './lib/signals';
import { callMcp } from './lib/mcp';
import { sendTradeEmail } from './lib/email';
import { formatInstruction, planOrder } from './lib/instructions';
import { Poller } from './lib/poller';
import { computeRisk, stopPctFor } from './lib/risk';
import { fetchTrendSeries } from './lib/api';
import { analyze, type Analysis } from './lib/trend';
import { TREND_CHECK_EVERY_MS, trendSellSignals } from './lib/trendSignals';
import { hashPassphrase, newSalt, nowIso, uid, timingSafeEqual } from './lib/util';
import { mergeHistory, mergeScoreLog, pullRemote, pushRemote, snapshot, type SyncData } from './lib/sync';
import { getAccessToken } from './lib/api';
import { PassphraseModal } from './components/PassphraseModal';

const UNLOCK_MS = 24 * 3600_000; // passphrase once a day per device
const MAX_NEWS_AGE_MS = 24 * 3600_000; // older headlines never create signals
const MAX_AUTO_EMAILS_PER_HOUR = 10;

interface Store {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  watchlist: string[];
  setWatchlist: (w: string[]) => void;
  signals: Signal[];
  history: HistoryItem[];
  scoreLog: ScoreEntry[];
  setHistory: (h: HistoryItem[]) => void;
  patchHistory: (id: string, patch: Partial<HistoryItem>) => void;
  logs: LogEntry[];
  clearLogs: () => void;
  headlines: Headline[];
  mcpLast: string;
  unlocked: boolean;
  lastPoll: string;
  polling: boolean;
  log: (level: LogEntry['level'], msg: string) => void;
  setPassphrase: (p: string) => Promise<void>;
  requestUnlock: (reason: string) => Promise<boolean>;
  setAutoEmail: (on: boolean) => Promise<void>;
  setUseMcp: (on: boolean) => Promise<void>;
  panic: () => void;
  resume: () => void;
  emailSignal: (s: Signal) => Promise<void>;
  copySignal: (s: Signal) => Promise<void>;
  dismissSignal: (s: Signal) => void;
  syncStatus: 'off' | 'syncing' | 'ok' | 'error';
  syncMessage: string;
  lastSync: string;
  syncNow: (manual?: boolean) => Promise<void>;
  toast: (kind: Toast['kind'], msg: string) => void;
  sending: string[];
  toasts: Toast[];
  dismissToast: (id: string) => void;
  reviewSignal: (s: Signal) => Promise<Review | null>;
  setSignalQty: (id: string, qty: number) => void;
  addIdeaSignal: (symbol: string, price: number, reason: string, confidence: number, news?: { title: string; url: string }) => void;
}

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'warn' | 'info';
  msg: string;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = loadSettings();
    return s;
  });
  const [watchlist, setWatchlistState] = useState<string[]>(() => load(KEYS.watchlist, []));
  const [signals, setSignals] = useState<Signal[]>(() =>
    // A review that was running when the page closed can never finish: mark it so Re-review works.
    load<Signal[]>(KEYS.signals, [])
      .filter((s) => (s.source as string) !== 'mock' && !s.review?.simulated) // leftovers from the removed demo mode
      .map((s) => (s.reviewStatus === 'pending' ? { ...s, reviewStatus: 'error', reviewError: 'Interrupted by a page reload. Tap Re-check.' } : s)),
  );
  const [scoreLog, setScoreLog] = useState<ScoreEntry[]>(() => load(KEYS.scoreLog, []));
  const [history, setHistory] = useState<HistoryItem[]>(() => load(KEYS.history, []));
  const [logs, setLogs] = useState<LogEntry[]>(() => load(KEYS.logs, []));
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [mcpLast, setMcpLast] = useState<string>(() => load(KEYS.mcpLast, ''));
  const [unlocked, setUnlocked] = useState(() => Number(load(KEYS.unlockUntil, 0)) > Date.now());
  const [lastPoll, setLastPoll] = useState('');
  const [polling, setPolling] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'off' | 'syncing' | 'ok' | 'error'>('off');
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSync, setLastSync] = useState('');
  const [sending, setSending] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<{ reason: string; resolve: (ok: boolean) => void } | null>(null);

  const ref = useRef({ settings, watchlist, signals, unlocked, headlines, history, scoreLog });
  ref.current = { settings, watchlist, signals, unlocked, headlines, history, scoreLog };
  // Headlines already processed survive reloads, so old news cannot fire again.
  const seen = useRef(new Set<string>(load<string[]>(KEYS.seen, [])));
  const unlockTimer = useRef<ReturnType<typeof setTimeout>>();
  const autoSent = useRef<number[]>([]);
  const lastErr = useRef('');
  const lastTrendCheck = useRef(0);

  useEffect(() => save(KEYS.settings, settings), [settings]);
  useEffect(() => save(KEYS.watchlist, watchlist), [watchlist]);
  useEffect(() => save(KEYS.signals, signals.slice(0, 200)), [signals]);
  useEffect(() => save(KEYS.history, history), [history]);
  useEffect(() => save(KEYS.logs, logs), [logs]);
  useEffect(() => save(KEYS.mcpLast, mcpLast), [mcpLast]);
  useEffect(() => save(KEYS.scoreLog, scoreLog), [scoreLog]);
  // Re-lock when the day-long unlock expires.
  useEffect(() => {
    const left = Number(load(KEYS.unlockUntil, 0)) - Date.now();
    if (left > 0) unlockTimer.current = setTimeout(() => setUnlocked(false), left);
    return () => clearTimeout(unlockTimer.current);
  }, []);

  const log = useCallback((level: LogEntry['level'], msg: string) => {
    setLogs((l) => [{ id: uid(), ts: nowIso(), level, msg }, ...l].slice(0, 300));
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((kind: Toast['kind'], msg: string) => {
    const id = uid();
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000);
  }, [dismissToast]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setWatchlist = useCallback((w: string[]) => setWatchlistState(w), []);
  const patchHistory = useCallback((id: string, patch: Partial<HistoryItem>) => {
    setHistory((h) => h.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: nowIso() } : x)));
    log('info', `History ${id} updated: ${Object.keys(patch).join(', ')}`);
  }, [log]);

  const lock = useCallback(() => {
    clearTimeout(unlockTimer.current);
    save(KEYS.unlockUntil, 0);
    setUnlocked(false);
  }, []);

  /** Errors the user caused by tapping something must be visible, not only in the log. */
  const fail = (msg: string) => {
    log('error', msg);
    toast('error', msg);
  };

  const requestUnlock = useCallback(
    (reason: string) => {
      if (ref.current.unlocked) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => setModal({ reason, resolve }));
    },
    [],
  );

  const verify = async (pass: string): Promise<boolean> => {
    const s = ref.current.settings;
    if (!s.passphraseHash) return false;
    return timingSafeEqual(await hashPassphrase(pass, s.passphraseSalt), s.passphraseHash);
  };

  const submitModal = async (pass: string): Promise<boolean> => {
    const ok = await verify(pass);
    if (ok) {
      setUnlocked(true);
      save(KEYS.unlockUntil, Date.now() + UNLOCK_MS);
      clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(() => {
        setUnlocked(false);
        log('info', 'Unlock expired after 24 hours.');
      }, UNLOCK_MS);
      log('info', 'Passphrase accepted; this device stays unlocked for 24 hours.');
      modal?.resolve(true);
      setModal(null);
    } else log('warn', 'Incorrect passphrase attempt.');
    return ok;
  };

  const setPassphrase = async (p: string) => {
    const salt = newSalt();
    update({ passphraseSalt: salt, passphraseHash: await hashPassphrase(p, salt) });
    lock();
    log('info', 'Passphrase set. Session locked.');
  };

  const hasPass = () => !!ref.current.settings.passphraseHash;

  const setAutoEmail = async (on: boolean) => {
    if (!on) {
      update({ autoEmail: false });
      toast('info', 'Auto-email is off.');
      return log('info', 'Auto-email disabled.');
    }
    const s = ref.current.settings;
    if (!hasPass()) return fail('Set a passphrase first (just above).');
    if (!emailConfigured()) return fail('Auto-email needs the EMAILJS_* settings in Netlify.');
    if (!/^\S+@\S+\.\S+$/.test(s.toEmail)) return fail('Enter the email address to send to first.');
    if (!(await requestUnlock('Turn on Auto-Email.'))) return;
    update({ autoEmail: true });
    log('warn', 'Auto-email enabled.');
    toast('success', 'Auto-email is on.');
  };

  const setUseMcp = async (on: boolean) => {
    if (!on) return update({ useMcp: false });
    if (!mcpConfigured()) return fail('MCP needs NETLIFY_MCP_ENDPOINT and NETLIFY_MCP_API_KEY in Netlify.');
    if (!hasPass()) return fail('Set a passphrase first.');
    if (!(await requestUnlock('Confirm enabling MCP processing.'))) return;
    update({ useMcp: true });
    log('warn', 'MCP processing enabled.');
  };

  const panic = () => {
    update({ stopped: true, autoEmail: false });
    lock();
    log('error', 'STOP ALERTS: news checking and auto-email switched off, session locked.');
  };
  const resume = () => {
    update({ stopped: false });
    log('info', 'Polling resumed. Auto-email remains OFF until re-enabled.');
  };

  const setSignalStatus = (id: string, status: Signal['status']) =>
    setSignals((l) => l.map((x) => (x.id === id ? { ...x, status } : x)));

  const addHistory = (sig: Signal, channel: HistoryItem['channel'], status: HistoryItem['status'], note?: string) => {
    const plan = planOrder(ref.current.settings.limits[sig.symbol]);
    setHistory((h) => [
      {
        id: uid(), signalId: sig.id, createdAt: nowIso(), symbol: sig.symbol, side: sig.side, qty: sig.qty,
        orderType: plan.orderType, limitPrice: plan.limitPrice, reason: sig.reason, confidence: sig.confidence,
        channel, status, note, updatedAt: nowIso(),
      },
      ...h,
    ]);
  };

  const patchSignal = (id: string, patch: Partial<Signal>) =>
    setSignals((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  /** AI second opinion. Never throws; on failure the signal is marked reviewStatus:'error' (not approved). */
  const reviewSignal = useCallback(async (sig: Signal, context?: Headline[]): Promise<Review | null> => {
    patchSignal(sig.id, { reviewStatus: 'pending', reviewError: undefined });
    try {
      const cs = ref.current.settings;
      const r = await fetchReview(sig, context ?? ref.current.headlines, cs.holdings, { riskPerTrade: cs.riskPerTrade, stopLossPct: cs.stopLossPct, smartStop: cs.smartStop });
      const qty = r.suggestedQty && r.suggestedQty > 0 ? r.suggestedQty : sig.qty;
      if (qty !== sig.qty) log('info', `${sig.symbol}: quantity changed ${sig.qty} -> ${qty} to match what you own.`);
      const st = ref.current.settings;
      const risk = computeRisk(sig.side, r.price, st.riskPerTrade, stopPctFor(r.volPct, st.stopLossPct, st.smartStop));
      patchSignal(sig.id, { review: r, reviewStatus: undefined, qty, entryPrice: r.price, stopPrice: risk?.stop, suggestedQty: risk?.suggestedQty });
      if (r.price) {
        const entry: ScoreEntry = { id: sig.id, symbol: sig.symbol, side: sig.side, createdAt: sig.createdAt, entryPrice: r.price, verdict: r.verdict, origin: 'app' };
        setScoreLog((l) => mergeScoreLog([{ ...entry }], l));
      }
      log(r.verdict === 'REJECT' ? 'warn' : 'info', `AI review ${sig.symbol}: ${r.verdict} - ${r.rationale}`);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patchSignal(sig.id, { reviewStatus: 'error', reviewError: msg });
      log('error', `AI review failed for ${sig.symbol}: ${msg}`);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  /** Turn a buy idea into a normal signal: it then gets the AI check (with your holdings) and the Email / Copy buttons on Today. */
  const addIdeaSignal = (symbol: string, price: number, reason: string, confidence: number, news?: { title: string; url: string }) => {
    const st = ref.current.settings;
    if (ref.current.signals.some((x) => x.symbol === symbol && x.side === 'BUY' && x.status === 'new')) return toast('info', `${symbol} is already waiting on Today.`);
    const sig: Signal = {
      id: uid(), symbol, side: 'BUY', confidence, reason, qty: st.defaultQty, createdAt: nowIso(), status: 'new',
      source: 'local', headlineUrl: news?.url, entryPrice: price,
    };
    setSignals((l) => [{ ...sig, reviewStatus: st.useAiReview ? 'pending' : undefined }, ...l]);
    log('info', `Idea sent to Today: BUY ${symbol}`);
    toast('success', `${symbol} sent to Today for the AI check.`);
    if (st.useAiReview) {
      const ctx: Headline[] = news ? [{ id: 'idea-' + symbol, title: news.title, url: news.url, source: 'scan', publishedAt: nowIso(), symbol }] : [];
      void reviewSignal(sig, ctx);
    }
  };

  const emailSignal = useCallback(async (sig: Signal, auto = false) => {
    const { settings: s } = ref.current;
    // Manual clicks always get on-screen feedback; automatic sends only write to the log.
    const say = (level: LogEntry['level'], msg: string) => {
      log(level, msg);
      if (!auto) toast(level === 'error' ? 'error' : 'warn', msg);
    };
    if (s.stopped) return say('warn', 'Alerts are stopped. Email not sent.');
    // Re-read the latest copy: the review may have completed after this object was captured.
    const current = ref.current.signals.find((x) => x.id === sig.id) ?? sig;
    if (auto && current.confidence < s.autoEmailMinConfidence) {
      return log('info', `Auto-email for ${sig.symbol} skipped: confidence ${(current.confidence * 100).toFixed(0)}% is below your ${(s.autoEmailMinConfidence * 100).toFixed(0)}% minimum.`);
    }
    if (s.useAiReview) {
      if (current.review?.verdict === 'REJECT') return say('error', `Email blocked: the AI said do not ${sig.side} ${sig.symbol}.`);
      if (auto && current.review?.verdict !== 'APPROVE') return log('warn', `Auto-email for ${sig.symbol} skipped: needs AI verdict APPROVE (got ${current.review?.verdict ?? 'none'}).`);
      if (!auto && current.reviewStatus === 'pending') return say('warn', 'AI review is still running. Try again in a moment.');
      if (!auto && current.review?.verdict !== 'APPROVE') log('warn', `Emailing ${sig.symbol} without AI approval (${current.review?.verdict ?? 'no review'}).`);
    }
    // Automatic sends were authorised when Auto-Email was switched on (passphrase); manual sends ask each session.
    if (!auto && !ref.current.unlocked) {
      if (!hasPass()) return say('error', 'Set a passphrase in Settings before sending emails.');
      if (!(await requestUnlock(`Confirm emailing ${sig.side} ${sig.symbol}.`))) return toast('info', 'Cancelled. No email sent.');
    }
    if (auto) {
      const cutoff = Date.now() - 3600_000;
      autoSent.current = autoSent.current.filter((t) => t > cutoff);
      if (autoSent.current.length >= MAX_AUTO_EMAILS_PER_HOUR) return log('warn', 'Auto-email hourly cap reached; skipped.');
      autoSent.current.push(Date.now());
    }
    const plan = planOrder(s.limits[sig.symbol]);
    const label = `${sig.side} ${current.qty} ${sig.symbol}`;
    setSending((l) => [...l, sig.id]);
    try {
      await sendTradeEmail(current, plan, s.toEmail);
      log('info', `Email sent: ${label}`);
      addHistory(sig, 'email', 'pending');
      setSignalStatus(sig.id, 'emailed');
      toast('success', `Email sent: ${label}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : (e as { text?: string })?.text ?? JSON.stringify(e);
      log('error', `Email failed for ${sig.symbol}: ${raw}`);
      addHistory(sig, 'email', 'failed', raw);
      toast('error', `Email FAILED for ${label}: ${raw}`);
    } finally {
      setSending((l) => l.filter((x) => x !== sig.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, requestUnlock]);

  const copySignal = async (sig: Signal) => {
    const text = formatInstruction(ref.current.signals.find((x) => x.id === sig.id) ?? sig, planOrder(ref.current.settings.limits[sig.symbol]));
    try {
      await navigator.clipboard.writeText(text);
      log('info', `Instruction copied for ${sig.symbol}`);
      toast('success', `Copied ${sig.side} ${sig.symbol} instructions`);
    } catch {
      log('warn', 'Clipboard unavailable; instruction shown in Logs.\n' + text);
      toast('warn', 'Could not copy. The text is in the Logs tab.');
    }
    addHistory(sig, 'copy', 'pending', 'Manual execution in Fidelity');
    setSignalStatus(sig.id, 'copied');
  };

  const dismissSignal = (sig: Signal) => setSignalStatus(sig.id, 'dismissed');

  // ---- cross-device sync (settings, watchlist, holdings, history) via /api/sync ----
  const sync = useRef({ at: load<string | null>('ta.syncAt', null), lastJson: '', skipNext: false, busy: false, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const jsonOf = (d: SyncData) => JSON.stringify(d);

  const syncNow = useCallback(async (manual = false) => {
    const sc = sync.current;
    if (!getAccessToken()) {
      if (manual) toast('error', 'Enter your access token first.');
      return setSyncStatus('off');
    }
    if (sc.busy) return;
    sc.busy = true;
    setSyncStatus('syncing');
    try {
      let remote = await pullRemote();
      let fromRemote = false;
      let curSettings = ref.current.settings;
      let curWatch = ref.current.watchlist;
      let curHist = ref.current.history;
      let curScore = ref.current.scoreLog;
      // "dirty" = this device has edits the server has not seen yet. A brand-new device (lastJson === '') is never dirty.
      let dirty = sc.lastJson !== '' && jsonOf(snapshot(curSettings, curWatch, curHist, curScore)) !== sc.lastJson;
      let mergedJson = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        let mSettings = curSettings;
        let mWatch = curWatch;
        let mHist = curHist;
        let mScore = curScore;
        if (remote.data && remote.updatedAt !== sc.at) {
          mHist = mergeHistory(curHist, remote.data.history); // history is never lost: union of both devices
          mScore = mergeScoreLog(curScore, remote.data.scoreLog);
          if (!dirty) {
            mSettings = { ...curSettings, ...remote.data.settings } as Settings;
            mWatch = remote.data.watchlist;
          }
          sc.at = remote.updatedAt;
          fromRemote = true;
        }
        const merged = snapshot(mSettings, mWatch, mHist, mScore);
        mergedJson = jsonOf(merged);
        if (mergedJson !== jsonOf(snapshot(curSettings, curWatch, curHist, curScore))) {
          sc.skipNext = true; // this state change came from the server, not the user
          setSettings(mSettings);
          setWatchlistState(mWatch);
          setHistory(mHist);
          setScoreLog(mScore);
        }
        curSettings = mSettings;
        curWatch = mWatch;
        curHist = mHist;
        curScore = mScore;
        const remoteJson = remote.data ? jsonOf(snapshot({ ...mSettings, ...remote.data.settings } as Settings, remote.data.watchlist, remote.data.history, remote.data.scoreLog ?? [])) : '';
        // A setting the server copy has never seen (e.g. one added in a newer version) also needs a push.
        const serverLacksKeys = !!remote.data && (!remote.data.scoreLog || Object.keys(merged.settings).some((k) => !(k in remote.data!.settings)));
        if (remote.data && mergedJson === remoteJson && !serverLacksKeys) break; // server already has everything
        const res = await pushRemote(remote.updatedAt, merged);
        if ('updatedAt' in res) {
          sc.at = res.updatedAt;
          break;
        }
        remote = res.conflict; // someone saved in between: merge once more
        dirty = true;
      }
      sc.lastJson = mergedJson;
      try {
        localStorage.setItem('ta.syncAt', JSON.stringify(sc.at));
      } catch {
        /* ignore */
      }
      setLastSync(nowIso());
      setSyncStatus('ok');
      setSyncMessage(fromRemote ? 'Updated from your other device.' : 'Up to date.');
      if (manual) toast('success', fromRemote ? 'Synced: loaded data from your other device.' : 'Synced: this device is up to date.');
    } catch (e) {
      setSyncStatus('error');
      setSyncMessage(e instanceof Error ? e.message : String(e));
      if (manual) toast('error', `Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      sc.busy = false;
    }
  }, [toast]);

  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;

  // Pull on open and whenever the app comes back to the foreground (e.g. switching to the phone).
  useEffect(() => {
    void syncRef.current();
    const onVis = () => document.visibilityState === 'visible' && void syncRef.current();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, []);

  // Push shortly after the user changes something that is synced.
  useEffect(() => {
    const sc = sync.current;
    if (!getAccessToken()) return;
    const json = jsonOf(snapshot(settings, watchlist, history, scoreLog));
    if (sc.skipNext) {
      sc.skipNext = false;
      sc.lastJson = json;
      return;
    }
    if (sc.lastJson === '' || json === sc.lastJson) return;
    clearTimeout(sc.timer);
    sc.timer = setTimeout(() => void syncRef.current(), 1500);
    return () => clearTimeout(sc.timer);
  }, [settings, watchlist, history, scoreLog]);

  // ---- polling ----
  const tick = useCallback(async () => {
    const { settings: s, watchlist, signals: existing } = ref.current;
    // Stocks you own are always monitored, even if they are not on the watchlist.
    const wl = [...new Set([...watchlist, ...s.holdings.map((h) => h.symbol)])];
    if (s.stopped || !wl.length) return;
    setLastPoll(nowIso());

    const r0 = await fetchAllNews(wl, s);
    for (const e of r0.errors) if (e !== lastErr.current) { log('warn', e); lastErr.current = e; }
    const all: Headline[] = r0.headlines;
    const cutoff = Date.now() - MAX_NEWS_AGE_MS;
    const fresh = all.filter((h) => !seen.current.has(h.id) && new Date(h.publishedAt).getTime() >= cutoff);
    all.forEach((h) => seen.current.add(h.id));
    if (seen.current.size > 2000) seen.current = new Set([...seen.current].slice(-1000));
    save(KEYS.seen, [...seen.current]);

    // Hourly: a stock you own whose price trend turned weak gets a SELL signal even when the news is quiet.
    let trendSignals: Signal[] = [];
    if (s.holdings.length && Date.now() - lastTrendCheck.current > TREND_CHECK_EVERY_MS) {
      lastTrendCheck.current = Date.now();
      try {
        const t = await fetchTrendSeries(s.holdings.map((h) => h.symbol));
        const analyses = s.holdings.map((h) => (t.series[h.symbol] ? analyze(h.symbol, t.series[h.symbol].closes, h) : null)).filter((a): a is Analysis => !!a);
        trendSignals = trendSellSignals(analyses, s.holdings, existing);
      } catch (e) {
        log('warn', `Trend check failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (!fresh.length && !trendSignals.length) return;
    if (fresh.length) setHeadlines((cur) => [...fresh, ...cur].slice(0, 100));

    let newSignals: Signal[] = [];
    let mcpFailed: Error | null = null;
    const usingMcp = s.useMcp && mcpConfigured();
    if (usingMcp) {
      try {
        const r = await callMcp(fresh, wl, s.defaultQty);
        setMcpLast(r.raw.slice(0, 20_000));
        newSignals = r.signals.filter((x) => x.confidence >= s.minConfidence && !isDuplicate(existing, x.symbol, x.side));
        log('info', `MCP returned ${r.signals.length} signal(s).`);
      } catch (e) {
        mcpFailed = e instanceof Error ? e : new Error(String(e));
        log('error', mcpFailed.message + ' Falling back to local strategy.');
      }
    }
    if (!usingMcp || mcpFailed) {
      newSignals = generateSignals(fresh, wl, {
        defaultQty: s.defaultQty, minConfidence: s.minConfidence, existing, source: 'local',
      }).map((x) => ({ ...x, origin: 'news' as const }));
    }
    newSignals = [...newSignals, ...trendSignals];
    if (newSignals.length) {
      const aiOn = s.useAiReview;
      setSignals((l) => [...newSignals.map((n) => (aiOn && n.confidence >= s.aiMinConfidence ? { ...n, reviewStatus: 'pending' as const } : n)), ...l]);
      newSignals.forEach((n) => log('info', `Signal: ${n.side} ${n.symbol} @ ${(n.confidence * 100).toFixed(0)}% (${n.origin === 'trend' ? 'price trend' : n.source})`));
      // Paid AI checks only for strong signals; weaker ones keep an "AI check" button for a manual check.
      if (aiOn) await Promise.all(newSignals.filter((n) => n.confidence >= s.aiMinConfidence).map((n) => reviewSignal(n, fresh)));
      for (const n of newSignals) {
        // Background alerts already email approved calls; the app does not send a second copy.
        if (ref.current.settings.autoEmail && !ref.current.settings.serverAlerts) await emailSignal(n, true);
        else if (n.autoEmail) log('warn', `MCP requested auto-email for ${n.symbol}, ignored because Auto-Email is OFF.`);
      }
    }
    if (mcpFailed) throw mcpFailed; // trigger backoff
  }, [log, emailSignal, reviewSignal]);

  const stopped = settings.stopped;
  const intervalSec = settings.pollIntervalSec;
  useEffect(() => {
    if (stopped) {
      setPolling(false);
      return;
    }
    const p = new Poller({
      intervalMs: () => Math.max(30, ref.current.settings.pollIntervalSec) * 1000,
      tick: async () => {
        try {
          await tick();
        } catch (e) {
          log('error', `Poll failed: ${e instanceof Error ? e.message : e}`);
          throw e;
        }
      },
      onBackoff: (d, n) => log('warn', `Backing off ${Math.round(d / 1000)}s after ${n} failure(s).`),
    });
    p.start();
    setPolling(true);
    return () => {
      p.stop();
      setPolling(false);
    };
  }, [stopped, intervalSec, tick, log]);

  const value: Store = {
    settings, update, watchlist, setWatchlist, signals, history, scoreLog, setHistory, patchHistory, logs,
    clearLogs: () => setLogs([]), headlines, mcpLast, unlocked, lastPoll, polling, log, setPassphrase,
    requestUnlock, setAutoEmail, setUseMcp, panic, resume,
    emailSignal: (s) => emailSignal(s, false), copySignal, dismissSignal, toast, syncStatus, syncMessage, lastSync, syncNow, sending, toasts, dismissToast, reviewSignal: (s) => reviewSignal(s), setSignalQty: (id, qty) => patchSignal(id, { qty }), addIdeaSignal,
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {modal && (
        <PassphraseModal
          reason={modal.reason}
          onSubmit={submitModal}
          onCancel={() => {
            modal.resolve(false);
            setModal(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}
