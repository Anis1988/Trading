import type { Headline, HistoryItem, ScoreEntry, Settings, Signal } from '../../src/types';
import { generateSignals } from '../../src/lib/signals';
import { planOrder, formatInstruction } from '../../src/lib/instructions';
import { computeRisk, stopPctFor } from '../../src/lib/risk';
import { tradeEmailParams } from '../../src/lib/emailParams';
import { uid } from '../../src/lib/util';
import { finnhubNews, googleNews, yahooHistory, yahooNews, type ServerHeadline } from './feeds';
import { analyze, type Analysis } from '../../src/lib/trend';
import { TREND_CHECK_EVERY_MS, trendSellSignals } from '../../src/lib/trendSignals';
import { reviewTrade } from './reviewCore';
import { sendServerEmail, serverEmailReady } from './mailer';
import { pushAll } from './push';
import { BACK_ON_EVERY_MS, checkBackOn, checkPriceAlerts } from './extraAlerts';
import { textEmailParams } from '../../src/lib/emailParams';
import { appendServerLog, readServer, readState, writeServer, writeState, type ServerLogEntry } from './state';

const MAX_AGE_MS = 24 * 3600_000;
const MAX_REVIEWS_PER_RUN = 2; // keep AI spend low
const MAX_EMAILS_PER_DAY = 10;

/** US market-ish hours, Mon-Fri 11:00-24:00 UTC (7am-8pm New York). Outside it, news is saved but nothing runs. */
export function inActiveHours(d = new Date()): boolean {
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  return day >= 1 && day <= 5 && h >= 11;
}

export interface WatchResult {
  ran: boolean;
  reason?: string;
  headlines?: number;
  signals?: number;
  emailed?: number;
  pushed?: number;
}

