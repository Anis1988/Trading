/**
 * 💵 Dividend calendar (Today): the next ex-dividend and pay dates and amounts for what you own, and an estimate of your
 * yearly dividend income (shares × yearly dividend per share). Data: Nasdaq's free dividend history (declared dates),
 * else Yahoo Finance's past payments (dates then estimated from the usual rhythm). Fetched by netlify/functions/dividends.ts,
 * cached 12 hours. Shared by the server (parsing) and the app (display). Free, no AI.
 */
export interface DivEvent {
  exDate: string; // YYYY-MM-DD: own the shares before this day to get the payment
  payDate?: string; // YYYY-MM-DD: the day the cash arrives
  amount: number; // $ per share
  estimated?: boolean; // guessed from past payments, not announced yet
}

export interface DivInfo {
  symbol: string;
  pays: boolean;
  annual: number; // $ per share per year
  yieldPct?: number;
  perYear?: number; // payments per year (4 = every 3 months)
  next?: DivEvent;
  last?: DivEvent;
  source: 'Nasdaq' | 'Yahoo Finance';
}

const DAY = 86400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** "09/15/2026" → "2026-09-15" (Nasdaq's format); anything else → undefined. */
export function usDate(s: unknown): string | undefined {
  const m = String(s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}
const money = (s: unknown): number => {
  const n = Number(String(s ?? '').replace(/[$,\s]/g, ''));
  return isFinite(n) && n > 0 ? n : 0;
};

/** Payments per year from the gaps between past ex-dates (1, 2, 4 or 12). */
function rhythm(past: DivEvent[]): { perYear: number; gap: number } | null {
  if (past.length < 2) return null;
  const gaps = past.slice(1).map((e, i) => (Date.parse(e.exDate) - Date.parse(past[i].exDate)) / DAY).filter((g) => g > 20).sort((a, b) => a - b);
  if (!gaps.length) return null;
  const g = gaps[Math.floor(gaps.length / 2)];
  const perYear = g < 45 ? 12 : g < 135 ? 4 : g < 270 ? 2 : 1;
  return { perYear, gap: 365 / perYear };
}

/**
 * Builds the info from a list of payments (any order). Announced future ones win; otherwise the next one is estimated
 * from the usual rhythm and the last amount. `annual`: the announced yearly rate if given, else the last 12 months.
 */
export function buildInfo(symbol: string, events: DivEvent[], source: DivInfo['source'], o: { annual?: number; yieldPct?: number; now?: Date } = {}): DivInfo {
  const today = iso((o.now ?? new Date()).getTime());
  const all = events.filter((e) => e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.exDate)).sort((a, b) => a.exDate.localeCompare(b.exDate));
  const past = all.filter((e) => e.exDate < today);
  const last = past[past.length - 1];
  const yearAgo = iso(Date.parse(today) - 365 * DAY);
  const recent = past.filter((e) => e.exDate >= yearAgo);
  const rh = rhythm(all.filter((e) => e.exDate >= iso(Date.parse(today) - 3 * 365 * DAY)));
  // Announced and still to come: the ex-date is ahead, or the cash hasn't arrived yet.
  let next = all.find((e) => e.exDate >= today || (!!e.payDate && e.payDate >= today));
  // Stopped paying? Nothing announced and nothing in a year and a half → treat as no dividend.
  const stale = !next && (!last || last.exDate < iso(Date.parse(today) - 548 * DAY));
  if (!next && !stale && rh && last) {
    let t = Date.parse(last.exDate) + rh.gap * DAY;
    while (iso(t) < today) t += rh.gap * DAY;
    next = { exDate: iso(t), amount: last.amount, estimated: true };
  }
  const base = last ?? next;
  const annual = o.annual && o.annual > 0 ? o.annual : rh && base && recent.length < rh.perYear ? base.amount * rh.perYear : recent.reduce((s, e) => s + e.amount, 0) || (base && !rh ? base.amount : 0);
  const pays = !stale && annual > 0;
  return {
    symbol, pays, annual: pays ? r4(annual) : 0, yieldPct: pays ? o.yieldPct : undefined, perYear: pays ? rh?.perYear : undefined,
    next: pays ? next : undefined, last, source,
  };
}

/** Nasdaq's /api/quote/SYM/dividends answer → info (null when it has nothing). */
export function fromNasdaq(symbol: string, j: unknown, now?: Date): DivInfo | null {
  const d = (j as { data?: Record<string, unknown> } | null)?.data;
  if (!d) return null;
  const rows = ((d.dividends as { rows?: Record<string, unknown>[] } | undefined)?.rows ?? []);
  const events: DivEvent[] = rows.flatMap((r) => {
    const ex = usDate(r.exOrEffDate);
    const amount = money(r.amount);
    return ex && amount && String(r.type ?? 'Cash').toLowerCase().includes('cash') ? [{ exDate: ex, payDate: usDate(r.paymentDate), amount }] : [];
  });
  if (!events.length) return null;
  const y = Number(String(d.yield ?? '').replace('%', ''));
  return buildInfo(symbol, events, 'Nasdaq', { annual: money(d.annualizedDividend), yieldPct: isFinite(y) && y > 0 ? y : undefined, now });
}

/** Yahoo's chart answer with `events=div` → info (past ex-dates and amounts only; the next one is estimated). */
export function fromYahoo(symbol: string, j: unknown, now?: Date): DivInfo | null {
  const r = (j as { chart?: { result?: { events?: { dividends?: Record<string, { amount?: number; date?: number }> } }[] } } | null)?.chart?.result?.[0];
  if (!r) return null;
  const events: DivEvent[] = Object.values(r.events?.dividends ?? {}).flatMap((e) => (typeof e.amount === 'number' && typeof e.date === 'number' ? [{ exDate: iso(e.date * 1000), amount: e.amount }] : []));
  return buildInfo(symbol, events, 'Yahoo Finance', { now });
}

/** Your yearly dividend income: shares × yearly dividend per share, for each stock that pays. */
export function yearlyIncome(holdings: { symbol: string; shares: number }[], info: Record<string, DivInfo>): number {
  return holdings.reduce((s, h) => s + (info[h.symbol]?.pays ? h.shares * info[h.symbol].annual : 0), 0);
}

/** The next payment date to sort by (pay date if the ex-date passed, else the ex-date). */
export const nextDay = (i: DivInfo) => (i.next ? (i.next.exDate >= iso(Date.now()) ? i.next.exDate : i.next.payDate ?? i.next.exDate) : '9999');

export const OFTEN: Record<number, string> = { 12: 'every month', 4: 'every 3 months', 2: 'twice a year', 1: 'once a year' };
