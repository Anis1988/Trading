import type { Buzz } from '../lib/insightTypes';
import { MOOD_LABEL } from '../lib/insightTypes';

const MOOD_STYLE = {
  positive: { cls: 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200', icon: '▲' },
  negative: { cls: 'border-red-300/50 bg-red-400/15 text-red-200', icon: '▼' },
  mixed: { cls: 'border-amber-300/50 bg-amber-400/15 text-amber-200', icon: '◆' },
  unknown: { cls: 'border-white/15 text-slate-300', icon: '●' },
} as const;

/** "🔥 Trending 3.1× · ▼ mostly negative": shown only when a stock is suddenly talked about much more than usual. */
export function BuzzBadge({ b, always = false }: { b?: Buzz; always?: boolean }) {
  if (!b || (!b.trending && !always)) return null;
  const m = MOOD_STYLE[b.mood];
  const talk = b.trending ? `🔥 Trending${b.ratio ? ` ${b.ratio}×` : ''}` : '💬 Reddit';
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.cls}`} title={b.moodFrom === 'news' ? 'Talk: Reddit. Mood: from the latest news headlines (no Reddit key yet)' : 'Reddit: r/stocks, r/wallstreetbets, r/investing'}>
      {talk}{b.mood !== 'unknown' ? ` · ${m.icon} ${b.moodFrom === 'news' ? `news ${MOOD_LABEL[b.mood].replace('mostly ', '')}` : MOOD_LABEL[b.mood]}` : ''}
    </span>
  );
}

export function MoodBar({ b }: { b: Buzz }) {
  if (b.mood === 'unknown') return <p className="text-xs text-slate-500">{b.trending ? 'Not enough posts or news to tell the mood.' : 'Mood is checked when talk suddenly jumps.'}</p>;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${b.pos}% positive, ${b.neu}% neutral, ${b.neg}% negative`}>
        <span className="bg-emerald-400" style={{ width: `${b.pos}%` }} />
        <span className="bg-slate-400" style={{ width: `${b.neu}%` }} />
        <span className="bg-red-400" style={{ width: `${b.neg}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px]">
        <span className="text-emerald-300">▲ {b.pos}% positive</span>
        <span className="text-slate-400">{b.neu}% neutral</span>
        <span className="text-red-300">▼ {b.neg}% negative</span>
      </div>
    </div>
  );
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Full Reddit box for an opened stock card. */
export function RedditPanel({ b }: { b?: Buzz }) {
  if (!b) return null;
  return (
    <div className="panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="label">What Reddit is saying · last 24 h</p>
        <span className="text-[11px] text-slate-500">r/stocks · r/wallstreetbets · r/investing</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="panel !p-2">
          <p className="label !text-[10px]">Mentions</p>
          <p className="num font-semibold">{b.mentions !== undefined ? b.mentions.toLocaleString() : '—'}</p>
          {b.ratio !== undefined && <p className={`text-[11px] ${b.ratio >= 2 ? 'text-orange-300' : 'text-slate-400'}`}>{b.ratio >= 1 ? '▲' : '▼'} {b.ratio}× yesterday</p>}
        </div>
        <div className="panel !p-2">
          <p className="label !text-[10px]">Rank</p>
          <p className="num font-semibold">{b.rank ? `#${b.rank}` : '—'}</p>
          {b.rank && b.rankBefore ? <p className="text-[11px] text-slate-400">{b.rank < b.rankBefore ? '▲' : b.rank > b.rankBefore ? '▼' : '='} from #{b.rankBefore}</p> : null}
        </div>
        <div className="panel !p-2">
          <p className="label !text-[10px]">Mood</p>
          <p className={`font-semibold ${b.mood === 'positive' ? 'text-emerald-300' : b.mood === 'negative' ? 'text-red-300' : b.mood === 'mixed' ? 'text-amber-200' : 'text-slate-400'}`}>
            {b.mood === 'unknown' ? 'Unknown' : MOOD_LABEL[b.mood].replace(/^./, (c) => c.toUpperCase())}
          </p>
          <p className="text-[11px] text-slate-500">{b.moodFrom === 'news' ? 'from news headlines' : 'from post titles'}</p>
        </div>
      </div>
      <MoodBar b={b} />
      {b.moodFrom === 'news' && (
        <p className="rounded-lg border border-sky-300/30 bg-sky-400/10 px-2 py-1.5 text-xs text-sky-100">
          How the mood was found: Reddit posts can't be read yet (no Reddit key), so I read this stock's news headlines from the last 2 days. Each headline is scored with simple good and bad words ("surge", "beats" vs "plunge", "probe"). The mood is the share of good vs bad headlines.
        </p>
      )}
      {b.why && <p className="text-sm text-slate-200"><span className="label !text-[10px]">{b.moodFrom === 'news' ? 'Likely reason (from the news)' : "Why it's talked about"}</span><br />{b.why}</p>}
      {b.posts.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {b.posts.map((p) => (
            <li key={p.url} className="flex gap-2">
              <span aria-hidden="true" className={p.tone === '+' ? 'text-emerald-300' : p.tone === '-' ? 'text-red-300' : 'text-slate-500'}>{p.tone === '+' ? '▲' : p.tone === '-' ? '▼' : '●'}</span>
              <a className="text-slate-300 hover:text-cyan-200 hover:underline" href={p.url} target="_blank" rel="noopener noreferrer">
                {p.title} <span className="text-xs text-slate-500">· {p.sub}{b.moodFrom !== 'news' && <> · ⬆ {k(p.ups)} · 💬 {k(p.comments)}</>} · {p.ageH}h</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">Context only: what people are talking about. Crowds are often wrong and can be manipulated.</p>
    </div>
  );
}

/** Side panel: talk level for each of your stocks. */
export function BuzzRail({ items }: { items: { sym: string; b?: Buzz }[] }) {
  const known = items.filter((x) => x.b?.ratio !== undefined || x.b?.mentions !== undefined).sort((a, z) => (z.b?.ratio ?? 0) - (a.b?.ratio ?? 0));
  const quiet = items.filter((x) => !known.includes(x)).map((x) => x.sym);
  if (!known.length && !quiet.length) return null;
  return (
    <section className="card space-y-2">
      <p className="label">Talk on Reddit · your stocks</p>
      {known.map(({ sym, b }) => {
        const r = b!.ratio ?? 1;
        const hot = !!b!.trending;
        return (
          <div key={sym} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-display font-semibold">{sym}</span>
            <span className="flex items-center gap-2">
              {b!.mood !== 'unknown' && <span className={`text-[11px] ${b!.mood === 'positive' ? 'text-emerald-300' : b!.mood === 'negative' ? 'text-red-300' : 'text-amber-200'}`}>{b!.mood === 'positive' ? '▲' : b!.mood === 'negative' ? '▼' : '◆'}</span>}
              <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><span className={`block h-full ${hot ? 'bg-orange-400' : 'bg-cyan-400'}`} style={{ width: `${Math.min(100, (r / 4) * 100)}%` }} /></span>
              <span className={`num w-10 text-right text-xs ${hot ? 'text-orange-300' : 'text-slate-300'}`}>{b!.ratio !== undefined ? `${b!.ratio}×` : '—'}</span>
            </span>
          </div>
        );
      })}
      {quiet.length > 0 && <p className="text-xs text-slate-500">{quiet.join(', ')} · rarely discussed</p>}
    </section>
  );
}