/** One background check: news -> signals -> AI review -> email/push for APPROVE above your threshold. */
export async function runWatch(opts: { force?: boolean } = {}): Promise<WatchResult> {
  const log: ServerLogEntry[] = [];
  const say = (level: ServerLogEntry['level'], msg: string) => log.push({ ts: new Date().toISOString(), level, msg });
  try {
    const state = await readState();
    const s = (state?.data.settings ?? {}) as Partial<Settings>;
    if (!state) return { ran: false, reason: 'No synced data yet. Turn on sync in the app.' };
    if (!s.serverAlerts) return { ran: false, reason: 'Background alerts are off.' };
    if (!opts.force && !inActiveHours()) return { ran: false, reason: 'Outside market hours.' };

    // Price alerts and "BUY is back on" first: they don't depend on news and cost no AI.
    const today = new Date().toISOString().slice(0, 10);
    const counter = await readServer<{ day: string; n: number }>('emails', { day: today, n: 0 });
    if (counter.day !== today) Object.assign(counter, { day: today, n: 0 });
    const notify = async (title: string, body: string): Promise<boolean> => {
      let ok = false;
      if (s.toEmail && serverEmailReady() && counter.n < MAX_EMAILS_PER_DAY) {
        try {
          await sendServerEmail(textEmailParams(title.replace(/^\S+\s/, ''), body, s.toEmail));
          counter.n++;
          ok = true;
        } catch (e) {
          say('error', `Email failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (await pushAll({ title, body, tag: title }).catch(() => 0)) ok = true;
      return ok;
    };
    try {
      if (s.priceAlerts?.length) await checkPriceAlerts(s.priceAlerts, notify, say);
      if (Date.now() - (await readServer<number>('backOnAt', 0)) > BACK_ON_EVERY_MS) {
        await writeServer('backOnAt', Date.now());
        await checkBackOn(s, state.data.scoreLog ?? [], notify, say);
      }
    } catch (e) {
      say('error', `Price / back-on check failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    await writeServer('emails', counter);

    const holdings = s.holdings ?? [];
    const symbols = [...new Set([...holdings.map((h) => h.symbol), ...(state.data.watchlist ?? [])])].slice(0, 15);
    if (!symbols.length) return { ran: false, reason: 'No holdings or watchlist.' };

    // 1. fresh news only (not seen before, not older than 24h)
    const seen = new Set(await readServer<string[]>('seen', []));
    const key = process.env.FINNHUB_KEY;
    const jobs = symbols.flatMap((sym) => [yahooNews(sym), googleNews(sym), ...(key ? [finnhubNews(sym, key)] : [])]);
    const got = (await Promise.allSettled(jobs)).flatMap((r) => (r.status === 'fulfilled' ? r.value : [])) as ServerHeadline[];
    const cutoff = Date.now() - MAX_AGE_MS;
    const fresh: Headline[] = got.filter((h) => !seen.has(h.id) && new Date(h.publishedAt).getTime() >= cutoff);
    got.forEach((h) => seen.add(h.id));
    await writeServer('seen', [...seen].slice(-3000));

    // 2. signals (6h cooldown against what the server already sent)
    const previous = await readServer<Signal[]>('signals', []);
    // Hourly: SELL for a held stock whose price trend turned weak, even with quiet news.
    let trendSignals: Signal[] = [];
    const lastTrend = await readServer<number>('trendAt', 0);
    if (holdings.length && Date.now() - lastTrend > TREND_CHECK_EVERY_MS) {
      await writeServer('trendAt', Date.now());
      const analyses = (
        await Promise.all(holdings.slice(0, 15).map(async (h) => {
          const hist = await yahooHistory(h.symbol).catch(() => null);
          return hist ? analyze(h.symbol, hist.closes, h) : null;
        }))
      ).filter((a): a is Analysis => !!a);
      trendSignals = trendSellSignals(analyses, holdings, previous);
    }
    const signals = [
      ...generateSignals(fresh, symbols, {
        defaultQty: s.defaultQty ?? 1, minConfidence: s.minConfidence ?? 0.6, existing: previous, source: 'local',
      }).map((x) => ({ ...x, origin: 'news' as const })),
      ...trendSignals,
    ]
      // Only strong signals are worth paying an AI check for.
      .filter((x) => x.confidence >= Math.max(s.aiMinConfidence ?? 0.75, s.autoEmailMinConfidence ?? 0.85))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, opts.force ? 1 : MAX_REVIEWS_PER_RUN); // a manual run must finish within the request time limit
    if (!signals.length) {
      await appendServerLog([{ ts: new Date().toISOString(), level: 'info', msg: `Checked ${symbols.length} stocks, ${fresh.length} new headlines, no signal.` }]);
      await writeServer('lastRun', new Date().toISOString());
      return { ran: true, headlines: fresh.length, signals: 0, emailed: 0, pushed: 0 };
    }

    // 3. review + alert
    const newHistory: HistoryItem[] = [];
    const newScores: ScoreEntry[] = [];
    let emailed = 0;
    let pushed = 0;
    // Reviews run in parallel (each takes a few seconds); alerts are then sent one by one.
    const reviews = await Promise.allSettled(
      signals.map((sig) =>
        reviewTrade({
          signal: { symbol: sig.symbol, side: sig.side, confidence: sig.confidence, reason: sig.reason, qty: sig.qty },
          headlines: fresh.filter((h) => h.symbol === sig.symbol).slice(0, 15).map((h) => ({ title: h.title, source: h.source, publishedAt: h.publishedAt })),
          holdings,
          risk: { riskPerTrade: s.riskPerTrade ?? 100, stopLossPct: s.stopLossPct ?? 5, smartStop: s.smartStop ?? true, cash: s.cash, horizon: s.horizon },
        }),
      ),
    );
    for (const [i, sig] of signals.entries()) {
      try {
        const rv = reviews[i];
        if (rv.status === 'rejected') throw rv.reason;
        const r = rv.value;
        const price = r.quote?.price;
        if (price) newScores.push({ id: sig.id, symbol: sig.symbol, side: sig.side, createdAt: sig.createdAt, entryPrice: price, verdict: r.verdict, why: r.verdict === 'APPROVE' ? undefined : r.rule ?? 'ai', origin: 'server' });
        say('info', `${sig.side} ${sig.symbol}: AI ${r.verdict}. ${r.rationale}`);
        if (r.verdict !== 'APPROVE' || sig.confidence < (s.autoEmailMinConfidence ?? 0.85)) continue;

        const risk = computeRisk(sig.side, price, s.riskPerTrade ?? 100, stopPctFor(r.quote?.volPct, s.stopLossPct ?? 5, s.smartStop ?? true));
        const ready: Signal = {
          ...sig, qty: r.suggestedQty > 0 ? r.suggestedQty : sig.qty, entryPrice: price, stopPrice: risk?.stop, suggestedQty: risk?.suggestedQty,
          review: { verdict: r.verdict, confidence: r.confidence, rationale: r.rationale, risks: r.risks, holdingNote: r.holdingNote, price, earnings: r.earnings, analysts: r.analysts, market: r.market, reddit: r.reddit, health: r.health, insiders: r.insiders },
        };
        const plan = planOrder(s.limits?.[sig.symbol]);
        let channelNote = '';
        if (s.toEmail && serverEmailReady() && counter.n < MAX_EMAILS_PER_DAY) {
          await sendServerEmail(tradeEmailParams(ready, plan, s.toEmail));
          counter.n++;
          emailed++;
          channelNote = 'emailed';
        }
        const sent = await pushAll({ title: `${ready.side} ${ready.qty} ${ready.symbol}`, body: r.rationale, tag: ready.id });
        pushed += sent;
        if (sent) channelNote += channelNote ? ' + notification' : 'notification';
        if (!channelNote) {
          say('warn', `${sig.symbol}: approved but no email or notification could be sent (check server email / notification setup).`);
          continue;
        }
        newHistory.push({
          id: uid(), signalId: ready.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), symbol: ready.symbol, side: ready.side, qty: ready.qty,
          orderType: plan.orderType, limitPrice: plan.limitPrice, reason: ready.reason, confidence: ready.confidence,
          channel: 'email', status: 'pending', note: `Background alert (${channelNote}). ${formatInstruction(ready, plan).split('\n').find((l) => l.startsWith('Suggested stop-loss')) ?? ''}`.trim(),
        });
        say('info', `Alert sent for ${ready.side} ${ready.qty} ${ready.symbol} (${channelNote}).`);
      } catch (e) {
        say('error', `${sig.symbol}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await writeServer('emails', counter);
    await writeServer('signals', [...signals, ...previous].slice(0, 200));

    // 4. put alerts and scores into the synced document so every device shows them
    if (newHistory.length || newScores.length) {
      const latest = (await readState()) ?? state;
      await writeState({
        ...latest.data,
        history: [...newHistory, ...(latest.data.history ?? [])],
        scoreLog: [...newScores, ...(latest.data.scoreLog ?? [])].slice(0, 1000),
      });
    }
    await writeServer('lastRun', new Date().toISOString());
    return { ran: true, headlines: fresh.length, signals: signals.length, emailed, pushed };
  } catch (e) {
    say('error', `Background check failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ran: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    await appendServerLog(log).catch(() => undefined);
  }
}
