import { useMemo, useState } from 'react';
import { GROUPS, type Term } from '../lib/glossary';

/** One dictionary entry. Also used as the live example in the Guide. */
export function TermCard({ t }: { t: Term }) {
  return (
    <div className="panel space-y-1">
      <p className="font-display text-base font-semibold text-slate-50">
        {t.word}
        {t.also && <span className="ml-2 text-xs font-normal text-slate-500">also: {t.also}</span>}
      </p>
      <p className="text-sm leading-relaxed text-slate-300">{t.means}</p>
      {t.example && <p className="text-xs text-slate-400"><span className="text-cyan-300">Example:</span> {t.example}</p>}
      {t.app && <p className="text-xs text-violet-200"><span aria-hidden="true">🧭</span> In this app: {t.app}</p>}
    </div>
  );
}

/** Plain-language dictionary of trading words, searchable. */
export function Words() {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return GROUPS;
    return GROUPS.map((g) => ({ ...g, terms: g.terms.filter((t) => `${t.word} ${t.also ?? ''} ${t.means}`.toLowerCase().includes(s)) })).filter((g) => g.terms.length);
  }, [q]);
  const count = groups.reduce((n, g) => n + g.terms.length, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Words</h2>
        <p className="text-sm text-slate-400">Trading words in plain English. Type to search, or tap a topic.</p>
      </div>
      <input className="input w-full" type="search" placeholder="Search a word, e.g. bull, RSI, P/E" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search words" />
      {!q && (
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <a key={g.name} href={`#w-${g.name}`} className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-300 hover:border-cyan-300/50 hover:text-cyan-100">
              {g.emoji} {g.name}
            </a>
          ))}
        </div>
      )}
      {count === 0 && <p className="text-sm text-slate-400">No word matches "{q}". Try a shorter search.</p>}
      {groups.map((g) => (
        <section key={g.name} id={`w-${g.name}`} className="scroll-mt-28 space-y-2">
          <h3 className="text-lg font-semibold">{g.emoji} {g.name}</h3>
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {g.terms.map((t) => <TermCard key={t.word} t={t} />)}
          </div>
        </section>
      ))}
      <p className="text-center text-xs text-slate-500">Simple explanations to help you follow along, not financial advice.</p>
    </div>
  );
}
