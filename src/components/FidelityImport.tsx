import { useRef, useState } from 'react';
import { useStore } from '../store';
import { applyChanges, combine, diffHoldings, parseFidelity, type Change, type FidFile } from '../lib/fidelity';
import { fmtMoney } from './ui';

const KIND = {
  new: { icon: '🆕', text: 'New' },
  changed: { icon: '✏️', text: 'Changed' },
  missing: { icon: '➖', text: 'Not in the file' },
  same: { icon: '✓', text: 'Same' },
} as const;

/** The preview list: what importing would change, each line with a tick box (also the Guide's example). */
export function ImportPreview({ changes, ticked, onToggle, cash, cashOn, onCash, example = false }: {
  changes: Change[]; ticked: Set<string>; onToggle?: (sym: string) => void; cash: { now: number | undefined; file: number } | null; cashOn: boolean; onCash?: (v: boolean) => void; example?: boolean;
}) {
  const shown = changes.filter((c) => c.kind !== 'same');
  const same = changes.length - shown.length;
  const line = (c: Change) => {
    const a = c.after, b = c.before;
    if (c.kind === 'new') return <>{a!.shares} shares at ${a!.avgCost || '?'}</>;
    if (c.kind === 'missing') return <>you have {b!.shares} in the app, Fidelity doesn’t list it (sold?)</>;
    return <>{b!.shares !== a!.shares ? <>{b!.shares} → <b>{a!.shares}</b> shares</> : <>{a!.shares} shares</>}{b!.avgCost !== a!.avgCost ? <>, paid ${b!.avgCost} → <b>${a!.avgCost}</b></> : null}</>;
  };
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {shown.map((c) => (
          <li key={c.symbol}>
            <label className={`flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm ${example ? '' : 'cursor-pointer hover:bg-white/[0.06]'}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-400" checked={ticked.has(c.symbol)} onChange={() => onToggle?.(c.symbol)} tabIndex={example ? -1 : 0} readOnly={example} />
              <span className="min-w-0">
                <span className="font-display font-semibold">{c.symbol}</span> <span className="text-xs text-slate-400">{KIND[c.kind].icon} {KIND[c.kind].text}</span>
                <span className="block text-xs text-slate-300">{line(c)}{c.after && !c.after.avgCost ? <span className="text-amber-200"> · price paid unknown in the file: add it after</span> : null}</span>
              </span>
            </label>
          </li>
        ))}
        {cash && (
          <li>
            <label className={`flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm ${example ? '' : 'cursor-pointer hover:bg-white/[0.06]'}`}>
              <input type="checkbox" className="mt-1 h-4 w-4 accent-cyan-400" checked={cashOn} onChange={(e) => onCash?.(e.target.checked)} tabIndex={example ? -1 : 0} readOnly={example} />
              <span>💵 <b>Cash ready to invest</b> <span className="block text-xs text-slate-300">{cash.now !== undefined ? `${fmtMoney(cash.now)} → ` : ''}<b>{fmtMoney(cash.file)}</b> (money-market / core cash)</span></span>
            </label>
          </li>
        )}
      </ul>
      {same > 0 && <p className="text-xs text-slate-500">✓ {same} already up to date.</p>}
      {!shown.length && !cash && <p className="text-sm text-slate-300">Everything already matches Fidelity.</p>}
    </div>
  );
}

/** ⚙️ Settings → My holdings → 📥 Import from Fidelity. */
export function FidelityImport() {
  const { settings: s, update, toast } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<FidFile | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [cashOn, setCashOn] = useState(true);

  const result = file ? combine(file, accounts) : null;
  const changes = result ? diffHoldings(s.holdings, result.holdings) : [];
  const hasCash = !!file && Object.keys(file.cash).length > 0;

  const open = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (f.size > 5_000_000) throw new Error('This file is too big for a positions file.');
      const p = parseFidelity(await f.text());
      setFile(p);
      setAccounts(p.accounts);
      const ch = diffHoldings(s.holdings, combine(p, p.accounts).holdings);
      // New and changed are ticked; stocks missing from the file are not (you remove them on purpose).
      setTicked(new Set(ch.filter((c) => c.kind === 'new' || c.kind === 'changed').map((c) => c.symbol)));
      setCashOn(true);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    }
  };
  const toggleAccount = (a: string) => {
    const next = accounts.includes(a) ? accounts.filter((x) => x !== a) : [...accounts, a];
    setAccounts(next);
    const ch = diffHoldings(s.holdings, combine(file!, next).holdings);
    setTicked(new Set(ch.filter((c) => c.kind === 'new' || c.kind === 'changed').map((c) => c.symbol)));
  };
  const doImport = () => {
    if (!file || !result) return;
    const holdings = applyChanges(s.holdings, changes, ticked);
    const n = changes.filter((c) => c.kind !== 'same' && ticked.has(c.symbol)).length;
    update({ holdings, ...(hasCash && cashOn ? { cash: result.cash } : {}), importedAt: new Date().toISOString() });
    toast('success', `Imported from Fidelity: ${n} change${n === 1 ? '' : 's'}${hasCash && cashOn ? ', cash updated' : ''}.`);
    setFile(null);
  };

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = ''; }} />
      {!file ? (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => input.current?.click()}>📥 Import from Fidelity</button>
          <span className="text-xs text-slate-500">{s.importedAt ? `Last import ${new Date(s.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'fidelity.com → Accounts & Trade → Portfolio → Positions → Download'}</span>
        </div>
      ) : (
        <div className="panel space-y-2.5 !border-cyan-300/30">
          <p className="label">📥 From your Fidelity file: tick what to import</p>
          {file.accounts.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {file.accounts.map((a) => (
                <label key={a} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${accounts.includes(a) ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-white/15 text-slate-400'}`}>
                  <input type="checkbox" className="h-3.5 w-3.5 accent-cyan-400" checked={accounts.includes(a)} onChange={() => toggleAccount(a)} /> {a}
                </label>
              ))}
            </div>
          )}
          {file.accounts.length > 1 && <p className="text-xs text-slate-500">The same stock in several accounts is added up, with the right average price.</p>}
          <ImportPreview changes={changes} ticked={ticked} onToggle={(sym) => setTicked((t) => { const n = new Set(t); n.has(sym) ? n.delete(sym) : n.add(sym); return n; })}
            cash={hasCash ? { now: s.cash, file: result!.cash } : null} cashOn={cashOn} onCash={setCashOn} />
          {file.skipped.length > 0 && <p className="text-xs text-slate-500">Skipped (not stocks or funds): {file.skipped.slice(0, 6).join(', ')}{file.skipped.length > 6 ? '…' : ''}</p>}
          <p className="text-xs text-slate-500">Dates you entered (for the tax tips) are kept. The file stays on this device: only the holdings are saved.</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={doImport}>Import</button>
            <button className="btn" onClick={() => setFile(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
