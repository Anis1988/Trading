import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Holding } from '../lib/holdings';
import { useStore } from '../store';
import { fetchTrendSeries } from '../lib/api';
import { useInsights } from '../lib/useInsights';
import { useTrends } from '../lib/useTrends';
import { analyze } from '../lib/trend';
import { buyWait, type WaitRule } from '../lib/waitRules';
import { scoreWaits, type WaitScore } from '../lib/scoreboard';
import { LEVEL, LOCKED, PRESETS, SWITCHABLE, levelText, resolveRules, rulesOff, type Level, type Preset, type Resolved, type Rules } from '../lib/strictness';
import type { InsightsResult } from '../lib/api';
import { Icon, Section, Toggle } from './ui';

/** 🎚️ The level in use, always shown on Today and Ideas ("🔄 Auto → 🛡️ Careful (market falling)"). Tap: Settings. */
export function LevelBadge({ r, onClick, example = false }: { r: Resolved; onClick?: () => void; example?: boolean }) {
  const tone = r.preset === 'careful' ? 'border-sky-300/40 bg-sky-400/10 text-sky-100' : r.preset === 'risky' ? 'border-amber-300/40 bg-amber-400/10 text-amber-100' : r.preset === 'custom' ? 'border-violet-300/40 bg-violet-400/10 text-violet-100' : 'border-white/15 bg-white/5 text-slate-200';
  return (
    <button type="button" onClick={example ? undefined : onClick} tabIndex={example ? -1 : 0} title="How careful the app is (Settings)"
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${tone} ${example ? 'cursor-default' : 'hover:brightness-125 active:scale-95'}`}>
      {levelText(r)}
    </button>
  );
}

const ORDER: Level[] = ['careful', 'balanced', 'risky', 'custom', 'auto'];
const MODE_TEXT = { all: 'on every buy', beat: 'unless the stock beats the market', falling: 'only if the stock is falling too' } as const;
const AI_TEXT: Record<Preset, string> = { careful: 'Strict: “when unsure, reject”', balanced: 'Normal: “when unsure, caution”', risky: 'Relaxed: “approve when the evidence is decent”' };

/** One line per rule: what it does at this level (the Settings summary and the Guide's tables). */
export function ruleLines(r: Rules): [string, string][] {
  return [
    ['Trend needed for a BUY', r.buyScore === 3 ? '3 of 5 points, with the price above its 50-day average' : `${r.buyScore} of 5 points`],
    ['“Rising too fast” WAIT', r.stretchedOn ? `RSI over ${r.stretchedRsi}${r.halfZone ? `; RSI 70–${r.stretchedRsi} says “Buy half now”` : ''}` : 'off'],
    ['Earnings WAIT', r.earningsOn ? `${r.earningsDays} day${r.earningsDays === 1 ? '' : 's'} before` : 'off (earnings day itself always waits 🔒)'],
    ['Falling market WAIT', r.marketOn ? MODE_TEXT[r.marketMode] : 'off (a warning instead)'],
    ['Weak company finances', r.weakOn ? 'WAIT' : 'a warning only (WAIT if the trend is weak too 🔒)'],
    ['Bad Reddit buzz WAIT', r.redditBadOn ? 'on' : 'off'],
    ['Reddit hype WAIT', r.hypeOn ? `after a ${r.hypeJump}% jump this month` : 'off'],
    ['AI reviewer', AI_TEXT[r.ai]],
    ['Shares to buy', `${r.sizePct}% of the normal amount`],
  ];
}

/** BUY or not for each stock, with these rules: stocks you own (add more) and your watchlist (new buys). */
function buysWith(rules: Rules, symbols: string[], series: Record<string, { closes: number[] }>, holdings: Holding[], ins: InsightsResult | null): Set<string> {
  const out = new Set<string>();
  for (const sym of symbols) {
    const own = holdings.find((h) => h.symbol === sym);
    const a = series[sym] ? analyze(sym, series[sym].closes, own, rules) : null;
    if (!a) continue;
    const good = own ? a.action === 'BUY' : a.ideaKind === 'buy';
    if (good && !buyWait({ info: ins?.stocks?.[sym], market: ins?.market, ret1m: a.ret1m, rsi: a.rsi, score: a.score }, rules)) out.add(sym);
  }
  return out;
}

/** "What would change": BUYs gained and lost among your stocks and watchlist if you switch level. */
export function PreviewBox({ more, fewer, total, example = false, onApply, onCancel, name }: { more: string[]; fewer: string[]; total: number; example?: boolean; onApply?: () => void; onCancel?: () => void; name: string }) {
  return (
    <div className="panel space-y-2 !border-cyan-300/30 text-sm">
      <p className="label">What would change with {name}</p>
      {!more.length && !fewer.length ? <p className="text-slate-300">Today, nothing would change among your {total} stocks (it may later, as prices move).</p> : (
        <ul className="space-y-1">
          {more.length > 0 && <li>🟢 <b className="num">{more.length}</b> more BUY{more.length > 1 ? 's' : ''}: <span className="font-display">{more.join(', ')}</span></li>}
          {fewer.length > 0 && <li>🟡 <b className="num">{fewer.length}</b> BUY{fewer.length > 1 ? 's' : ''} turn into WAIT: <span className="font-display">{fewer.join(', ')}</span></li>}
        </ul>
      )}
      <p className="text-xs text-slate-500">Among your {total} stocks and watchlist, with today’s prices.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" tabIndex={example ? -1 : 0} onClick={example ? undefined : onApply}>Use {name}</button>
        <button className="btn" tabIndex={example ? -1 : 0} onClick={example ? undefined : onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** One Custom rule row: name, plain line, its "was waiting worth it?" score, the toggle and its number. */
export function RuleRow({ name, hint, on, onToggle, score, children, locked = false, example = false }: { name: string; hint: string; on?: boolean; onToggle?: (v: boolean) => void; score?: WaitScore; children?: ReactNode; locked?: boolean; example?: boolean }) {
  const pct = score && score.scored ? Math.round((score.right / score.scored) * 100) : null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/5 py-2.5 first:border-0 ${locked ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1 basis-52">
        <p className="text-sm text-slate-200">{locked ? '🔒 ' : ''}{name}</p>
        <p className="text-xs text-slate-500">{hint}</p>
        {score && (
          <p className={`mt-0.5 text-[11px] ${pct === null ? 'text-slate-500' : score.scored < 5 ? 'text-slate-400' : pct >= 50 ? 'text-emerald-300' : 'text-red-300'}`}>
            {pct === null ? `No scored WAITs yet${score.waiting ? ` (${score.waiting} too recent)` : ''}` : `Waiting was right ${score.right} of ${score.scored} times (${pct}%)${score.scored < 5 ? ': too few to judge' : pct >= 50 ? ': it helps you' : ': it holds you back'}`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onToggle !== undefined && on !== undefined && <span className={example ? 'pointer-events-none' : ''}><Toggle on={on} onChange={onToggle} label={name} disabled={locked} /></span>}
      </div>
    </div>
  );
}

const num = 'input w-20 !py-1.5 text-center';

/** ⚙️ Settings → 🎚️ How careful should the app be? */
export function StrictnessSection() {
  const { settings: s, update, watchlist, scoreLog, toast } = useStore();
  const current = s.strictness ?? 'balanced';
  const symbols = useMemo(() => [...new Set([...s.holdings.map((h) => h.symbol), ...watchlist])].slice(0, 25), [s.holdings, watchlist]);
  const ins = useInsights(symbols);
  const now = resolveRules(s, ins?.market);
  const { series } = useTrends(symbols, s);
  const [pick, setPick] = useState<Level | null>(null);
  // Custom starts from the rules in use now (so nothing jumps) until you change it.
  const custom: Rules = { ...(s.customRules ? PRESETS.balanced : now.rules), ...(s.customRules ?? {}) };

  // Per-rule "was waiting worth it?" (the scoreboard's numbers), loaded when the Custom list is shown.
  const [scoreSeries, setScoreSeries] = useState<Record<string, { dates: string[]; closes: number[] }>>({});
  const showCustom = current === 'custom' || pick === 'custom';
  useEffect(() => {
    if (!showCustom) return;
    const syms = [...new Set(scoreLog.filter((e) => e.verdict === 'CAUTION').slice(0, 300).map((e) => e.symbol))].slice(0, 40);
    if (syms.length) fetchTrendSeries(syms).then((r) => setScoreSeries(r.series)).catch(() => undefined);
  }, [showCustom, scoreLog.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const scores = useMemo(() => Object.fromEntries(scoreWaits(scoreLog, scoreSeries).map((w) => [w.why, w])), [scoreLog, scoreSeries]);
  const sc = (k: WaitRule | 'ai'): WaitScore => scores[k] ?? { why: k, scored: 0, right: 0, ifBought: 0, waiting: 0 };

  const preview = useMemo(() => {
    if (!pick || pick === current) return null;
    const next = resolveRules({ strictness: pick, customRules: s.customRules ?? now.rules }, ins?.market);
    const a = buysWith(now.rules, symbols, series, s.holdings, ins);
    const b = buysWith(next.rules, symbols, series, s.holdings, ins);
    return { more: [...b].filter((x) => !a.has(x)), fewer: [...a].filter((x) => !b.has(x)), name: levelText(next) };
  }, [pick, current, series, ins, symbols.join(','), JSON.stringify(s.customRules)]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (lv: Level) => {
    // Custom starts from the rules in use now, so nothing jumps.
    update({ strictness: lv, ...(lv === 'custom' && !s.customRules ? { customRules: { ...now.rules } } : {}) });
    setPick(null);
    toast('success', `${LEVEL[lv].icon} ${LEVEL[lv].name} is on, on all your devices.`);
  };
  const setRule = (p: Partial<Rules>) => update({ customRules: { ...custom, ...p } });
  const off = rulesOff(custom);

  return (
    <Section title="How careful should the app be?" subtitle={`${levelText(now)} · tap to change`} icon={Icon.shield}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">How many safety rules a BUY must pass. It changes the stock tiles, Ideas, the AI review and the background alerts, on all your devices.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="How careful">
          {ORDER.map((lv) => {
            const on = current === lv;
            const sel = pick === lv;
            return (
              <button key={lv} type="button" role="radio" aria-checked={on} onClick={() => (on ? setPick(null) : setPick(lv))}
                className={`rounded-xl border p-2.5 text-left transition active:scale-[0.98] ${on ? 'border-cyan-300/60 bg-cyan-400/15' : sel ? 'border-violet-300/60 bg-violet-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'} ${lv === 'auto' ? 'col-span-2 sm:col-span-1' : ''}`}>
                <span className="block font-display font-semibold">{LEVEL[lv].icon} {LEVEL[lv].name}{on && <span className="ml-1 text-[10px] font-normal uppercase tracking-wider text-cyan-200">· on</span>}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{LEVEL[lv].who}</span>
              </button>
            );
          })}
        </div>

        {preview && pick && <PreviewBox {...preview} total={symbols.length} onApply={() => apply(pick)} onCancel={() => setPick(null)} />}

        <div className="panel space-y-1 text-sm">
          <p className="label">In use now: {levelText(now)}</p>
          <table className="w-full text-left text-xs">
            <tbody>
              {ruleLines(now.rules).map(([k, v]) => (
                <tr key={k} className="border-t border-white/5 first:border-0"><td className="py-1 pr-2 text-slate-400">{k}</td><td className="py-1 text-slate-200">{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {showCustom && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="label mr-auto">🎛️ Your Custom rules</p>
              {(['careful', 'balanced', 'risky'] as Preset[]).map((p) => (
                <button key={p} type="button" className="btn !px-2.5 !py-1.5 text-xs" onClick={() => (update({ customRules: { ...PRESETS[p] } }), toast('info', `Custom copied from ${LEVEL[p].name}.`))}>Copy {LEVEL[p].icon} {LEVEL[p].name}</button>
              ))}
            </div>
            {current !== 'custom' && <p className="text-xs text-amber-200">You’re editing Custom, but it isn’t in use yet: tap “Use” above to switch to it.</p>}
            {off >= 3 && <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">⚠ {off} of {SWITCHABLE} safety rules are off: you’ll see a lot more BUYs, and more of them will be wrong. That’s your call; the scoreboard will tell you how it goes.</p>}
            <div className="panel !py-1">
              <RuleRow name="Trend needed for a BUY" hint="Points out of 5 (price above its averages, up over 1 and 3 months, not overheated). 3 also needs the price above its 50-day average.">
                <select className="input !py-1.5" value={custom.buyScore} onChange={(e) => setRule({ buyScore: Number(e.target.value) as 3 | 4 | 5 })} aria-label="Trend needed">
                  <option value={5}>5 of 5</option><option value={4}>4 of 5</option><option value={3}>3 of 5</option>
                </select>
              </RuleRow>
              <RuleRow name="“Rising too fast” WAIT" hint="Waits when the RSI (how hot the price is, 0–100) is above this." on={custom.stretchedOn} onToggle={(v) => setRule({ stretchedOn: v })}>
                <input className={num} type="number" min={55} max={90} value={custom.stretchedRsi} disabled={!custom.stretchedOn} onChange={(e) => setRule({ stretchedRsi: Math.min(90, Math.max(55, Number(e.target.value) || 70)) })} aria-label="RSI limit" />
              </RuleRow>
              <RuleRow name="“Buy half now” zone" hint="Between RSI 70 and the limit above: a half-size BUY instead of a WAIT." on={custom.halfZone} onToggle={(v) => setRule({ halfZone: v })} />
              <RuleRow name="Earnings WAIT" hint="Waits this many days before the company reports earnings." on={custom.earningsOn} onToggle={(v) => setRule({ earningsOn: v })} score={sc('earnings')}>
                <input className={num} type="number" min={1} max={14} value={custom.earningsDays} disabled={!custom.earningsOn} onChange={(e) => setRule({ earningsDays: Math.min(14, Math.max(1, Math.round(Number(e.target.value) || 5))) })} aria-label="Days before earnings" />
              </RuleRow>
              <RuleRow name="Falling market WAIT" hint="When the whole market (S&P 500) is falling." on={custom.marketOn} onToggle={(v) => setRule({ marketOn: v })} score={sc('market')}>
                <select className="input !py-1.5" value={custom.marketMode} disabled={!custom.marketOn} onChange={(e) => setRule({ marketMode: e.target.value as Rules['marketMode'] })} aria-label="When">
                  <option value="all">Every buy</option><option value="beat">Unless it beats the market</option><option value="falling">Only if it falls too</option>
                </select>
              </RuleRow>
              <RuleRow name="Weak finances WAIT" hint="Shrinking sales, losses or heavy debt. Off = a warning only." on={custom.weakOn} onToggle={(v) => setRule({ weakOn: v })} score={sc('weak')} />
              <RuleRow name="Bad Reddit buzz WAIT" hint="Sudden talk on Reddit for a bad reason." on={custom.redditBadOn} onToggle={(v) => setRule({ redditBadOn: v })} score={sc('reddit-bad')} />
              <RuleRow name="Reddit hype WAIT" hint="Sudden crowd hype after a jump this big this month (%)." on={custom.hypeOn} onToggle={(v) => setRule({ hypeOn: v })} score={sc('reddit-hype')}>
                <input className={num} type="number" min={5} max={50} value={custom.hypeJump} disabled={!custom.hypeOn} onChange={(e) => setRule({ hypeJump: Math.min(50, Math.max(5, Number(e.target.value) || 15)) })} aria-label="Jump %" />
              </RuleRow>
              <RuleRow name="AI reviewer" hint="How strict the AI second opinion is." score={sc('ai')}>
                <select className="input !py-1.5" value={custom.ai} onChange={(e) => setRule({ ai: e.target.value as Preset })} aria-label="AI reviewer">
                  <option value="careful">Strict</option><option value="balanced">Normal</option><option value="risky">Relaxed</option>
                </select>
              </RuleRow>
              <RuleRow name="Shares to buy (%)" hint="Of the normal amount for your risk limit. Smaller when you loosen the rules is wiser.">
                <input className={num} type="number" min={25} max={200} step={5} value={custom.sizePct} onChange={(e) => setRule({ sizePct: Math.min(200, Math.max(25, Number(e.target.value) || 100)) })} aria-label="Shares %" />
              </RuleRow>
              <RuleRow name="Ideas: lowest score shown" hint="Ideas only lists stocks scoring at least this (0–100)." >
                <input className={num} type="number" min={30} max={90} value={custom.minIdea} onChange={(e) => setRule({ minIdea: Math.min(90, Math.max(30, Number(e.target.value) || 60)) })} aria-label="Lowest idea score" />
              </RuleRow>
            </div>
          </div>
        )}

        <div className="panel space-y-1 text-xs">
          <p className="label">Always on, at every level</p>
          <ul className="space-y-0.5 text-slate-400">{LOCKED.map((x) => <li key={x}>🔒 {x}</li>)}</ul>
        </div>
      </div>
    </Section>
  );
}
