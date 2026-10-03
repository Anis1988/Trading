import { useStore } from '../store';

const color = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-400' } as const;

export function Logs() {
  const { logs, clearLogs } = useStore();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Logs</h2>
        <button className="btn" onClick={clearLogs}>Clear</button>
      </div>
      <div className="card max-h-[70vh] overflow-auto font-mono text-xs">
        {logs.length ? logs.map((l) => (
          <div key={l.id} className={`whitespace-pre-wrap break-words py-0.5 ${color[l.level]}`}>
            {new Date(l.ts).toLocaleTimeString()} [{l.level}] {l.msg}
          </div>
        )) : <span className="text-slate-500">No events.</span>}
      </div>
    </div>
  );
}
