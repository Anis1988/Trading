import { useStore } from '../store';
import { SignalCard } from '../components/SignalCard';

export function SignalCenter() {
  const { signals } = useStore();
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">Signal Center ({signals.length})</h2>
      {signals.length ? signals.map((s) => <SignalCard key={s.id} s={s} />) : <p className="text-sm text-slate-500">No signals yet.</p>}
    </div>
  );
}
