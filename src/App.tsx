import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { isNative } from './lib/native';
import { useStore } from './store';
import { Toasts } from './components/Toasts';
import { Icon } from './components/ui';
import { Today } from './pages/Today';
import { Ideas } from './pages/Ideas';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Guide } from './pages/Guide';
import { Words } from './pages/Words';

const TABS = [
  ['Today', Icon.today],
  ['Ideas', Icon.ideas],
  ['History', Icon.history],
  ['Settings', Icon.settings],
  ['Guide', Icon.guide],
  ['Words', Icon.words],
] as const;
type Tab = (typeof TABS)[number][0];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#0d1328" stroke="rgba(255,255,255,0.12)" />
      <path d="M6 22 12 16 16 19 25 10M21 10h4v4" fill="none" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Today');
  const { panic, settings, signals } = useStore();
  // Android back button: back to Today first, then the app goes to the background (like other apps).
  const tabRef = useRef(tab);
  tabRef.current = tab;
  useEffect(() => {
    if (!isNative()) return;
    const h = NativeApp.addListener('backButton', () => {
      if (tabRef.current !== 'Today') setTab('Today');
      else void NativeApp.minimizeApp();
    });
    return () => void h.then((x) => x.remove());
  }, []);
  const newCount = signals.filter((s) => s.status === 'new' && s.review?.verdict !== 'REJECT').length;
  const stop = () => {
    if (window.confirm('Stop alerts?\n\nThis stops checking the news and turns Auto-Email off on this device. Nothing is cancelled in Fidelity and nothing is deleted. You can resume any time.')) panic();
  };

  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/75 backdrop-blur-xl" style={{ paddingTop: 'var(--safe-area-inset-top, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-4">
          <Logo />
          <span className="font-display text-lg font-semibold tracking-tight">Trading</span>
          <nav className="ml-4 hidden gap-1 sm:flex" aria-label="Main">
            {TABS.map(([t]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? 'page' : undefined}
                className={`relative rounded-lg px-3 py-1.5 text-sm transition ${tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-100'}`}
              >
                {t}
                {t === 'Today' && newCount > 0 && <span className="num ml-1.5 rounded-full bg-cyan-400 px-1.5 text-[10px] font-bold text-slate-950">{newCount}</span>}
              </button>
            ))}
          </nav>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wider ${settings.stopped ? 'border-red-300/40 bg-red-400/10 text-red-200' : 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'}`}
            title={settings.stopped ? 'Alerts are stopped' : 'Watching the news for your stocks'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${settings.stopped ? 'bg-red-300' : 'animate-pulse bg-emerald-300'}`} />
            {settings.stopped ? 'PAUSED' : 'WATCHING'}
          </span>
          <button className="btn-danger" onClick={stop} disabled={settings.stopped} title="Stop checking news and turn off auto-email">
            {Icon.stop}
            <span className="hidden sm:inline">{settings.stopped ? 'Stopped' : 'Stop alerts'}</span>
            <span className="sm:hidden">{settings.stopped ? 'Off' : 'Stop'}</span>
          </button>
        </div>
        <nav className="grid grid-cols-6 border-t border-white/5 sm:hidden" aria-label="Main">
          {TABS.map(([t, icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition ${tab === t ? 'text-cyan-200' : 'text-slate-400'}`}
            >
              {icon}
              {t}
              {tab === t && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />}
              {t === 'Today' && newCount > 0 && <span className="num absolute right-3 top-1 rounded-full bg-cyan-400 px-1.5 text-[10px] font-bold text-slate-950">{newCount}</span>}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1600px] px-3 pb-12 pt-4 sm:px-4 lg:px-6" style={{ paddingBottom: 'calc(3rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}>
        {tab === 'Today' && <Today goTo={setTab} />}
        {tab === 'Ideas' && <Ideas />}
        {tab === 'History' && <History />}
        {tab === 'Settings' && <Settings />}
        {tab === 'Guide' && <Guide />}
        {tab === 'Words' && <Words />}
      </main>
    </div>
  );
}
