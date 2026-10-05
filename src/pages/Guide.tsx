import type { ReactNode } from 'react';
import { ActionChip, Change, Section, Sparkline, Stat, Icon } from '../components/ui';
import { EarningsBadge, InsightLines, MarketCard } from '../components/Insight';
import { BuzzBadge, RedditPanel } from '../components/Buzz';
import type { Buzz } from '../lib/insightTypes';
import { TermCard } from './Words';
import { taxText } from '../lib/holdings';
import { fmtMoney } from '../components/ui';

/* ------- made-up example data, only for pictures in this guide ------- */
const wave = (start: number, drift: number, n = 60) => Array.from({ length: n }, (_, i) => Math.round((start + drift * i + Math.sin(i / 3) * start * 0.02) * 100) / 100);
const UP = wave(180, 0.6);
const DOWN = wave(520, -0.9);
const BUZZ_GOOD: Buzz = { mentions: 1284, ratio: 3.1, rank: 2, rankBefore: 9, trending: true, mood: 'positive', pos: 68, neu: 20, neg: 12, why: 'Guidance looks strong, data-center orders still climbing', posts: [
  { title: 'Guidance looks strong, data-center orders still climbing', sub: 'r/stocks', ups: 2400, comments: 611, ageH: 3, url: '#1', tone: '+' },
  { title: 'Is it overvalued at this point? Long-term holders, your plan?', sub: 'r/investing', ups: 940, comments: 388, ageH: 9, url: '#2', tone: '0' },
] };
const BUZZ_BAD: Buzz = { mentions: 2410, ratio: 4.5, rank: 3, rankBefore: 40, trending: true, mood: 'negative', pos: 10, neu: 18, neg: 72, why: 'Deliveries halted after new inspection findings', posts: [] };
const BUZZ_NEWS: Buzz = { mentions: 2410, ratio: 4.5, rank: 3, rankBefore: 40, trending: true, mood: 'negative', moodFrom: 'news', pos: 0, neu: 25, neg: 75, why: 'Maker halts deliveries after safety probe, shares plunge', posts: [
  { title: 'Maker halts deliveries after safety probe, shares plunge', sub: 'Yahoo Finance', ups: 0, comments: 0, ageH: 2, url: '#3', tone: '-' },
  { title: 'Airline customers weigh delays as inspections widen', sub: 'Google News', ups: 0, comments: 0, ageH: 6, url: '#4', tone: '-' },
  { title: 'What the delivery pause means for the quarter', sub: 'Google News', ups: 0, comments: 0, ageH: 11, url: '#5', tone: '0' },
] };
const BUZZ_MIXED: Buzz = { mentions: 830, ratio: 2.2, rank: 6, rankBefore: 11, trending: true, mood: 'mixed', pos: 41, neu: 22, neg: 37, posts: [] };

function Example({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="space-y-2">
      <div className="relative rounded-2xl border border-dashed border-cyan-300/30 bg-black/20 p-3 pt-6">
        <span className="absolute left-3 top-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">Example</span>
        {children}
      </div>
      {caption && <figcaption className="text-xs text-slate-400">{caption}</figcaption>}
    </figure>
  );
}

const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-relaxed text-slate-300">{children}</p>;
const Steps = ({ items }: { items: ReactNode[] }) => (
  <ol className="space-y-2">
    {items.map((x, i) => (
      <li key={i} className="flex gap-3 text-[15px] text-slate-300">
        <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/30 to-violet-500/30 text-xs font-bold text-cyan-100">{i + 1}</span>
        <span>{x}</span>
      </li>
    ))}
  </ol>
);
const Tip = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-50">💡 {children}</p>
);
const Warn = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">⚠ {children}</p>
);

