import { useState } from 'react';
import { Sheet } from './ui';

export function PassphraseModal(p: { reason: string; onSubmit: (pass: string) => Promise<boolean>; onCancel: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  return (
    <Sheet onClose={p.onCancel} labelledBy="pp-title">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!(await p.onSubmit(pass))) setErr('Wrong passphrase (or none set yet; see Settings).');
        }}
      >
        <h2 id="pp-title" className="text-lg font-semibold">Confirm it's you</h2>
        <p className="text-sm text-slate-300">{p.reason}</p>
        <input autoFocus type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="input w-full" placeholder="Passphrase" />
        <p className="text-xs text-slate-500">This device then stays unlocked for 24 hours.</p>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>
          <button className="btn-primary">Confirm</button>
        </div>
      </form>
    </Sheet>
  );
}
