import type { Signal } from '../types';
import { useStore } from '../store';
import { confirmLine } from '../lib/holdings';
import { money } from '../lib/risk';

const VERDICT_TEXT = { APPROVE: 'AI agrees', CAUTION: 'AI unsure', REJECT: 'AI says no' } as const;
const VERDICT = { APPROVE: 'bg-emerald-800 text-emerald-100', CAUTION: 'bg-amber-700 text-amber-100', REJECT: 'bg-red-800 text-red-100' } as const;

export function SignalCard({ s, compact = false }: { s: Signal; compact?: boolean }) {
  const { emailSignal, copySignal, dismissSignal, reviewSignal, settings, sending, setSignalQty } = useStore();
  const hold = settings.holdings.find((h) => h.symbol === s.symbol);
  const isSending = sending.includes(s.id);
  const buy = s.side === 'BUY';
  const done = s.status === 'dismissed';
  const rejected = settings.useAiReview && s.review?.verdict === 'REJECT';
  return (
    <div className={`card ${done ? 'opacity-50' : ''} ${rejected ? 'border-red-900' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${s.review && s.review.verdict !== 'APPROVE' ? 'bg-slate-700 text-slate-300' : buy ? 'bg-emerald-700' : 'bg-red-700'}`}>
          {s.review ? `Proposed: ${s.side}` : s.side}
        </span>
        <span className="text-lg font-semibold">{s.symbol}</span>
        <span className="text-sm text-slate-400">qty {s.qty}</span>
        <span className="text-sm">{(s.confidence * 100).toFixed(0)}% confidence</span>
        {s.status !== 'new' && <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{s.status}</span>}
        {s.reviewStatus === 'pending' && <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">AI reviewing…</span>}
        {s.review && (
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${VERDICT[s.review.verdict]}`}>
            {VERDICT_TEXT[s.review.verdict]}{s.review.simulated ? ' (demo)' : ''}
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
        <div className="mt-2 space-y-1 rounded border border-slate-800 bg-slate-950 p-2 text-sm text-slate-300">
          <p>{s.review.rationale}</p>
          {s.review.holdingNote && <p className="text-slate-400">{s.review.holdingNote}</p>}
          {s.review.risks.length > 0 && <p className="text-xs text-slate-400">Watch out: {s.review.risks.join(' · ')}</p>}
          {s.review.price !== undefined && (
            <p className="text-xs text-slate-500">Price {s.review.price}{s.review.changePct !== undefined ? ` (${s.review.changePct}% today)` : ''}{s.review.model ? ` · ${s.review.model}` : ''}</p>
          )}
          <p className={`rounded px-2 py-1 text-sm font-bold ${VERDICT[s.review.verdict]}`}>{confirmLine(s.review.verdict, s.side, s.qty, s.symbol)}{s.review.simulated ? ' (demo)' : ''}</p>
        </div>
      )}
      {s.entryPrice && s.side === 'BUY' && s.stopPrice && (
        <div className="mt-2 rounded border border-slate-700 bg-slate-950 p-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Risk</p>
          <p>Buy near <b>{money(s.entryPrice)}</b> · Stop-loss <b className="text-red-300">{money(s.stopPrice)}</b> <span className="text-slate-500">({settings.stopLossPct}% below)</span></p>
          <p>Most you lose with {s.qty} share{s.qty === 1 ? '' : 's'}: <b className="text-red-300">≈ {money((s.entryPrice - s.stopPrice) * s.qty)}</b></p>
          {s.suggestedQty !== undefined && s.suggestedQty !== s.qty && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-300">
              To risk only {money(settings.riskPerTrade)}: {s.suggestedQty} share{s.suggestedQty === 1 ? '' : 's'}
              <button className="btn" onClick={() => setSignalQty(s.id, s.suggestedQty!)}>Use {s.suggestedQty}</button>
            </p>
          )}
        </div>
      )}
      {s.entryPrice && s.side === 'SELL' && (
        <div className="mt-2 rounded border border-slate-700 bg-slate-950 p-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">If you sell</p>
          <p>{s.qty} share{s.qty === 1 ? '' : 's'} at about <b>{money(s.entryPrice)}</b> = <b>{money(s.entryPrice * s.qty)}</b></p>
          {hold && hold.avgCost > 0 && (
            <p className={(s.entryPrice - hold.avgCost) * s.qty >= 0 ? 'text-emerald-300' : 'text-red-300'}>
              Compared with what you paid: {(s.entryPrice - hold.avgCost) * s.qty >= 0 ? 'a gain of ' : 'a loss of '}{money((s.entryPrice - hold.avgCost) * s.qty)}
            </p>
          )}
        </div>
      )}
      {s.reviewStatus === 'error' && <p className="mt-2 text-xs text-red-400">AI review failed: {s.reviewError}. Auto-email is blocked until a review succeeds.</p>}
      {!compact && !done && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            className={s.status === 'emailed' && !isSending ? 'btn border-emerald-600 text-emerald-300' : 'btn-primary'}
            disabled={rejected || isSending || s.reviewStatus === 'pending'}
            title={rejected ? 'Blocked: the AI said do not trade this' : ''}
            onClick={() => void emailSignal(s)}
          >
            {isSending ? <><span className="spinner" /> Sending…</> : s.status === 'emailed' ? '✓ Emailed · again' : 'Email'}
          </button>
          <button className="btn" onClick={() => void copySignal(s)}>{s.status === 'copied' ? '✓ Copied' : 'Copy'}</button>
          {settings.useAiReview && <button className="btn" disabled={s.reviewStatus === 'pending'} onClick={() => void reviewSignal(s)}>{s.review ? 'Re-review' : 'AI review'}</button>}
          <button className="btn" onClick={() => dismissSignal(s)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
