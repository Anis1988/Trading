import type { Holding } from './holdings';

/**
 * 📥 Fidelity's positions file (fidelity.com → Accounts & Trade → Portfolio → Positions → Download, a .csv), read on the
 * device: nothing is uploaded. Stocks and funds become holdings (shares + average price paid), money-market funds
 * (SPAXX, FDRXX…, the "core" cash) become cash; options, bonds, pending activity and the notes at the bottom are skipped.
 */
export interface FidPosition { account: string; symbol: string; shares: number; avgCost: number | null; value: number }
export interface FidFile { accounts: string[]; positions: FidPosition[]; cash: Record<string, number>; skipped: string[] }

/** One CSV line -> cells (quotes, commas inside quotes, doubled quotes). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** "$1,234.56", "+$12.00", "-1,000", "--", "n/a" -> number or null. */
const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const t = v.replace(/[$,%+\s]/g, '');
  if (!t || t === '--' || /^n\/?a$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const CASH_WORDS = /money market|core position|cash|held in money market|fdic|sweep/i;
// Only for rows without a share count: funds like "Pacer US Cash Cows" or "Free Cash Flow" ETFs are real holdings.

export function parseFidelity(text: string): FidFile {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const h = lines.findIndex((l) => /symbol/i.test(l) && /quantity/i.test(l));
  if (h < 0) throw new Error('This doesn’t look like a Fidelity positions file (no “Symbol” and “Quantity” columns). In Fidelity: Accounts & Trade → Portfolio → Positions → Download.');
  const head = cells(lines[h]).map((x) => x.toLowerCase());
  const col = (...names: string[]) => head.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
  const iAcc = col('account name'), iAccNo = col('account number'), iSym = col('symbol'), iDesc = col('description'), iQty = col('quantity');
  const iAvg = col('average cost basis', 'avg cost basis', 'cost basis per share'), iTot = col('cost basis total', 'cost basis'), iVal = col('current value'), iType = col('type');
  const out: FidFile = { accounts: [], positions: [], cash: {}, skipped: [] };
  for (const line of lines.slice(h + 1)) {
    if (!line.trim()) continue;
    const c = cells(line);
    // The notes at the bottom ("The data and information in this spreadsheet…") have one long cell.
    if (c.length < Math.min(4, head.length)) continue;
    const account = (c[iAcc] || c[iAccNo] || 'Account').replace(/\s+/g, ' ').trim();
    const rawSym = (c[iSym] ?? '').trim();
    const desc = c[iDesc] ?? '';
    const value = num(c[iVal]) ?? 0;
    if (!rawSym || /pending activity/i.test(rawSym) || /pending activity/i.test(desc)) continue;
    if (!out.accounts.includes(account)) out.accounts.push(account);
    const sym = rawSym.replace(/\*+$/, '').toUpperCase();
    const qty = num(c[iQty]);
    // Money-market / core cash: "SPAXX**", or a cash description with no share count.
    if (/\*\*$/.test(rawSym) || (qty === null && CASH_WORDS.test(`${desc} ${c[iType] ?? ''}`) && value > 0)) {
      out.cash[account] = (out.cash[account] ?? 0) + value;
      continue;
    }
    // Options (" -AAPL261219C150"), bonds / CDs (9-character CUSIPs with digits) and anything without shares: skipped.
    if (!/^[A-Z][A-Z.\-]{0,7}$/.test(sym) || /\d/.test(sym) || qty === null || qty <= 0) {
      out.skipped.push(`${rawSym}${desc ? ` (${desc.slice(0, 40)})` : ''}`);
      continue;
    }
    const avg = num(c[iAvg]);
    const tot = num(c[iTot]);
    out.positions.push({ account, symbol: sym, shares: qty, avgCost: avg ?? (tot !== null ? tot / qty : null), value });
  }
  if (!out.positions.length && !Object.keys(out.cash).length) throw new Error('No stocks or cash were found in this file. Is it the Positions download from Fidelity?');
  return out;
}

/** The chosen accounts combined: the same stock in two accounts = one holding with the right average price. */
export function combine(f: FidFile, accounts: string[]): { holdings: { symbol: string; shares: number; avgCost: number | null }[]; cash: number } {
  const map = new Map<string, { shares: number; cost: number; known: boolean }>();
  for (const p of f.positions.filter((x) => accounts.includes(x.account))) {
    const cur = map.get(p.symbol) ?? { shares: 0, cost: 0, known: true };
    cur.shares += p.shares;
    if (p.avgCost === null) cur.known = false; else cur.cost += p.avgCost * p.shares;
    map.set(p.symbol, cur);
  }
  const holdings = [...map.entries()].map(([symbol, v]) => ({
    symbol, shares: Math.round(v.shares * 10000) / 10000, avgCost: v.known && v.shares > 0 ? Math.round((v.cost / v.shares) * 100) / 100 : null,
  })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const cash = Math.round(accounts.reduce((t, a) => t + (f.cash[a] ?? 0), 0) * 100) / 100;
  return { holdings, cash };
}

export type ChangeKind = 'new' | 'changed' | 'missing' | 'same';
export interface Change { kind: ChangeKind; symbol: string; before?: Holding; after?: Holding }

/** What importing would do to the holdings in the app (dates you entered are kept). */
export function diffHoldings(current: Holding[], incoming: { symbol: string; shares: number; avgCost: number | null }[]): Change[] {
  const out: Change[] = [];
  for (const n of incoming) {
    const before = current.find((h) => h.symbol === n.symbol);
    // Unknown cost in the file: keep the price already in the app (or 0 for a new one, to fill in).
    const after: Holding = { symbol: n.symbol, shares: n.shares, avgCost: n.avgCost ?? before?.avgCost ?? 0, ...(before?.boughtAt ? { boughtAt: before.boughtAt } : {}) };
    if (!before) out.push({ kind: 'new', symbol: n.symbol, after });
    else if (Math.abs(before.shares - after.shares) > 1e-6 || Math.abs(before.avgCost - after.avgCost) >= 0.01) out.push({ kind: 'changed', symbol: n.symbol, before, after });
    else out.push({ kind: 'same', symbol: n.symbol, before, after });
  }
  for (const h of current) if (!incoming.some((n) => n.symbol === h.symbol)) out.push({ kind: 'missing', symbol: h.symbol, before: h });
  const rank = { new: 0, changed: 1, missing: 2, same: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.symbol.localeCompare(b.symbol));
}

/** Apply the ticked changes. Missing ones are removed only when ticked. */
export function applyChanges(current: Holding[], changes: Change[], ticked: Set<string>): Holding[] {
  let next = [...current];
  for (const c of changes) {
    if (!ticked.has(c.symbol) || c.kind === 'same') continue;
    if (c.kind === 'missing') next = next.filter((h) => h.symbol !== c.symbol);
    // Changed ones keep their place in your list; new ones go at the end.
    else if (next.some((h) => h.symbol === c.symbol)) next = next.map((h) => (h.symbol === c.symbol ? c.after! : h));
    else next = [...next, c.after!];
  }
  return next;
}
