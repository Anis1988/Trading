import type { WidgetData } from '../lib/widget';

/** A picture of the Android "Portfolio today" widget (Guide), drawn from the same lines the app sends to it. */
export function WidgetPicture({ d }: { d: WidgetData }) {
  return (
    <div className="w-[230px] rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#0d1328] to-[#03060d] p-3.5" aria-label="Example of the home-screen widget">
      <p className="text-[11px] font-bold text-cyan-200/70">📈 Portfolio today</p>
      <p className="num mt-3 text-[26px] font-bold leading-none text-white">{d.value}</p>
      <p className={`num mt-1 text-[13px] font-bold ${d.up ? 'text-emerald-300' : 'text-red-300'}`}>{d.change}</p>
      <p className="mt-0.5 text-xs text-white/80">{d.mover}</p>
      <p className="text-[10px] text-white/50">{d.at}</p>
    </div>
  );
}
