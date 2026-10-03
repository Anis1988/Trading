import type { Signal } from '../types';
import { useStore } from '../store';

export function SignalCard({ s, compact = false }: { s: Signal; compact?: boolean }) {
  const { emailSignal, copySignal, dismissSignal } = useStore();
  const buy = s.side === 'BUY';
  const done = s.status === 'dismissed';
  return (
    <div className={`card ${done ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${buy ? 'bg-emerald-700' : 'bg-red-700'}`}>{s.side}</span>
        <span className="text-lg font-semibold">{s.symbol}</span>
        <span className="text-sm text-slate-400">qty {s.qty}</span>
        <span className="text-sm">{(s.confidence * 100).toFixed(0)}% confidence</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{s.source}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{s.status}</span>
        <span className="ml-auto text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()}</span>
      </div>
      <p className="mt-2 break-words text-sm text-slate-300">
        {s.reason}
        {s.headlineUrl && (
          <>
            {' '}
            <a className="text-sky-400 underline" href={s.headlineUrl} target="_blank" rel="noopener noreferrer">source</a>
          </>
        )}
      </p>
      {!compact && !done && (
        <div className="mt-3 flex gap-2">
          <button className="btn" onClick={() => void emailSignal(s)}>Email</button>
          <button className="btn" onClick={() => void copySignal(s)}>Copy</button>
          <button className="btn" onClick={() => dismissSignal(s)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
