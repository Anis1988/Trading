import { useState } from 'react';
import { useStore } from './store';
import { Toasts } from './components/Toasts';
import { Today } from './pages/Today';
import { Settings } from './pages/Settings';
import { History } from './pages/History';
import { Trends } from './pages/Trends';
import { Ideas } from './pages/Ideas';

const TABS = [
  ['Today', '🏠'],
  ['Ideas', '💡'],
  ['Trends', '📊'],
  ['History', '🧾'],
  ['Settings', '⚙️'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const [tab, setTab] = useState<Tab>('Today');
  const { panic, settings, signals } = useStore();
  const newCount = signals.filter((s) => s.status === 'new' && s.review?.verdict !== 'REJECT').length;
  return (
    <div className="min-h-screen">
      <Toasts />
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3 py-2 sm:px-4">
        <h1 className="mr-1 text-sm font-bold sm:text-base">Trading Assistant</h1>
        {/* Desktop/tablet tabs; phones use the bottom bar */}
        <nav className="hidden flex-wrap gap-1 sm:flex">
          {TABS.map(([t]) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1 text-sm ${tab === t ? 'bg-slate-700' : 'hover:bg-slate-800'}`}>{t}</button>
          ))}
        </nav>
        <span className={`ml-auto rounded px-2 py-0.5 text-xs ${settings.mockMode ? 'bg-sky-900' : 'bg-amber-700'}`}>{settings.mockMode ? 'DEMO' : 'LIVE'}</span>
        <button className="btn-danger" onClick={() => window.confirm('Stop alerts?\n\nThis stops checking the news and turns Auto-Email off. Nothing is cancelled in Fidelity and nothing is deleted. You can resume any time.') && panic()} disabled={settings.stopped}>{settings.stopped ? 'STOPPED' : 'STOP ALERTS'}</button>
      </header>
      <nav className="sticky top-[52px] z-30 grid grid-cols-5 border-b border-slate-800 bg-slate-950/95 sm:hidden">
        {TABS.map(([t, icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] ${tab === t ? 'border-b-2 border-emerald-500 bg-slate-800 text-white' : 'text-slate-400'}`}>
            <span className="text-base leading-none">{icon}</span>
            {t}
            {t === 'Today' && newCount > 0 && <span className="absolute right-2 top-0.5 rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">{newCount}</span>}
          </button>
        ))}
      </nav>
      <main className="mx-auto max-w-6xl p-3 pb-10 sm:p-4 sm:pb-6">
        {tab === 'Today' && <Today goTo={setTab} />}
        {tab === 'Ideas' && <Ideas />}
        {tab === 'Trends' && <Trends />}
        {tab === 'History' && <History />}
        {tab === 'Settings' && <Settings />}
      </main>
    </div>
  );
}
