import { useEffect, useRef, useState } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { isNative } from './lib/native';
import { AppUpdateCheck } from './components/AppUpdate';
import { startAppPush } from './lib/alerts';
import { useStore } from './store';
import { Toasts } from './components/Toasts';
import { Icon } from './components/ui';
import { TabBar, TopTabs } from './components/Nav';
import { Today } from './pages/Today';
import { Ideas } from './pages/Ideas';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Guide } from './pages/Guide';
import { Words } from './pages/Words';
import { WhatIf } from './pages/WhatIf';

const TABS = [
  ['Today', Icon.today],
  ['Ideas', Icon.ideas],
  ['What if', Icon.whatif],
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
  const { panic, settings, signals, toast } = useStore();
  // Android app: an alert that arrives while the app is open shows as a message at the top.
  useEffect(() => startAppPush((title, body) => toast('info', body ? `${title}: ${body}` : title)), []); // eslint-disable-line react-hooks/exhaustive-deps
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

  const badge = { Today: newCount };

  return (
    <div className="min-h-screen">
      <div className="qt-bg" aria-hidden="true">
        <span className="qt-orb a" />
        <span className="qt-orb b" />
        <span className="qt-orb c" />
        <span className="qt-scan" />
      </div>
      <Toasts />
      <header className="qt-header sticky top-0 z-40 backdrop-blur-xl" style={{ paddingTop: 'var(--qt-safe-top)' }}>
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-2.5 px-3 sm:h-14 sm:gap-3 sm:px-4 lg:px-6">
          <Logo />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            Trading<span className="ml-1.5 hidden font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-300/70 sm:inline lg:hidden xl:inline">terminal</span>
          </span>
          <TopTabs tabs={TABS} current={tab} onPick={setTab} badge={badge} />
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] ${settings.stopped ? 'border-red-300/40 bg-red-400/10 text-red-200' : 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'}`}
            title={settings.stopped ? 'Alerts are stopped' : 'Watching the news for your stocks'}
          >
            <span className="relative flex h-1.5 w-1.5">
              {!settings.stopped && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300 opacity-60" />}
              <span className={`relative h-1.5 w-1.5 rounded-full ${settings.stopped ? 'bg-red-300' : 'bg-emerald-300'}`} />
            </span>
            {settings.stopped ? 'PAUSED' : 'WATCHING'}
          </span>
          <button className="btn-danger !min-h-[44px] !px-2.5 sm:!min-h-[38px] sm:!px-3" onClick={stop} disabled={settings.stopped} title="Stop checking news and turn off auto-email">
            {Icon.stop}
            <span className="hidden sm:inline">{settings.stopped ? 'Stopped' : 'Stop alerts'}</span>
            <span className="sm:hidden">{settings.stopped ? 'Off' : 'Stop'}</span>
          </button>
        </div>
      </header>
      <main className="qt-main mx-auto max-w-[1600px] px-3 pt-4 sm:px-4 lg:px-6">
        <AppUpdateCheck />
        <div key={tab} className="qt-enter">
        {tab === 'Today' && <Today goTo={setTab} />}
        {tab === 'Ideas' && <Ideas goTo={setTab} />}
        {tab === 'What if' && <WhatIf />}
        {tab === 'History' && <History />}
        {tab === 'Settings' && <Settings />}
        {tab === 'Guide' && <Guide />}
        {tab === 'Words' && <Words />}
        </div>
      </main>
      <TabBar tabs={TABS} current={tab} onPick={setTab} badge={badge} />
    </div>
  );
}
