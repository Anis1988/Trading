import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Headline, HistoryItem, LogEntry, Review, Settings, Signal } from './types';
import { fetchReview, mockReview } from './lib/api';
import { canGoLive, config, emailConfigured, mcpConfigured } from './lib/config';
import { KEYS, load, loadSettings, save } from './lib/storage';
import { fetchAllNews } from './lib/news';
import { mockHeadlines } from './lib/mock';
import { generateSignals, isDuplicate } from './lib/signals';
import { callMcp } from './lib/mcp';
import { sendTradeEmail } from './lib/email';
import { formatInstruction, planOrder } from './lib/instructions';
import { Poller } from './lib/poller';
import { hashPassphrase, newSalt, nowIso, uid, timingSafeEqual } from './lib/util';
import { PassphraseModal } from './components/PassphraseModal';

const UNLOCK_MS = 30 * 60_000;
const MAX_AUTO_EMAILS_PER_HOUR = 10;

interface Store {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  watchlist: string[];
  setWatchlist: (w: string[]) => void;
  signals: Signal[];
  history: HistoryItem[];
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
  goLive: () => Promise<void>;
  goMock: () => void;
  setAutoEmail: (on: boolean) => Promise<void>;
  setUseMcp: (on: boolean) => Promise<void>;
  panic: () => void;
  resume: () => void;
  emailSignal: (s: Signal) => Promise<void>;
  copySignal: (s: Signal) => Promise<void>;
  dismissSignal: (s: Signal) => void;
  reviewSignal: (s: Signal) => Promise<Review | null>;
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
    // Safety: never auto-email or stay in live mode on a locked build; session starts locked.
    return { ...s, autoEmail: false, mockMode: config.forceMock ? true : s.mockMode };
  });
  const [watchlist, setWatchlistState] = useState<string[]>(() => load(KEYS.watchlist, ['AAPL', 'MSFT', 'TSLA']));
  const [signals, setSignals] = useState<Signal[]>(() => load(KEYS.signals, []));
  const [history, setHistory] = useState<HistoryItem[]>(() => load(KEYS.history, []));
  const [logs, setLogs] = useState<LogEntry[]>(() => load(KEYS.logs, []));
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [mcpLast, setMcpLast] = useState<string>(() => load(KEYS.mcpLast, ''));
  const [unlocked, setUnlocked] = useState(false);
  const [lastPoll, setLastPoll] = useState('');
  const [polling, setPolling] = useState(false);
  const [modal, setModal] = useState<{ reason: string; resolve: (ok: boolean) => void } | null>(null);

  const ref = useRef({ settings, watchlist, signals, unlocked, headlines });
  ref.current = { settings, watchlist, signals, unlocked, headlines };
  const seen = useRef(new Set<string>());
  const unlockTimer = useRef<ReturnType<typeof setTimeout>>();
  const autoSent = useRef<number[]>([]);
  const lastErr = useRef('');

  useEffect(() => save(KEYS.settings, settings), [settings]);
  useEffect(() => save(KEYS.watchlist, watchlist), [watchlist]);
  useEffect(() => save(KEYS.signals, signals.slice(0, 200)), [signals]);
  useEffect(() => save(KEYS.history, history), [history]);
  useEffect(() => save(KEYS.logs, logs), [logs]);
  useEffect(() => save(KEYS.mcpLast, mcpLast), [mcpLast]);

  const log = useCallback((level: LogEntry['level'], msg: string) => {
    setLogs((l) => [{ id: uid(), ts: nowIso(), level, msg }, ...l].slice(0, 300));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setWatchlist = useCallback((w: string[]) => setWatchlistState(w), []);
  const patchHistory = useCallback((id: string, patch: Partial<HistoryItem>) => {
    setHistory((h) => h.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    log('info', `History ${id} updated: ${Object.keys(patch).join(', ')}`);
  }, [log]);

  const lock = useCallback(() => {
    clearTimeout(unlockTimer.current);
    setUnlocked(false);
  }, []);

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
      clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(() => {
        setUnlocked(false);
        log('info', 'Session re-locked after 30 minutes.');
      }, UNLOCK_MS);
      log('info', 'Passphrase accepted; session unlocked for 30 minutes.');
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

  const goLive = async () => {
    if (config.forceMock) return log('warn', 'This deployment is locked to mock mode (FORCE_MOCK=true).');
    if (!canGoLive()) return log('error', 'Live mode needs Netlify env vars (EmailJS and/or MCP and/or NEWSAPI_KEY). See README.');
    if (!hasPass()) return log('error', 'Set a passphrase in Settings before enabling live mode.');
    if (!(await requestUnlock('Confirm LIVE mode: real sources will be polled and real emails may be sent.'))) return;
    update({ mockMode: false });
    log('warn', 'LIVE mode enabled.');
  };
  const goMock = () => {
    update({ mockMode: true, autoEmail: false });
    log('info', 'Switched to mock/demo mode.');
  };

  const setAutoEmail = async (on: boolean) => {
    if (!on) {
      update({ autoEmail: false });
      return log('info', 'Auto-email disabled.');
    }
    const s = ref.current.settings;
    if (!hasPass()) return log('error', 'Set a passphrase before enabling auto-email.');
    if (!s.mockMode && !emailConfigured()) return log('error', 'Auto-email needs EMAILJS_* env vars in live mode.');
    if (!/^\S+@\S+\.\S+$/.test(s.toEmail)) return log('error', 'Enter a recipient email in Settings first.');
    if (!(await requestUnlock('Confirm enabling Auto-Email.'))) return;
    update({ autoEmail: true });
    log('warn', `Auto-email enabled${s.mockMode ? ' (simulated: mock mode)' : ''}.`);
  };

  const setUseMcp = async (on: boolean) => {
    if (!on) return update({ useMcp: false });
    if (!ref.current.settings.mockMode && !mcpConfigured()) return log('error', 'MCP needs NETLIFY_MCP_ENDPOINT and NETLIFY_MCP_API_KEY.');
    if (!hasPass()) return log('error', 'Set a passphrase before enabling MCP.');
    if (!(await requestUnlock('Confirm enabling MCP processing.'))) return;
    update({ useMcp: true });
    log('warn', 'MCP processing enabled.');
  };

  const panic = () => {
    update({ stopped: true, autoEmail: false });
    lock();
    log('error', 'PANIC STOP: polling and auto-email disabled, session locked.');
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
        channel, status, note,
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
      const r = ref.current.settings.mockMode ? mockReview(sig, ref.current.settings.holdings) : await fetchReview(sig, context ?? ref.current.headlines, ref.current.settings.holdings);
      const qty = r.suggestedQty && r.suggestedQty > 0 ? r.suggestedQty : sig.qty;
      if (qty !== sig.qty) log('info', `${sig.symbol}: quantity changed ${sig.qty} -> ${qty} to match what you own.`);
      patchSignal(sig.id, { review: r, reviewStatus: undefined, qty });
      log(r.verdict === 'REJECT' ? 'warn' : 'info', `AI review ${sig.symbol}: ${r.verdict}${r.simulated ? ' (simulated)' : ''} - ${r.rationale}`);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patchSignal(sig.id, { reviewStatus: 'error', reviewError: msg });
      log('error', `AI review failed for ${sig.symbol}: ${msg}`);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  const emailSignal = useCallback(async (sig: Signal, auto = false) => {
    const { settings: s } = ref.current;
    if (s.stopped) return log('warn', 'Panic Stop is engaged; email not sent.');
    // Re-read the latest copy: the review may have completed after this object was captured.
    const current = ref.current.signals.find((x) => x.id === sig.id) ?? sig;
    if (s.useAiReview) {
      if (current.review?.verdict === 'REJECT') return log('error', `Email blocked: AI review REJECTED ${sig.side} ${sig.symbol}.`);
      if (auto && current.review?.verdict !== 'APPROVE') return log('warn', `Auto-email for ${sig.symbol} skipped: needs AI verdict APPROVE (got ${current.review?.verdict ?? 'none'}).`);
      if (!auto && current.reviewStatus === 'pending') return log('warn', 'AI review still running; try again in a moment.');
      if (!auto && current.review?.verdict !== 'APPROVE') log('warn', `Emailing ${sig.symbol} without AI approval (${current.review?.verdict ?? 'no review'}).`);
    }
    if (!ref.current.unlocked) {
      if (auto) return log('warn', `Auto-email for ${sig.symbol} skipped: session is locked (passphrase required).`);
      if (!hasPass()) return log('error', 'Set a passphrase in Settings before sending emails.');
      if (!(await requestUnlock(`Confirm emailing ${sig.side} ${sig.symbol}.`))) return;
    }
    if (auto) {
      const cutoff = Date.now() - 3600_000;
      autoSent.current = autoSent.current.filter((t) => t > cutoff);
      if (autoSent.current.length >= MAX_AUTO_EMAILS_PER_HOUR) return log('warn', 'Auto-email hourly cap reached; skipped.');
      autoSent.current.push(Date.now());
    }
    const plan = planOrder(s.limits[sig.symbol]);
    if (s.mockMode) {
      log('info', `[MOCK] Email would be sent to ${s.toEmail || '(no recipient)'}:\n${formatInstruction(current, plan)}`);
      addHistory(sig, 'email-simulated', 'pending', 'Simulated in mock mode');
      return setSignalStatus(sig.id, 'emailed');
    }
    try {
      await sendTradeEmail(current, plan, s.toEmail);
      log('info', `Email sent: ${sig.side} ${sig.qty} ${sig.symbol}`);
      addHistory(sig, 'email', 'pending');
      setSignalStatus(sig.id, 'emailed');
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      log('error', `Email failed for ${sig.symbol}: ${msg}`);
      addHistory(sig, 'email', 'failed', msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, requestUnlock]);

  const copySignal = async (sig: Signal) => {
    const text = formatInstruction(ref.current.signals.find((x) => x.id === sig.id) ?? sig, planOrder(ref.current.settings.limits[sig.symbol]));
    try {
      await navigator.clipboard.writeText(text);
      log('info', `Instruction copied for ${sig.symbol}`);
    } catch {
      log('warn', 'Clipboard unavailable; instruction shown in Logs.\n' + text);
    }
    addHistory(sig, 'copy', 'pending', 'Manual execution in Fidelity');
    setSignalStatus(sig.id, 'copied');
  };

  const dismissSignal = (sig: Signal) => setSignalStatus(sig.id, 'dismissed');

  // ---- polling ----
  const tick = useCallback(async () => {
    const { settings: s, watchlist: wl, signals: existing } = ref.current;
    if (s.stopped || !wl.length) return;
    setLastPoll(nowIso());

    let all: Headline[];
    if (s.mockMode) all = mockHeadlines(wl);
    else {
      const r = await fetchAllNews(wl, s);
      for (const e of r.errors) if (e !== lastErr.current) { log('warn', e); lastErr.current = e; }
      all = r.headlines;
    }
    const fresh = all.filter((h) => !seen.current.has(h.id));
    fresh.forEach((h) => seen.current.add(h.id));
    if (seen.current.size > 2000) seen.current = new Set([...seen.current].slice(-1000));
    if (!fresh.length) return;
    setHeadlines((cur) => [...fresh, ...cur].slice(0, 100));

    let newSignals: Signal[] = [];
    let mcpFailed: Error | null = null;
    const usingMcp = !s.mockMode && s.useMcp && mcpConfigured();
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
        defaultQty: s.defaultQty, minConfidence: s.minConfidence, existing, source: s.mockMode ? 'mock' : 'local',
      });
    }
    if (newSignals.length) {
      const aiOn = s.useAiReview;
      setSignals((l) => [...newSignals.map((n) => (aiOn ? { ...n, reviewStatus: 'pending' as const } : n)), ...l]);
      newSignals.forEach((n) => log('info', `Signal: ${n.side} ${n.symbol} @ ${(n.confidence * 100).toFixed(0)}% (${n.source})`));
      if (aiOn) await Promise.all(newSignals.map((n) => reviewSignal(n, fresh)));
      for (const n of newSignals) {
        if (ref.current.settings.autoEmail) await emailSignal(n, true);
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
      intervalMs: () => Math.max(5, ref.current.settings.pollIntervalSec) * 1000,
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
    settings, update, watchlist, setWatchlist, signals, history, setHistory, patchHistory, logs,
    clearLogs: () => setLogs([]), headlines, mcpLast, unlocked, lastPoll, polling, log, setPassphrase,
    requestUnlock, goLive, goMock, setAutoEmail, setUseMcp, panic, resume,
    emailSignal: (s) => emailSignal(s, false), copySignal, dismissSignal, reviewSignal: (s) => reviewSignal(s),
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
