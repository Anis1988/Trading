import type { Buzz } from '../../src/lib/insightTypes';
import { keywordScore, sentimentScore } from '../../src/lib/signals';
import { cached } from './aiBudget';

const UA = 'web:trading-assistant:1.0 (personal use)';
const SUBS = 'stocks+wallstreetbets+investing';

export const redditReady = () => !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);

interface Ape { ticker: string; mentions: number; mentions_24h_ago: number; rank: number; rank_24h_ago: number }

/** Mention counts across Reddit's stock forums (ApeWisdom, free, no key). Top ~500 tickers, cached 30 min. */
function apeWisdom(): Promise<Record<string, Ape>> {
  const slot = Math.floor(Date.now() / 1800_000);
  return cached('buzz-cache', `ape-${slot}`, 1800_000, async () => {
    const out: Record<string, Ape> = {};
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`https://apewisdom.io/api/v1.0/filter/all-stocks/page/${page}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) break;
      const j = (await res.json()) as { results?: Ape[]; pages?: number };
      for (const r of j.results ?? []) out[r.ticker] = r;
      if (!j.pages || page >= j.pages) break;
    }
    return out;
  }).catch(() => ({}));
}

let token: { value: string; until: number } | null = null;
async function redditToken(): Promise<string | null> {
  if (!redditReady()) return null;
  if (token && Date.now() < token.until) return token.value;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Reddit login failed (HTTP ${res.status}). Check REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET.`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}

/** A post is about the stock if the title has the ticker as a separate upper-case word ("$F" style required for 1-letter tickers). */
function mentions(title: string, sym: string): boolean {
  const s = sym.replace('-', '.').replace('.', '\\.');
  if (sym.length === 1) return new RegExp(`\\$${s}(?![A-Za-z])`).test(title);
  return new RegExp(`(^|[^A-Za-z])\\$?${s}(?![A-Za-z])`).test(title);
}

const tone = (t: string): '+' | '-' | '0' => {
  const v = keywordScore(t).score + sentimentScore(t) * 0.5;
  return v >= 1 ? '+' : v <= -1 ? '-' : '0';
};

/** Top posts of the last day about one stock, with a mood read from the titles (free word scoring). Cached 30 min. */
function posts(sym: string): Promise<Buzz['posts']> {
  const slot = Math.floor(Date.now() / 1800_000);
  return cached('buzz-cache', `posts-${sym}-${slot}`, 1800_000, async () => {
    const t = await redditToken();
    if (!t) return [];
    const q = encodeURIComponent(sym.length === 1 ? `$${sym}` : sym);
    const res = await fetch(`https://oauth.reddit.com/r/${SUBS}/search?q=${q}&restrict_sr=1&sort=top&t=day&limit=50&raw_json=1`, {
      headers: { Authorization: `Bearer ${t}`, 'User-Agent': UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Reddit search HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { children?: { data: { title: string; subreddit: string; ups: number; num_comments: number; created_utc: number; permalink: string } }[] } };
    return (j.data?.children ?? [])
      .map((c) => c.data)
      .filter((d) => mentions(d.title, sym))
      .slice(0, 25)
      .map((d) => ({
        title: d.title.slice(0, 200),
        sub: `r/${d.subreddit}`,
        ups: d.ups,
        comments: d.num_comments,
        ageH: Math.max(0, Math.round((Date.now() / 1000 - d.created_utc) / 3600)),
        url: `https://www.reddit.com${d.permalink}`,
        tone: tone(d.title),
      }));
  }).catch(() => []);
}

export async function getBuzz(symbols: string[]): Promise<Record<string, Buzz>> {
  const ape = await apeWisdom();
  const out: Record<string, Buzz> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      const a = ape[sym];
      const ps = await posts(sym);
      // Mood: share of upvote-weighted posts that read positive / negative.
      let p = 0, n = 0, z = 0;
      for (const x of ps) {
        const w = Math.log10(10 + x.ups);
        if (x.tone === '+') p += w; else if (x.tone === '-') n += w; else z += w;
      }
      const tot = p + n + z;
      const pct = (v: number) => (tot ? Math.round((v / tot) * 100) : 0);
      const pos = pct(p), neg = pct(n), neu = tot ? 100 - pos - neg : 0;
      const mood: Buzz['mood'] = ps.length < 3 ? 'unknown' : pos - neg >= 20 ? 'positive' : neg - pos >= 20 ? 'negative' : 'mixed';
      const ratio = a && a.mentions_24h_ago > 0 ? Math.round((a.mentions / a.mentions_24h_ago) * 10) / 10 : undefined;
      const wanted = mood === 'positive' ? '+' : mood === 'negative' ? '-' : null;
      const sorted = [...ps].sort((x, y) => y.ups - x.ups);
      const why = (wanted ? sorted.find((x) => x.tone === wanted) : undefined) ?? sorted[0];
      if (!a && !ps.length) return;
      out[sym] = {
        mentions: a?.mentions,
        ratio,
        rank: a?.rank,
        rankBefore: a?.rank_24h_ago,
        trending: !!a && a.mentions >= 20 && (ratio ?? 0) >= 2,
        mood, pos, neu, neg,
        why: why?.title,
        posts: sorted.slice(0, 3),
      };
    }),
  );
  return out;
}
