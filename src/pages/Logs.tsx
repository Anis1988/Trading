import { useStore } from '../store';

const color = { info: 'text-slate-300', warn: 'text-amber-300', error: 'text-red-300' } as const;

export function Logs() {
  const { logs, clearLogs } = useStore();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="label">Most recent first</p>
        <button className="btn" onClick={clearLogs}>Clear</button>
      </div>
      <div className="panel max-h-[60vh] overflow-auto font-mono text-xs">
        {logs.length ? logs.map((l) => (
          <div key={l.id} className={`whitespace-pre-wrap break-words py-0.5 ${color[l.level]}`}>
            <span className="text-slate-500">{new Date(l.ts).toLocaleTimeString()}</span> {l.msg}
          </div>
        )) : <span className="text-slate-500">Nothing yet.</span>}
      </div>
    </div>
  );
}
