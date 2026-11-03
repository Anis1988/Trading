import type { Market } from './insightTypes';

/**
 * 🎚️ How careful the app is before it says BUY. One setting (Settings → How careful), synced to every device and used
 * everywhere the same way: stock tiles, Ideas, the AI review and the background check (phone notifications).
 * Two choices (owner's choice, Nov 2026):
 * - 🔄 Auto: the rules tuned from the owner's graded history (AUTO_RULES), stricter when the whole market falls (AUTO_DOWN).
 * - 🎛️ Custom: every rule on/off with its number, starting from Auto's.
 * Careful / Balanced / Risky stay as internal presets (options helper, AI strictness lines) and old saved levels read as
 * Auto. ⚖️ Balanced = the original rules, unchanged. A few rules are locked at every level (see LOCKED).
 */
export type Preset = 'careful' | 'balanced' | 'risky';
export type Level = Preset | 'custom' | 'auto';

export interface Rules {
  buyScore: 3 | 4 | 5; // trend points (of 5) needed for a BUY; 3 also needs the price above its 50-day average
  stretchedOn: boolean; // "rising too fast" WAIT
  stretchedRsi: number; // ...above this RSI
  halfZone: boolean; // RSI between 70 and stretchedRsi: "Buy half now" instead of WAIT
  earningsOn: boolean;
  earningsDays: number; // WAIT this many days before earnings
  marketOn: boolean;
  marketMode: 'all' | 'beat' | 'falling'; // falling market: WAIT on every buy / unless the stock beats the market / only if the stock falls too
  weakOn: boolean; // weak company finances: WAIT (off = a warning note)
  redditBadOn: boolean;
  hypeOn: boolean;
  hypeJump: number; // Reddit hype WAIT after a jump of this % this month
  ai: Preset; // how strict the AI reviewer is
  sizePct: number; // % of the normal number of shares
  minIdea: number; // Ideas: lowest 0-100 idea score shown as a BUY
}

export const PRESETS: Record<Preset, Rules> = {
  careful: { buyScore: 5, stretchedOn: true, stretchedRsi: 65, halfZone: false, earningsOn: true, earningsDays: 7, marketOn: true, marketMode: 'all', weakOn: true, redditBadOn: true, hypeOn: true, hypeJump: 10, ai: 'careful', sizePct: 120, minIdea: 65 },
  // The rules the app always had.
  balanced: { buyScore: 4, stretchedOn: true, stretchedRsi: 70, halfZone: false, earningsOn: true, earningsDays: 5, marketOn: true, marketMode: 'beat', weakOn: true, redditBadOn: true, hypeOn: true, hypeJump: 15, ai: 'balanced', sizePct: 100, minIdea: 60 },
  risky: { buyScore: 3, stretchedOn: true, stretchedRsi: 78, halfZone: true, earningsOn: true, earningsDays: 2, marketOn: true, marketMode: 'falling', weakOn: false, redditBadOn: true, hypeOn: true, hypeJump: 25, ai: 'risky', sizePct: 60, minIdea: 50 },
};

/**
 * 🔄 Auto, tuned from October 2026's graded calls: Balanced (the original rules, earnings WAIT 5 days) with the Reddit
 * hype WAIT at a 10% jump (it was the rule that helped most: 3 of 3 right, about 11% saved).
 */
export const AUTO_RULES: Rules = { ...PRESETS.balanced, hypeJump: 10 };
/** 🔄 Auto when the whole market falls: no new buys until it turns, only 5/5 trends, a stricter AI. */
export const AUTO_DOWN: Rules = { ...AUTO_RULES, buyScore: 5, stretchedRsi: 65, marketMode: 'all', ai: 'careful' };

/** The two levels you can pick. */
export const CHOICES: Level[] = ['auto', 'custom'];

export const LEVEL: Record<Level, { icon: string; name: string; who: string }> = {
  careful: { icon: '🛡️', name: 'Careful', who: 'Fewer, safer buys. For when you would rather miss a gain than take a loss.' },
  balanced: { icon: '⚖️', name: 'Balanced', who: 'The app’s original rules: a middle way.' },
  risky: { icon: '🚀', name: 'Risky', who: 'More buys, smaller amounts. For when you accept more misses to catch more runs.' },
  custom: { icon: '🎛️', name: 'Custom', who: 'Override any rule yourself. Starts from Auto’s rules.' },
  auto: { icon: '🔄', name: 'Auto', who: 'Rules tuned from your own history. Stricter when the whole market falls.' },
};

