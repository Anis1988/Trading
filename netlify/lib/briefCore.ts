import type { Settings } from '../../src/types';
import type { Brief } from '../../src/lib/brief';
import { briefLine, briefText } from '../../src/lib/brief';
import { levelText, resolveRules } from '../../src/lib/strictness';
import { analyze } from '../../src/lib/trend';
import { buyWait } from '../../src/lib/waitRules';
import { earningsText } from '../../src/lib/insightTypes';
import { stopFor, stopSettings } from '../../src/lib/stopWatch';
import { textEmailParams } from '../../src/lib/emailParams';
import { yahooHistory, type History } from './feeds';
import { getInsights, getMarket } from './insights';
import { sendServerEmail, serverEmailReady } from './mailer';
import { pushAll } from './push';
import { appendServerLog, readServer, readState, writeServer } from './state';

/** Today's date in New York (the brief is "for" the US trading day). */
export const nyDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** ☀️ The weekday morning brief: market, your stocks, stop-loss, earnings, BUY ideas. Free (no AI). */
export async function runBrief(opts: { force?: boolean } = {}): Promise<{ sent: boolean; reason?: string; brief?: Brief }> {
  const state = await readState();
  const s = (state?.data.settings ?? {}) as Partial<Settings>;
  if (!state) return { sent: false, reason: 'No synced data yet. Turn on sync in the app.' };
  if (!opts.force && s.morningBrief === false) return { sent: false, reason: 'Morning brief is off.' };
  const day = nyDay();
  if (!opts.force && (await readServer<Brief | null>('brief', null))?.day === day) return { sent: false, reason: 'Already sent today.' };

  const holdings = (s.holdings ?? []).slice(0, 20);
  const watch = (state.data.watchlist ?? []).filter((x) => !holdings.some((h) => h.symbol === x)).slice(0, 15);
  const symbols = [...holdings.map((h) => h.symbol), ...watch];
  // Bought more than ~5 months ago: 2 years of prices, so a trailing stop sees the highest close since you bought.
  const longAgo = (sym: string) => { const b = holdings.find((h) => h.symbol === sym)?.boughtAt; return !!b && Date.parse(b) < Date.now() - 150 * 86400_000; };
  const series: Record<string, History> = {};
  const [market, info] = await Promise.all([
    getMarket().catch(() => null),
    symbols.length ? getInsights(symbols).catch(() => ({}) as Awaited<ReturnType<typeof getInsights>>) : Promise.resolve({} as Awaited<ReturnType<typeof getInsights>>),
    Promise.all(symbols.map(async (sym) => { const h = await yahooHistory(sym, longAgo(sym) ? '2y' : '6mo').catch(() => null); if (h) series[sym] = h; })),
  ]);
  const lv = resolveRules(s, market);

  // Your stocks on the last trading day.
  let value = 0, change = 0;
  const movers: Brief['movers'] = [];
  for (const h of holdings) {
    const c = series[h.symbol]?.closes;
    if (!c || c.length < 2) continue;
    const [prev, last] = c.slice(-2);
    value += last * h.shares;
    change += (last - prev) * h.shares;
    movers.push({ symbol: h.symbol, pct: Math.round(((last - prev) / prev) * 1000) / 10, dollars: Math.round((last - prev) * h.shares) });
  }
  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const sw = stopSettings(s);
  const stops: Brief['stops'] = sw.on ? holdings.flatMap((h) => {
    const ser = series[h.symbol];
    const price = (ser ? ser.closes[ser.closes.length - 1] : undefined);
    const l = price ? stopFor(h, price, sw, ser.dates, ser.closes) : null;
    return l && (l.hit || l.near) ? [{ symbol: h.symbol, price: price!, stop: l.stop, away: l.away }] : [];
  }) : [];

  // Alerts that already fired never fire again, so they are not "close to firing".
  const firedAlerts = await readServer<Record<string, unknown>>('priceFired', {});
  const alerts: Brief['alerts'] = (s.priceAlerts ?? []).filter((a) => !firedAlerts[a.id]).flatMap((a) => {
    const price = series[a.symbol]?.closes.slice(-1)[0];
    if (!price) return [];
    const away = Math.round((Math.abs(price - a.price) / price) * 1000) / 10;
    const notYet = a.op === 'below' ? price > a.price : price < a.price;
    return notYet && away <= 3 ? [{ symbol: a.symbol, price, target: a.price, away }] : [];
  });

  const earnings: Brief['earnings'] = symbols.flatMap((sym) => {
    const e = info[sym]?.earnings;
    return e && e.inDays >= 0 && e.inDays <= 7 ? [{ symbol: sym, inDays: e.inDays, text: earningsText(e) }] : [];
  }).sort((a, b) => a.inDays - b.inDays);

  // BUY now: the same rules as the stock tiles and Ideas (Settings → How careful).
  const buys: Brief['buys'] = [];
  for (const sym of symbols) {
    const owned = holdings.find((h) => h.symbol === sym);
    const ser = series[sym];
    const a = ser ? analyze(sym, ser.closes, owned, lv.rules) : null;
    if (!a || !(owned ? a.action === 'BUY' : a.ideaKind === 'buy')) continue;
    if (buyWait({ info: info[sym], market, ret1m: a.ret1m, rsi: a.rsi, score: a.score }, lv.rules)) continue;
    buys.push({ symbol: sym, price: a.price, owned: !!owned, idea: a.idea });
  }

  const brief: Brief = {
    at: new Date().toISOString(), day,
    market: market ? { trend: market.trend, ret1m: market.ret1m } : undefined,
    level: levelText(lv),
    last: holdings.length && value > 0 ? { value: Math.round(value), change: Math.round(change), pct: Math.round((change / (value - change)) * 1000) / 10 } : undefined,
    movers: movers.slice(0, 3), earnings, buys: buys.slice(0, 5), stops, alerts,
  };
  await writeServer('brief', brief);

  let sent = false;
  if (await pushAll({ title: '☀️ Morning brief', body: briefLine(brief), tag: 'brief' }).catch(() => 0)) sent = true;
  if (s.toEmail && serverEmailReady()) {
    try {
      await sendServerEmail(textEmailParams(`Morning brief: ${briefLine(brief)}`.slice(0, 120), briefText(brief, process.env.URL ?? ''), s.toEmail));
      sent = true;
    } catch (e) {
      await appendServerLog([{ ts: new Date().toISOString(), level: 'error', msg: `Morning brief email failed: ${e instanceof Error ? e.message : e}` }]);
    }
  }
  await appendServerLog([{ ts: new Date().toISOString(), level: 'info', msg: `Morning brief: ${briefLine(brief)}${sent ? '' : ' (shown in the app only: no email or notification set up)'}` }]);
  return { sent, brief };
}
