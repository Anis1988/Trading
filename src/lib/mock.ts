import type { Headline } from '../types';
import { uid } from './util';

const BULL = [
  '{S} beats earnings expectations, raises full-year guidance',
  '{S} upgraded to buy as analysts cite record growth',
  '{S} announces major partnership, shares surge',
  '{S} reports strong demand, approves share buyback',
];
const BEAR = [
  '{S} misses revenue estimates, cuts outlook',
  '{S} downgraded to sell amid probe and lawsuit concerns',
  '{S} announces layoffs as sales slump',
  '{S} faces recall and regulatory investigation, shares plunge',
];
const NEUTRAL = ['{S} to present at industry conference next month', '{S} appoints new regional director'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Simulated headlines. ~45% of ticks produce a strongly-worded headline for one symbol. */
export function mockHeadlines(symbols: string[]): Headline[] {
  const out: Headline[] = [];
  for (const sym of symbols) {
    const r = Math.random();
    const tpl = r < 0.2 ? pick(BULL) : r < 0.4 ? pick(BEAR) : r < 0.5 ? pick(NEUTRAL) : null;
    if (!tpl) continue;
    out.push({
      id: 'mock-' + uid(),
      title: tpl.replace('{S}', sym),
      url: 'https://example.com/mock/' + sym,
      source: 'Mock Wire',
      publishedAt: new Date().toISOString(),
      symbol: sym,
    });
  }
  return out;
}