/** Plain-language manual with live examples built from the same pieces the app uses. */
export function Guide() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Guide</h2>
        <p className="text-sm text-slate-400">Everything in this app, in plain words. Tap a topic to open it. The examples use made-up numbers.</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <div className="space-y-3">
          <Section title="How the app works" subtitle="From news to your Fidelity order" icon={Icon.guide} defaultOpen>
            <Steps
              items={[
                'Every few minutes the app reads the news about the stocks you own (and any you are watching).',
                'If the news is clearly good or bad, it creates a signal: a suggestion to BUY or SELL. Every hour it also checks the price trend of what you own: if one has been sliding for weeks, it creates a SELL signal even when the news is quiet.',
                'Free safety rules check it first: you cannot sell what you do not own, no buying right before earnings, no buying while the whole market is falling, no buying into Reddit hype or bad-news buzz, no buying a company with weak finances.',
                'If it passes, Claude (the AI) reads the news, the price and your holdings, and gives its opinion in simple words.',
                'You see the result on Today. You decide. You can email yourself the instruction or copy it.',
                'You place the order yourself in Fidelity. The app never trades for you.',
                'In History, mark the instruction as Executed with the order number and price, so the app keeps an honest record.',
              ]}
            />
            <Warn>This app is not a broker and not financial advice. Every decision and every order is yours.</Warn>
          </Section>

          <Section title="The 5 words" subtitle="BUY · SELL · HOLD · WAIT · SKIP" icon={Icon.today}>
            <P>The app only ever uses these five words, each always with the same colour and symbol.</P>
            <div className="space-y-2.5">
              {(
                [
                  ['BUY', 'Good time to buy (or add more). Green, arrow up.'],
                  ['SELL', 'Good time to sell some or all. Red, arrow down.'],
                  ['HOLD', 'You own it and nothing needs to change. Keep it.'],
                  ['WAIT', 'Maybe, but not now: unclear news, earnings soon, or a falling market.'],
                  ['SKIP', 'Do not do it. The AI or a safety rule said no; emailing is blocked.'],
                ] as const
              ).map(([a, t]) => (
                <div key={a} className="flex items-center gap-3">
                  <span className="w-20 shrink-0"><ActionChip action={a} /></span>
                  <span className="text-sm text-slate-300">{t}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="What the AI looks at" subtitle="Everything it gets before it answers" icon={Icon.ideas}>
            <P>When a signal passes the free safety rules, Claude gets all of this and answers in plain words:</P>
            <ul className="grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
              {[
                ['📰', 'The headlines about the stock (titles, up to 15)'],
                ['💲', 'Today\'s price and the last few days'],
                ['📈', 'The 6-month trend: 1 and 3-month change, 50-day average, overheated or not'],
                ['🌎', 'Whether the whole market is rising or falling'],
                ['🗓', 'Upcoming earnings date'],
                ['👥', 'What analysts say, P/E, dividend, 52-week range'],
                ['💬', 'What Reddit is saying: only how much talk and whether it is good or bad (never the posts themselves)'],
                ['💼', 'What you own: shares, price paid, gain or loss, and how long you have held it (for taxes)'],
                ['🏢', 'Company health: sales and profit growth, profit margin, debt'],
                ['👔', 'Whether company insiders bought or sold their own stock lately'],
                ['💵', 'Your cash ready to invest and how long you plan to stay invested'],
                ['🥧', 'How big a share of your money this stock would become'],
                ['🛡', 'Your stop-loss and your risk limit per trade'],
              ].map(([i, t]) => (
                <li key={t} className="flex gap-2"><span aria-hidden="true">{i}</span><span>{t}</span></li>
              ))}
            </ul>
            <Tip>It reads headline titles, not full articles, so a misleading headline can still fool it. That is why you always decide.</Tip>
          </Section>

          <Section title="Reading a signal card" subtitle="The cards under Action needed" icon={Icon.today}>
            <Example caption="Read it from top to bottom: the word, one sentence why, then the money numbers, then the buttons.">
              <article className="card relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-400">
                <div className="flex flex-wrap items-center gap-2">
                  <ActionChip action="BUY" size="lg" />
                  <span className="font-display text-xl font-semibold">COST</span>
                  <span className="num text-sm text-slate-400">× 5</span>
                </div>
                <p className="mt-2 text-[15px] text-slate-200">Strong sales report and a steady price climb. Not overheated.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat label="Buy near" value="$900.00" />
                  <Stat label="Stop-loss −4%" value="$864.00" tone="down" />
                  <Stat label="Max loss" value="−$180.00" tone="down" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="btn-primary pointer-events-none">Email me</span>
                  <span className="btn pointer-events-none">Copy</span>
                  <span className="btn pointer-events-none">Re-check</span>
                  <span className="btn pointer-events-none">Dismiss</span>
                </div>
              </article>
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Buy near</b>: the price when it was checked.</li>
              <li><b>Stop-loss</b>: if the price falls to this, sell to limit the damage. You set this order yourself in Fidelity.</li>
              <li><b>Max loss</b>: about how much you lose if the stop-loss is hit.</li>
              <li><b>Email me</b> sends the instruction to your inbox. <b>Copy</b> puts it on the clipboard. <b>Re-check</b> asks the AI again (uses a credit). <b>Dismiss</b> hides it.</li>
              <li><b>Details</b> shows the headline that caused it, the AI's warnings, the market, earnings and analysts.</li>
              <li>A <span className="rounded-md bg-violet-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-violet-200">trend</span> tag means it came from the hourly price-trend check, not from news.</li>
            </ul>
            <Tip>A "Use 7" link means: buying 7 shares keeps your possible loss within your risk limit (Settings → Risk).</Tip>
          </Section>

          <Section title="The Today screen" subtitle="Your money, what to do, your stocks" icon={Icon.wallet}>
            <Example caption="Total profit / loss: what your stocks are worth now compared with what you paid.">
              <div>
                <p className="label">Total profit / loss</p>
                <p className="num mt-1 text-4xl font-semibold text-emerald-300 glow-up">+$1,240</p>
                <p className="text-sm"><Change pct={12.4} /> <span className="muted">on what you paid</span> · <span className="muted">Today </span><Change value={-35.2} pct={-0.4} /></p>
                <div className="mt-2"><Sparkline values={UP} height={60} label="Example portfolio value" /></div>
              </div>
            </Example>
            <Example caption="One tile per stock you own: the advice word, the price, and your gain or loss. Tap it for a chart, earnings and analyst info.">
              <div className="card !p-4">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl font-semibold">AAPL</span>
                  <ActionChip action="HOLD" size="sm" />
                  <EarningsBadge e={{ date: '2026-10-30', inDays: 9 }} />
                  <span className="num ml-auto text-lg">$233.48</span>
                </div>
                <div className="mt-1 flex justify-between text-sm"><span className="muted num">2 sh · paid $173.15</span><Change value={120.66} pct={34.8} /></div>
                <p className="mt-2 text-sm text-slate-300">No clear reason to act. Keep holding.</p>
              </div>
            </Example>
            <P>A tile only says <ActionChip action="BUY" size="sm" /> if nothing says "not now". It switches to <ActionChip action="WAIT" size="sm" /> and tells you why when: earnings are within 5 days, the whole market is falling, Reddit is buzzing for a bad reason (or with hype after a big jump), or the company's finances are weak. These are the same free checks the alerts use. Buying gets the extra caution on purpose: a missed buy costs nothing, a bad one costs money.</P>
            <P><b>Where your money is</b> shows how your money is split. <b>News on your stocks</b> lists the latest headlines. <b>Background alerts</b> shows the last server check and how many AI checks you used today.</P>
          </Section>

          <Section title="Ideas: what to buy" subtitle="Scanning about 70 big stocks and funds" icon={Icon.ideas}>
            <P>The app looks at about 70 large US stocks and funds, gives each a score out of 100, and shows only the healthy ones that are not overheated.</P>
            <Example caption="The bar is the score. Higher = steadier climb, better news, not overheated.">
              <div className="flex items-center gap-3">
                <span className="font-display text-xl font-semibold">XLK</span>
                <ActionChip action="BUY" size="sm" />
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[79%] rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" /></div>
                <span className="num text-xs">79/100</span>
              </div>
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Price per share</b>: pick a range such as "Under $50" to see only stocks you can afford.</li>
              <li><b>Ask the AI</b>: Claude picks its best few from the list (one credit, saved for an hour).</li>
              <li><b>Check with AI &amp; send to Today</b>: turns an idea into a signal card on Today, checked against what you own.</li>
              <li><b>Shares to buy</b>: how many shares keep your possible loss within your risk limit.</li>
            </ul>
            <Warn>A high score means the stock has been doing well. It cannot promise the future; any stock can fall.</Warn>
          </Section>

          <Section title="History & Scoreboard" subtitle="Your record of every instruction" icon={Icon.history}>
            <Example caption="Tap a status on the right to change it. Executed asks for the order number and the price you paid.">
              <div className="flex gap-3">
                <div className="flex-1">
                  <b className="font-display">BUY 4 NVDA</b>
                  <p className="text-xs text-slate-500">10/4/2026 · MARKET · email</p>
                </div>
                <div className="flex w-[92px] flex-col gap-1.5">
                  <span className="flex h-8 items-center gap-1.5 rounded-lg border border-amber-300/60 bg-amber-400/20 px-2 text-[11px] font-semibold text-amber-100"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Pending</span>
                  <span className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[11px] font-semibold text-emerald-200/70"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Executed</span>
                  <span className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2 text-[11px] font-semibold text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Cancelled</span>
                </div>
              </div>
            </Example>
            <P><b>Pending</b> = not done yet. <b>Executed</b> = you placed it in Fidelity. <b>Cancelled</b> = you decided not to.</P>
            <P><b>Scoreboard</b> checks old calls: was the price higher (for a BUY) or lower (for a SELL) five trading days later? It shows the percentage that were right, split by what the AI said.</P>
            <Tip>Do not trust the scoreboard until it has 20 or more calls. If "AI said skip" does as well as "AI said go", the AI is not helping.</Tip>
          </Section>
        </div>

        <div className="space-y-3">
          <Section title="Market check" subtitle="Is the whole market going up or down?" icon={Icon.today}>
            <P>The app watches the S&amp;P 500, the 500 biggest US companies together. When the whole market falls, most single-stock buys lose money too.</P>
            <Example>
              <MarketCard m={{ trend: 'down', price: 500, ret1m: -4.2, ret3m: -6.1, closes: DOWN }} />
            </Example>
            <P><b>Rising</b>: normal. <b>Sideways</b>: no clear direction. <b>Falling</b>: every BUY becomes <ActionChip action="WAIT" size="sm" /> automatically, for free (no AI credit used).</P>
          </Section>

          <Section title="Earnings warning" subtitle="Why buying right before earnings is risky" icon={Icon.today}>
            <P>Four times a year, each company reports its results ("earnings"). On that day the price can jump or drop 5–15% in minutes, which can blow through your stop-loss.</P>
            <Example caption="Grey = earnings within 2 weeks. Amber = within 5 days.">
              <div className="flex flex-wrap gap-2">
                <EarningsBadge e={{ date: '2026-10-20', inDays: 12 }} />
                <EarningsBadge e={{ date: '2026-10-11', inDays: 3 }} />
                <EarningsBadge e={{ date: '2026-10-09', inDays: 1 }} />
              </div>
            </Example>
            <P>A BUY within 5 days of earnings becomes <ActionChip action="WAIT" size="sm" />: "wait until after". Free rule, no AI credit used.</P>
          </Section>

          <Section title="Analysts & company basics" subtitle="Analysts, P/E, dividend, 52-week range" icon={Icon.ideas}>
            <Example>
              <InsightLines i={{ analysts: { buy: 25, hold: 5, sell: 1, period: '2026-10-01' }, basics: { pe: 28.4, divYield: 0.5, low52: 150, high52: 260 } }} />
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Analysts</b>: how many Wall Street analysts say buy, hold or sell. The bar shows the mix (green / grey / red). Useful, but they are often too optimistic.</li>
              <li><b>P/E</b>: price compared with yearly profit. Around 15–25 is typical; much higher means people expect fast growth (more risk if it disappoints).</li>
              <li><b>Dividend</b>: cash the company pays you each year, as a % of the price.</li>
              <li><b>52-week</b>: the lowest and highest price in the last year.</li>
            </ul>
          </Section>

          <Section title="Company health & insiders" subtitle="Is the business doing well? Are the bosses buying?" icon={Icon.ideas}>
            <Example caption="Shown when you tap a stock on Today, and on Ideas cards.">
              <InsightLines i={{ health: { label: 'strong', revGrowth: 12, epsGrowth: 18, margin: 24, debtEq: 0.4 }, insiders: { bought: 1_200_000, sold: 300_000, buyers: 2 } }} />
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Company health</b> looks at the last 12 months: are sales growing, is profit per share growing, how many cents of each $1 of sales are kept as profit, and how much debt it has. Mostly good = <span className="text-emerald-300">healthy</span>, mostly bad = <span className="text-red-300">weak</span>, otherwise average.</li>
              <li><b>Insiders</b> are the company's own bosses and directors. When they buy their own stock with their own money, it's a good sign: they know the business best. When they sell, it's usually routine (taxes, a house, planned sales), so it means much less.</li>
              <li><b>Weak finances turn a BUY into <ActionChip action="WAIT" size="sm" /></b> everywhere: on alerts (before any paid AI check), on your stock tiles and on Ideas. Selling is not affected.</li>
              <li>Both are free and passed to the AI check. Funds (ETFs) and some banks don't have these numbers, so nothing is shown for them.</li>
            </ul>
          </Section>

          <Section title="Taxes: when you bought" subtitle="Why the purchase date matters when selling" icon={Icon.wallet}>
            <P>In the US, profit on shares you held <b>1 year or less</b> is taxed like your salary (short-term). Held <b>more than 1 year</b>, it is usually taxed less (long-term). Add the date you first bought each stock in Settings → My holdings, and the app tells you where you stand.</P>
            <Example caption="On a SELL with a gain, close to the 1-year mark.">
              <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">🧾 {taxText({ days: 340, longTerm: false, longOn: '2026-11-01', daysToLong: 26 }, 30)}</p>
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li>Within 60 days of the 1-year mark, a SELL tile shows a <b>tax tip</b>, and the AI check leans toward WAIT unless the stock is falling fast.</li>
              <li>Selling at a loss has no reason to wait for taxes.</li>
              <li>If you bought at different times, use your first purchase date. This is a rule of thumb, not tax advice.</li>
            </ul>
          </Section>

          <Section title="Your cash & goal" subtitle="What you can afford, and for how long" icon={Icon.wallet}>
            <P>In Settings → My holdings you can add <b>cash ready to invest</b> and <b>how long</b> you plan to keep the money invested. Both are optional.</P>
            <Example caption="A buy that costs more than your cash gets a reminder. It's information only: it does not change BUY to WAIT.">
              <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-xs text-amber-100">This costs about {fmtMoney(1850)}, but you have {fmtMoney(1200)} cash. Add money or buy fewer shares.</p>
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Cash</b> is added to "Where your money is", so "too much in one stock" is measured against all your money.</li>
              <li><b>Under 1 year</b>: the AI is stricter about jumpy, risky stocks. <b>More than 5 years</b>: day-to-day noise matters less.</li>
            </ul>
          </Section>

          <Section title="Words tab" subtitle="A plain-English trading dictionary" icon={Icon.words}>
            <P>Not sure what "bullish", "RSI" or "P/E" means? Open the <b>Words</b> tab. Every word has a one-line meaning, often an example, and a note if this app uses it. Type in the search box to find a word fast.</P>
            <Example caption="One entry from the Words tab.">
              <TermCard t={{ word: 'Bull', also: 'bullish', means: 'Someone who thinks prices will go up. "Bullish" = expecting a rise.', example: '"I\'m bullish on Apple" = I think Apple will go up.' }} />
            </Example>
          </Section>

          <Section title="Reddit buzz" subtitle="What people are saying, and whether it's good or bad" icon={Icon.ideas}>
            <P>The app counts how often each of your stocks is mentioned on r/stocks, r/wallstreetbets and r/investing, compares it with the day before, and reads the top posts of the day to tell if the talk is good or bad.</P>
            <Example caption="A badge only appears when a stock is talked about at least twice as much as usual. The colour tells you if the talk is good (green), bad (red) or mixed (amber).">
              <div className="flex flex-wrap gap-2">
                <BuzzBadge b={BUZZ_GOOD} />
                <BuzzBadge b={BUZZ_BAD} />
                <BuzzBadge b={BUZZ_MIXED} />
              </div>
            </Example>
            <Example caption="Tap a stock on Today to see the details: how much talk, rank among all stocks, the mood bar, why it's talked about, and the top posts (tap a post to open it on Reddit).">
              <RedditPanel b={BUZZ_GOOD} />
            </Example>
            <P><b>No Reddit key yet? Here's how the mood is found for now.</b> Without the key the app can still count mentions, but it can't read the posts. So when a stock suddenly trends, it reads that stock's <b>news headlines from the last 2 days</b> instead, because the news usually explains why people are talking. Each headline is scored with simple good and bad words ("surge", "beats", "record" vs "plunge", "probe", "lawsuit"). If clearly more headlines are bad than good, the mood is bad; if clearly more are good, it is good; otherwise mixed. The badge then says "news" and the details show the headlines instead of posts.</P>
            <Example caption="Without a Reddit key: the talk numbers come from Reddit, the mood and the likely reason come from the news.">
              <div className="space-y-2">
                <BuzzBadge b={BUZZ_NEWS} />
                <RedditPanel b={BUZZ_NEWS} />
              </div>
            </Example>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Trending for a bad reason</b> (lots of talk, mostly negative): a BUY becomes <ActionChip action="WAIT" size="sm" /> (on alerts, on your stock tiles and on Ideas), and if you own the stock you get a red heads-up on Today.</li>
              <li><b>Crowd hype</b> (lots of happy talk and the price already jumped): a BUY becomes <ActionChip action="WAIT" size="sm" /> everywhere, because hype often reverses.</li>
              <li>Reddit never creates a BUY or SELL on its own. It is context. The AI check only gets the numbers and the mood (like "busy, mostly negative"), never the posts themselves, and it is told this is untrusted chatter.</li>
              <li>All of this is free (no AI credit).</li>
            </ul>
            <Warn>Crowds are often wrong, and some posts are written to push a price up or down. Treat Reddit as a warning light, never as a reason to buy.</Warn>
          </Section>

          <Section title="Smart stop-loss" subtitle="A safety exit sized to each stock" icon={Icon.shield}>
            <P>A stop-loss is a price where you sell to stop a loss from growing. The app sizes it to how much each stock normally moves in a day (about 2.5 normal days, between 3% and 15%).</P>
            <Example caption="Calm stock vs jumpy stock, both bought at $100.">
              <div className="grid grid-cols-2 gap-2">
                <div className="panel space-y-1 text-sm">
                  <p className="font-semibold">Coca-Cola style</p>
                  <p className="text-xs text-slate-400">Moves ~1% a day</p>
                  <Stat label="Stop-loss −3%" value="$97.00" tone="down" />
                </div>
                <div className="panel space-y-1 text-sm">
                  <p className="font-semibold">Tesla style</p>
                  <p className="text-xs text-slate-400">Moves ~3.5% a day</p>
                  <Stat label="Stop-loss −8.8%" value="$91.25" tone="down" />
                </div>
              </div>
            </Example>
            <P>Your risk limit (Settings → Risk, default $100) then sets the number of shares: the jumpier the stock, the fewer shares, so the possible loss stays the same.</P>
            <Tip>The app does not place the stop-loss for you. After buying, add a "stop" sell order in Fidelity at that price.</Tip>
          </Section>

          <Section title="Too much in one stock" subtitle="Spreading your money" icon={Icon.wallet}>
            <P>If one single company is more than a quarter (25%) of your money, the app shows a small reminder, because one bad day there hurts more. It's information only: it never turns a BUY into WAIT. Funds like VTI or VOO are not counted, because they already hold hundreds of companies.</P>
            <Example>
              <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-2 py-1.5 text-sm text-amber-100">This would make AAPL about 41% of your money. Consider fewer shares.</p>
            </Example>
          </Section>

          <Section title="Alerts, emails & notifications" subtitle="How the app reaches you" icon={Icon.bell}>
            <ul className="space-y-2 text-sm text-slate-300">
              <li><b>Email me</b> (button): sends one instruction now.</li>
              <li><b>Auto-email (app open)</b>: emails BUY/SELL calls the AI approved, but only while the app is open on that device.</li>
              <li><b>Background alerts (app closed)</b>: the server checks every 15 minutes on weekdays (7am–8pm New York) and emails you approved calls even when your phone is locked. It also checks your stocks' trends every hour. When this is on, the app does not send its own auto-email too, so you never get the same email twice.</li>
              <li><b>Notifications</b>: a phone alert for background alerts. On iPhone, first add the app to your Home Screen (Safari → Share → Add to Home Screen) and open it from there.</li>
              <li><b>Weekly summary</b>: every Friday after the market closes: your profit/loss, the week's instructions and the scoreboard.</li>
              <li><b>Stop alerts</b> (top right): stops checking the news and turns auto-email off on that device. It does not touch Fidelity and deletes nothing. Press Resume to start again.</li>
            </ul>
          </Section>

          <Section title="Saving AI credits" subtitle="What costs money and what is free" icon={Icon.shield}>
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li><b>Costs about 1 cent</b>: an AI check of a signal, Ask the AI on Ideas, Re-check.</li>
              <li><b>Free</b>: news, prices, charts, scores, earnings, analysts, the market check, and the safety rules (sell what you do not own, earnings soon, falling market, Reddit buzz, weak finances).</li>
              <li>Only strong signals (75%+ by default) get an automatic AI check; weaker ones show an "AI check" button.</li>
              <li>The same question within 2 hours is answered from memory for free.</li>
              <li>A daily limit (default 20) covers all your devices together. Change both in Settings → Alerts &amp; email.</li>
            </ul>
          </Section>

          <Section title="Words you will see" subtitle="Quick glossary" icon={Icon.guide}>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
              {(
                [
                  ['Signal', 'A suggestion created from the news. It is checked before you see a BUY or SELL.'],
                  ['Score / confidence', 'How strong the news signal is, from 0 to 100%. Not a promise of profit.'],
                  ['Trend', 'Which way the price has been going over the last months.'],
                  ['50-day average', 'The average price of the last 50 trading days. Above it usually means a healthy trend.'],
                  ['RSI / overheated', 'A 0–100 measure of how fast it rose. Above 70 = rose too fast, often pulls back.'],
                  ['Stop-loss', 'A price where you sell to stop a loss from getting bigger.'],
                  ['Market order', 'Buy or sell now at the current price.'],
                  ['Limit order', 'Buy or sell only at your price or better (set it in Settings → Risk).'],
                  ['ETF / fund', 'One share that holds many companies (like VTI). Safer than one stock.'],
                  ['Earnings', 'The quarterly results report. Prices move a lot that day.'],
                  ['S&P 500', 'The 500 biggest US companies together: "the market".'],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-slate-100">{k}</dt>
                  <dd className="text-slate-400">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </div>

      <p className="pt-2 text-center text-[11px] text-slate-600">Not a broker: this app never places trades. You place every order yourself in Fidelity. Not financial advice.</p>
    </div>
  );
}
