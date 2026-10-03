import { useState } from 'react';
import { useStore } from './store';
import { Disclaimer } from './components/Disclaimer';
import { Dashboard } from './pages/Dashboard';
import { SignalCenter } from './pages/SignalCenter';
import { Settings } from './pages/Settings';
import { History } from './pages/History';
import { Logs } from './pages/Logs';

const TABS = ['Dashboard', 'Signals', 'History', 'Logs', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard');
  const { panic, settings } = useStore();
  return (
    <div className="min-h-screen">
      <Disclaimer />
      <header className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-4 py-2">
        <h1 className="mr-2 font-bold">Trading Assistant</h1>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1 text-sm ${tab === t ? 'bg-slate-700' : 'hover:bg-slate-800'}`}>{t}</button>
          ))}
        </nav>
        <span className={`ml-auto rounded px-2 py-0.5 text-xs ${settings.mockMode ? 'bg-sky-900' : 'bg-amber-700'}`}>{settings.mockMode ? 'DEMO' : 'LIVE'}</span>
        <button className="btn-danger" onClick={panic} disabled={settings.stopped}>{settings.stopped ? 'STOPPED' : 'PANIC STOP'}</button>
      </header>
      <main className="mx-auto max-w-6xl p-4">
        {tab === 'Dashboard' && <Dashboard />}
        {tab === 'Signals' && <SignalCenter />}
        {tab === 'History' && <History />}
        {tab === 'Logs' && <Logs />}
        {tab === 'Settings' && <Settings />}
      </main>
    </div>
  );
}