/** Rules that stay on at every level, even Custom. */
export const LOCKED = [
  'Never sell shares you don’t own.',
  'No buying on earnings day itself.',
  'No buying a stock in a downtrend that also has weak company finances.',
  'The app never places orders: you do.',
  'Options: only selling fully backed ones (a call needs your 100 shares, a put needs the cash).',
];

/**
 * `level`: what is picked (old Careful / Balanced / Risky read as Auto). `preset`: the internal preset closest to the rules
 * (options helper; Auto = Careful when the market falls, else Balanced). `tag`: what score entries are labelled with.
 */
export interface Resolved { level: Level; preset: Preset | 'custom'; tag: 'auto' | 'custom'; rules: Rules; down?: boolean; reason?: string }

/** The rules in use now (Auto looks at the market; missing or old settings = Auto). */
export function resolveRules(s: { strictness?: Level; customRules?: Partial<Rules> } | undefined, market?: Market | null): Resolved {
  if (s?.strictness === 'custom') return { level: 'custom', preset: 'custom', tag: 'custom', rules: { ...AUTO_RULES, ...(s?.customRules ?? {}) } };
  const t = market?.trend;
  const down = t === 'down';
  return { level: 'auto', preset: down ? 'careful' : 'balanced', tag: 'auto', rules: down ? AUTO_DOWN : AUTO_RULES, down, reason: down ? 'market falling' : t === 'up' ? 'market rising' : t === 'mixed' ? 'market mixed' : 'market unknown' };
}

/** The rules of a level a review or the background check reported (custom = the user's Custom list; old presets as saved). */
export function rulesOf(level: string | undefined, s?: { customRules?: Partial<Rules> }): Rules {
  if (level === 'custom') return { ...AUTO_RULES, ...(s?.customRules ?? {}) };
  if ((level as Preset) in PRESETS) return PRESETS[level as Preset];
  return AUTO_RULES;
}

/** "🔄 Auto · stricter (market falling)", "🔄 Auto", "🎛️ Custom". */
export function levelText(r: Resolved): string {
  if (r.level === 'custom') return `${LEVEL.custom.icon} ${LEVEL.custom.name}`;
  return `${LEVEL.auto.icon} Auto${r.down ? ' · stricter (market falling)' : ''}`;
}

/**
 * The trend part of a BUY for a stock you don't own: is the trend good enough, is it stretched, is it a half-size buy.
 * Shared by the stock tiles, Ideas and the background check.
 */
export function trendBuy(o: { score: number; price: number; sma50: number; rsi: number }, r: Rules): { ok: boolean; stretched: boolean; half: boolean } {
  const ok = r.buyScore === 3 ? o.score >= 4 || (o.score === 3 && o.price > o.sma50) : o.score >= r.buyScore;
  const stretched = ok && r.stretchedOn && o.rsi > r.stretchedRsi;
  const half = ok && !stretched && r.halfZone && o.rsi > 70;
  return { ok, stretched, half };
}

/** Shares to buy at this level (Risky buys smaller; "Buy half now" halves it again). At least 1. */
export const sizeQty = (qty: number, r: Rules, half = false) => Math.max(1, Math.floor((qty * r.sizePct) / 100 * (half ? 0.5 : 1)));

/** How many of the switchable safety rules are off (for the Custom warning). */
export function rulesOff(r: Rules): number {
  return [r.stretchedOn, r.earningsOn, r.marketOn, r.weakOn, r.redditBadOn, r.hypeOn].filter((x) => !x).length;
}
export const SWITCHABLE = 6;

/** What the AI reviewer is told about how strict to be. Balanced is the original sentence. */
export const AI_RULE: Record<Preset, string> = {
  careful: '- Use CAUTION when evidence is mixed or incomplete. When unsure, prefer REJECT. APPROVE only with strong, clear and recent evidence.',
  balanced: '- Use CAUTION when evidence is mixed or incomplete. When unsure, prefer CAUTION or REJECT over APPROVE.',
  risky: '- APPROVE when the evidence is decent and nothing clearly argues against the trade; use CAUTION for real concerns, not for small doubts. REJECT only for clear problems.',
};
