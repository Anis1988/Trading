import type { Signal } from '../types';
import { useStore } from '../store';

const VERDICT = { APPROVE: 'bg-emerald-800 text-emerald-100', CAUTION: 'bg-amber-700 text-amber-100', REJECT: 'bg-red-800 text-red-100' } as const;

export function SignalCard({ s, compact = false }: { s: Signal; compact?: boolean }) {
  const { emailSignal, copySignal, dismissSignal, reviewSignal, settings } = useStore();
  const buy = s.side === 'BUY';
  const done = s.status === 'dismissed';
  const rejected = settings.useAiReview && s.review?.verdict === 'REJECT';
  return (
    <div className={`card ${done ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${buy ? 'bg-emerald-700' : 'bg-red-700'}`}>{s.side}</span>
        <span className="text-lg font-semibold">{s.symbol}</span>
        <span className="text-sm text-slate-400">qty {s.qty}</span>
        <span className="text-sm">{(s.confidence * 100).toFixed(0)}% confidence</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{s.source}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{s.status}</span>
        {s.reviewStatus === 'pending' && <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">AI reviewing…</span>}
        {s.review && (
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${VERDICT[s.review.verdict]}`}>
            AI: {s.review.verdict}{s.review.simulated ? ' (sim)' : ''}
          </span>
        )}
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
      {s.review && (
        <div className="mt-2 rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
          <p>{s.review.rationale}</p>
          {s.review.risks.length > 0 && <p className="mt-1 text-slate-400">Risks: {s.review.risks.join(' · ')}</p>}
          {s.review.price !== undefined && (
            <p className="mt-1 text-slate-500">Price {s.review.price} ({s.review.changePct}% today){s.review.model ? ` · ${s.review.model}` : ''}</p>
          )}
        </div>
      )}
      {s.reviewStatus === 'error' && <p className="mt-2 text-xs text-red-400">AI review failed: {s.reviewError}. Auto-email is blocked until a review succeeds.</p>}
      {!compact && !done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" disabled={rejected || s.reviewStatus === 'pending'} title={rejected ? 'Blocked: AI review REJECTED this trade' : ''} onClick={() => void emailSignal(s)}>Email</button>
          <button className="btn" onClick={() => void copySignal(s)}>Copy</button>
          {settings.useAiReview && <button className="btn" disabled={s.reviewStatus === 'pending'} onClick={() => void reviewSignal(s)}>{s.review ? 'Re-review' : 'AI review'}</button>}
          <button className="btn" onClick={() => dismissSignal(s)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
