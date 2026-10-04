import { useStore } from '../store';

const STYLE = {
  success: 'border-emerald-300/50 bg-emerald-500/20 text-emerald-50',
  error: 'border-red-300/50 bg-red-500/25 text-red-50',
  warn: 'border-amber-300/50 bg-amber-500/20 text-amber-50',
  info: 'border-cyan-300/40 bg-cyan-500/15 text-cyan-50',
} as const;
const ICON = { success: '✓', error: '✕', warn: '!', info: 'i' } as const;

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }} role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismissToast(t.id)} className={`toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-2xl backdrop-blur-xl ${STYLE[t.kind]}`}>
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{ICON[t.kind]}</span>
          <span className="break-words">{t.msg}</span>
        </button>
      ))}
    </div>
  );
}
