import { useState } from 'react';

export function PassphraseModal(p: { reason: string; onSubmit: (pass: string) => Promise<boolean>; onCancel: () => void }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!(await p.onSubmit(pass))) setErr('Incorrect passphrase (or none set — see Settings).');
        }}
      >
        <h2 className="text-lg font-semibold">Passphrase required</h2>
        <p className="text-sm text-slate-300">{p.reason}</p>
        <input autoFocus type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="input w-full" placeholder="Passphrase" />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={p.onCancel}>Cancel</button>
          <button className="btn-primary">Confirm</button>
        </div>
      </form>
    </div>
  );
}
