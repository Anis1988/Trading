import { useState } from 'react';
import type { Signal } from '../types';
import { useStore } from '../store';
import { ActionChip, Stat, fmtMoney, type Action } from './ui';
import { shareAfterBuy } from '../lib/concentration';
import { MARKET_TEXT } from '../lib/insightTypes';

/** The single word the user acts on. */
export function finalAction(s: Signal, aiOn: boolean, aiMin = 0): { action: Action; note: string } {
  if (s.reviewStatus === 'pending') return { action: 'CHECKING', note: 'The AI is checking this…' };
  if (s.review) {
    if (s.review.verdict === 'APPROVE') return { action: s.side, note: s.review.rationale };
    if (s.review.verdict === 'CAUTION') return { action: 'WAIT', note: s.review.rationale };
    return { action: 'SKIP', note: s.review.rationale };
  }
  if (s.reviewStatus === 'error') return { action: 'WAIT', note: `The AI check failed: ${s.reviewError ?? 'unknown error'}` };
  if (aiOn && s.confidence < aiMin) return { action: 'WAIT', note: 'A weaker signal, so it was not sent to the AI (to save credits). Tap AI check if you want an opinion.' };
  return { action: aiOn ? 'WAIT' : s.side, note: aiOn ? 'Not checked by the AI yet.' : s.reason };
}

export function SignalCard({ s, compact = false }: { s: Signal; compact?: boolean }) {
  const { emailSignal, copySignal, dismissSignal, reviewSignal, settings, sending, setSignalQty } = useStore();
  const [open, setOpen] = useState(false);
  const hold = settings.holdings.find((h) => h.symbol === s.symbol);
  const isSending = sending.includes(s.id);
  const done = s.status === 'dismissed';
  const { action, note } = finalAction(s, settings.useAiReview, settings.aiMinConfidence);
  const blocked = settings.useAiReview && s.review?.verdict === 'REJECT';
  const share = s.side === 'BUY' && s.entryPrice ? shareAfterBuy(s.symbol, s.qty, s.entryPrice, settings.holdings) : null;
  const stopPct = s.entryPrice && s.stopPrice ? Math.round(((s.entryPrice - s.stopPrice) / s.entryPrice) * 1000) / 10 : null;
  const accent = action === 'BUY' ? 'before:bg-emerald-400' : action === 'SELL' ? 'before:bg-red-400' : action === 'WAIT' ? 'before:bg-amber-400' : 'before:bg-slate-500';

  return (
    <article className={`card relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 ${accent} ${done ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ActionChip action={action} size="lg" />
            <span className="font-display text-xl font-semibold">{s.symbol}</span>
            <span className="num text-sm text-slate-400">× {s.qty}</span>
            {s.origin === 'trend' && <span className="rounded-md bg-violet-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-200" title="Created by the price-trend check, not by news">trend</span>}
            {s.status !== 'new' && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">{s.status}</span>}
          </div>
          <p className="mt-2 text-[15px] leading-snug text-slate-200">{note}</p>
        </div>
      </div>

      {s.entryPrice && s.side === 'BUY' && s.stopPrice && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Buy near" value={fmtMoney(s.entryPrice)} />
          <Stat label={stopPct ? `Stop-loss −${stopPct}%` : 'Stop-loss'} value={fmtMoney(s.stopPrice)} tone="down" />
          <Stat label="Max loss" value={`−${fmtMoney((s.entryPrice - s.stopPrice) * s.qty)}`} tone="down" />
        </div>
      )}
      {s.entryPrice && s.side === 'SELL' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="You get about" value={fmtMoney(s.entryPrice * s.qty)} />
          {hold && hold.avgCost > 0 ? (
            <Stat
              label="Vs what you paid"
              value={`${(s.entryPrice - hold.avgCost) * s.qty >= 0 ? '+' : '−'}${fmtMoney((s.entryPrice - hold.avgCost) * s.qty)}`}
              tone={(s.entryPrice - hold.avgCost) * s.qty >= 0 ? 'up' : 'down'}
            />
          ) : (
            <Stat label="Price" value={fmtMoney(s.entryPrice)} />
          )}
        </div>
      )}
      {share !== null && share > 25 && !done && (
        <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">This would make {s.symbol} about {share.toFixed(0)}% of your money. Consider fewer shares.</p>
      )}
      {s.side === 'BUY' && s.suggestedQty !== undefined && s.suggestedQty !== s.qty && !compact && !done && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
          <span>To risk only {fmtMoney(settings.riskPerTrade)}: <b className="num">{s.suggestedQty}</b> shares</span>
          <button className="btn-ghost" onClick={() => setSignalQty(s.id, s.suggestedQty!)}>Use {s.suggestedQty}</button>
        </div>
      )}

      {!compact && !done && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button
            className={s.status === 'emailed' && !isSending ? 'btn border-emerald-400/50 text-emerald-200' : 'btn-primary'}
            disabled={blocked || isSending || s.reviewStatus === 'pending'}
            title={blocked ? 'Blocked: the AI said skip this one' : ''}
            onClick={() => void emailSignal(s)}
          >
            {isSending ? <><span className="spinner" /> Sending…</> : s.status === 'emailed' ? '✓ Emailed · again' : blocked ? 'Email blocked' : 'Email me'}
          </button>
          <button className="btn" onClick={() => void copySignal(s)}>{s.status === 'copied' ? '✓ Copied' : 'Copy'}</button>
          {settings.useAiReview && (
            <button className="btn" disabled={s.reviewStatus === 'pending'} onClick={() => void reviewSignal(s)}>{s.review || s.reviewStatus === 'error' ? 'Re-check' : 'AI check'}</button>
          )}
          <button className="btn" onClick={() => dismissSignal(s)}>Dismiss</button>
        </div>
      )}

      <button className="btn-ghost mt-2 !px-0 text-xs" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide details' : 'Details'}</button>
      {open && (
        <div className="panel mt-1 space-y-1.5 text-sm text-slate-300">
          <p><span className="label">Why it fired</span><br />{s.reason}{s.headlineUrl && <> · <a className="text-cyan-300 underline" href={s.headlineUrl} target="_blank" rel="noopener noreferrer">source</a></>}</p>
          {s.review?.holdingNote && <p><span className="label">Your holdings</span><br />{s.review.holdingNote}</p>}
          {s.review && s.review.risks.length > 0 && <p><span className="label">Watch out</span><br />{s.review.risks.join(' · ')}</p>}
          {(s.review?.market || s.review?.earnings || s.review?.analysts || s.review?.reddit) && (
            <p><span className="label">Context</span><br />{[s.review.market && MARKET_TEXT[s.review.market], s.review.earnings, s.review.analysts, s.review.reddit].filter(Boolean).join(' · ')}</p>
          )}
          <p className="text-xs text-slate-500">
            Signal score {(s.confidence * 100).toFixed(0)}% · {new Date(s.createdAt).toLocaleString()}
            {s.review?.price !== undefined && ` · price $${s.review.price}`}
            {s.review?.model && ` · ${s.review.model}`}
            {stopPct && ` · stop ${stopPct}% below${s.review?.volPct ? ` (moves ~${s.review.volPct}%/day)` : ''}`}
          </p>
        </div>
      )}
    </article>
  );
}
