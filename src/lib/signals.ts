import type { Headline, Signal, SignalSource } from '../types';
import { nowIso, uid } from './util';

// Keyword weights: positive = bullish, negative = bearish. Strong catalysts weigh more.
const KEYWORDS: Record<string, number> = {
  'beats': 2, 'beat expectations': 2, 'raises guidance': 3, 'raises full-year guidance': 3, 'record': 1.5,
  'upgrade': 2.5, 'upgraded': 2.5, 'buyback': 2, 'partnership': 1.5, 'approval': 2, 'approves': 1.5, 'surge': 2, 'soar': 2,
  'misses': -2, 'cuts outlook': -3, 'cut guidance': -3, 'downgrade': -2.5, 'downgraded': -2.5, 'layoffs': -2,
  'lawsuit': -2, 'probe': -2, 'investigation': -2, 'recall': -2.5, 'plunge': -2.5, 'bankruptcy': -4, 'fraud': -4, 'slump': -2,
};

// Tiny AFINN-style lexicon (lightweight client-side sentiment)
const LEXICON: Record<string, number> = {
  good: 1, great: 2, strong: 2, growth: 1, gain: 1, gains: 1, profit: 1, rally: 2, bullish: 2, positive: 1, win: 2, wins: 2, boost: 1, rise: 1, rises: 1,
  bad: -1, weak: -2, loss: -1, losses: -2, fall: -1, falls: -1, drop: -1, drops: -1, bearish: -2, negative: -1, fear: -1, risk: -1, warning: -2, decline: -1, crash: -3, "sell-off": -2,
};

export function sentimentScore(text: string): number {
  const words = text.toLowerCase().match(/[a-z\-]+/g) ?? [];
  return words.reduce((a, w) => a + (LEXICON[w] ?? 0), 0);
}

export function keywordScore(text: string): { score: number; hits: string[] } {
  const t = text.toLowerCase();
  let score = 0;
  const hits: string[] = [];
  for (const [k, w] of Object.entries(KEYWORDS)) {
    if (t.includes(k)) {
      score += w;
      hits.push(k);
    }
  }
  return { score, hits };
}

export function isDuplicate(existing: Signal[], symbol: string, side: string, cooldownMs = 6 * 3600_000): boolean {
  return existing.some((s) => s.symbol === symbol && s.side === side && Date.now() - new Date(s.createdAt).getTime() < cooldownMs);
}

export interface EngineOptions {
  defaultQty: number;
  minConfidence: number;
  existing: Signal[];
  source?: SignalSource;
  cooldownMs?: number;
}

function mentions(h: Headline, symbol: string): boolean {
  if (h.symbol === symbol) return true;
  return new RegExp(`(^|[^A-Z])\\$?${symbol.replace('.', '\\.')}([^A-Z]|$)`).test(h.title);
}

/**
 * Per-symbol: combine keyword and sentiment scores over all matching headlines.
 * confidence = 0.35 + 0.08*|score| + 0.04*(headlines-1), capped at 0.95.
 */
export function generateSignals(headlines: Headline[], symbols: string[], o: EngineOptions): Signal[] {
  const cooldown = o.cooldownMs ?? 6 * 3600_000;
  const out: Signal[] = [];
  for (const symbol of symbols) {
    const rel = headlines.filter((h) => mentions(h, symbol));
    if (!rel.length) continue;
    let total = 0;
    const reasons: { w: number; text: string; url: string }[] = [];
    for (const h of rel) {
      const k = keywordScore(h.title);
      const s = sentimentScore(h.title);
      const w = k.score + s * 0.5;
      total += w;
      if (w !== 0) reasons.push({ w, text: `"${h.title}"${k.hits.length ? ` [${k.hits.join(', ')}]` : ''}`, url: h.url });
    }
    if (Math.abs(total) < 2) continue;
    const side = total > 0 ? 'BUY' : 'SELL';
    const confidence = Math.min(0.95, 0.35 + 0.08 * Math.abs(total) + 0.04 * (rel.length - 1));
    if (confidence < o.minConfidence) continue;
    if (isDuplicate([...o.existing, ...out], symbol, side, cooldown)) continue;
    reasons.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    out.push({
      id: uid(),
      symbol,
      side,
      confidence: Math.round(confidence * 100) / 100,
      reason: `${rel.length} headline(s), net score ${total.toFixed(1)}. Top: ${reasons[0]?.text ?? 'n/a'}`,
      qty: o.defaultQty,
      createdAt: nowIso(),
      status: 'new',
      source: o.source ?? 'local',
      headlineUrl: reasons[0]?.url,
    });
  }
  return out;
}
