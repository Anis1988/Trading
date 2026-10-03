import { useStore } from '../store';

const STYLE = {
  success: 'bg-emerald-600 border-emerald-400',
  error: 'bg-red-600 border-red-400',
  warn: 'bg-amber-600 border-amber-400',
  info: 'bg-slate-700 border-slate-500',
} as const;
const ICON = { success: '✓', error: '✕', warn: '!', info: 'i' } as const;

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium text-white shadow-xl ${STYLE[t.kind]}`}
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/25 text-xs font-bold">{ICON[t.kind]}</span>
          <span className="break-words">{t.msg}</span>
        </button>
      ))}
    </div>
  );
}
