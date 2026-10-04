import type { Settings } from '../../src/types';
import { entriesToSignals, scoreSignals, HORIZON_TRADING_DAYS } from '../../src/lib/scoreboard';
import { textEmailParams } from '../../src/lib/emailParams';
import { yahooHistory, type History } from './feeds';
import { sendServerEmail, serverEmailReady } from './mailer';
import { pushAll } from './push';
import { appendServerLog, readState } from './state';

const money = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Friday summary: profit/loss, this week's alerts and how past calls did. */
export async function runWeekly(opts: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string; text?: string }> {
  const state = await readState();
  const s = (state?.data.settings ?? {}) as Partial<Settings>;
  if (!state) return { sent: false, reason: 'No synced data yet.' };
  if (!opts.force && !s.weeklySummary) return { sent: false, reason: 'Weekly summary is off.' };
  if (!s.toEmail) return { sent: false, reason: 'No email address saved in the app.' };

  const holdings = s.holdings ?? [];
  const scoreLog = state.data.scoreLog ?? [];
  const symbols = [...new Set([...holdings.map((h) => h.symbol), ...scoreLog.slice(0, 40).map((e) => e.symbol)])].slice(0, 30);
  const series: Record<string, History> = {};
  await Promise.all(symbols.map(async (sym) => { try { const h = await yahooHistory(sym); if (h) series[sym] = h; } catch { /* skip */ } }));

  const lines: string[] = [];
  let value = 0, cost = 0, week = 0;
  for (const h of holdings) {
    const ser = series[h.symbol];
    if (!ser) { lines.push(`${h.symbol}: no price`); continue; }
    const price = ser.closes[ser.closes.length - 1];
    const weekAgo = ser.closes[Math.max(0, ser.closes.length - 6)];
    value += price * h.shares; cost += h.avgCost * h.shares; week += (price - weekAgo) * h.shares;
    lines.push(`${h.symbol}: ${h.shares} sh at $${price.toFixed(2)} · this week ${money((price - weekAgo) * h.shares)} · overall ${money((price - h.avgCost) * h.shares)}`);
  }
  const since = Date.now() - 7 * 86400_000;
  const recent = (state.data.history ?? []).filter((x) => !x.deleted && new Date(x.createdAt).getTime() >= since);
  const sc = scoreSignals(entriesToSignals(scoreLog), series);

  const text = [
    'Your week',
    holdings.length ? `Portfolio: worth $${Math.round(value).toLocaleString()} · overall ${money(value - cost)} · this week ${money(week)}` : 'No holdings entered.',
    '',
    ...lines,
    '',
    `Instructions this week: ${recent.length}${recent.length ? ` (${recent.filter((x) => x.status === 'executed').length} executed, ${recent.filter((x) => x.status === 'pending').length} pending)` : ''}`,
    ...recent.slice(0, 10).map((x) => `- ${x.side} ${x.qty} ${x.symbol} · ${x.status}`),
    '',
    sc.scored.length
      ? `Scoreboard: ${sc.winRate!.toFixed(0)}% of ${sc.scored.length} calls were right after ${HORIZON_TRADING_DAYS} trading days (average ${sc.avgEdge!.toFixed(1)}%).${sc.scored.length < 20 ? ' Still too few to trust.' : ''}`
      : 'Scoreboard: nothing old enough to score yet.',
    '',
    'Ideas only, not financial advice. You place every order yourself.',
  ].join('\n');

  if (!serverEmailReady()) return { sent: false, reason: 'Server email is not set up (EMAILJS_PRIVATE_KEY).', text };
  await sendServerEmail(textEmailParams(`Your week: ${holdings.length ? money(week) : 'summary'}`, text, s.toEmail));
  await pushAll({ title: 'Weekly summary sent', body: holdings.length ? `This week ${money(week)}` : 'Check your email.', tag: 'weekly' });
  await appendServerLog([{ ts: new Date().toISOString(), level: 'info', msg: 'Weekly summary emailed.' }]);
  return { sent: true, text };
}
