import { describe, expect, it } from 'vitest';
import { generateSignals } from './signals';
import { computeDelay } from './poller';
import { historyToCsv } from './csv';
import type { Headline } from '../types';

const h = (title: string, symbol = 'AAPL'): Headline => ({ id: title, title, url: 'u', source: 's', publishedAt: new Date().toISOString(), symbol });
const opts = { defaultQty: 2, minConfidence: 0.6, existing: [] };

describe('signal engine', () => {
  it('BUY on bullish news', () => {
    const [s] = generateSignals([h('AAPL beats earnings, raises full-year guidance')], ['AAPL'], opts);
    expect(s.side).toBe('BUY');
    expect(s.qty).toBe(2);
    expect(s.confidence).toBeGreaterThanOrEqual(0.6);
  });
  it('SELL on bearish news', () => {
    const [s] = generateSignals([h('AAPL downgraded amid lawsuit and recall')], ['AAPL'], opts);
    expect(s.side).toBe('SELL');
  });
  it('ignores neutral news and respects cooldown', () => {
    expect(generateSignals([h('AAPL appoints new director')], ['AAPL'], opts)).toEqual([]);
    const first = generateSignals([h('AAPL upgraded, record growth')], ['AAPL'], opts);
    expect(generateSignals([h('AAPL upgraded, record growth')], ['AAPL'], { ...opts, existing: first })).toEqual([]);
  });
});

describe('poller backoff', () => {
  it('doubles and caps with bounded jitter', () => {
    expect(computeDelay(30_000, 0, 600_000, 0)).toBe(30_000);
    expect(computeDelay(30_000, 2, 600_000, 0)).toBe(120_000);
    expect(computeDelay(30_000, 10, 600_000, 1)).toBe(780_000);
  });
});

describe('csv', () => {
  it('escapes formulas and quotes', () => {
    const csv = historyToCsv([{ id: '1', signalId: 's', createdAt: 'x', symbol: 'A', side: 'BUY', qty: 1, orderType: 'MARKET', reason: '=cmd,"x"', confidence: 0.7, channel: 'copy', status: 'pending' }]);
    expect(csv).toContain(`"'=cmd,""x"""`);
  });
});
