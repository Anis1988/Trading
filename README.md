# Trading Assistant (frontend-only)

React + TypeScript + Tailwind SPA, deployed to Netlify from GitHub. It watches news for a watchlist, produces BUY/SELL **signals**, and either shows copy-paste instructions or emails them via EmailJS.

> **Not a broker.** This app never places or routes orders and never calls a broker API. You must manually confirm and execute every trade in your Fidelity account. Not financial advice.

## Features
- Four tabs: **Today** (P&L, action needed, your stocks), **Ideas** (what to buy), **History** (audit trail + scoreboard), **Settings** (grouped: Holdings, Alerts & email, Risk, Sync, Advanced)
- One action vocabulary everywhere: **BUY · SELL · HOLD · WAIT · SKIP**, each with a fixed colour, arrow/icon and text label
- **Background alerts** (Netlify Scheduled Function every 15 min) email / notify you even when the app is closed; **weekly summary** email on Fridays
- **Installable app** (Add to Home Screen) and **phone notifications** (Web Push)
- Poller with exponential backoff + jitter (default 5 min, configurable)
- Sources: **Netlify function `/api/news`** (Yahoo Finance + Google News + Nasdaq RSS, official SEC 8-K filings, optional Finnhub - server-side, so no CORS blocks), browser RSS/NewsAPI as a fallback, optional MCP (also the route for X/Twitter, which is never fetched in-browser)
- **AI trade review** (`/api/review`, Claude): every signal gets APPROVE / CAUTION / REJECT with rationale, risks and live price context. **REJECT blocks emails**; auto-email requires APPROVE; a failed review never counts as approval
- Local engine: keyword weights + small sentiment lexicon -> side + confidence (`src/lib/signals.ts`)
- Optional MCP: POST headlines, receive `{ signals: [{symbol, side, confidence, reason, qty, autoEmail?}] }`
- EmailJS; **Stop alerts** button; always live (there is no demo mode); never places orders
- State in `localStorage` (settings, watchlist, signals, history, logs); JSON import/export, history CSV

## Run locally
Requires Node 20+.
```bash
npm install
cp .env.example .env     # optional: fill in EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_USER_ID
npm run dev              # UI only, http://localhost:5173 (no prices/news: those come from the functions)
npm run dev:full         # UI + Netlify functions, http://localhost:8888 (needed for live news + AI review)
```
Use `npm run dev:full` for real data locally. `.env` is git-ignored; restart `npm run dev` after editing it.
Production check: `npm run build && npm run preview`.

## 1. GitHub setup
```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
`.env` files are git-ignored. Never commit keys.

## 2. Connect to Netlify
1. https://app.netlify.com/start -> *Import an existing project* -> pick the repo.
2. Build settings are read from `netlify.toml` (`npm run build`, publish `build`).
3. Site configuration -> Environment variables -> add the variables below, then trigger a redeploy.

## 3. Netlify environment variables
| Name | Required | Purpose |
|---|---|---|
| `EMAILJS_SERVICE_ID` | for email | EmailJS service |
| `EMAILJS_TEMPLATE_ID` | for email | EmailJS template |
| `EMAILJS_USER_ID` | for email | EmailJS **public key** |
| `NETLIFY_MCP_ENDPOINT` | optional | https MCP endpoint |
| `NETLIFY_MCP_API_KEY` | optional | MCP key (also the HMAC key) |
| `NEWSAPI_KEY` | optional | NewsAPI |
| `ANTHROPIC_API_KEY` | for AI review | **Server-only** (functions). Never reaches the browser |
| `REVIEW_MODEL` | optional | Default `claude-opus-5-5`; set `claude-sonnet-5-5` for faster/cheaper reviews |
| `FINNHUB_KEY` | optional | **Server-only**. Adds Finnhub company news |
| `SEC_CONTACT_EMAIL` | recommended | **Server-only**. Contact email sent to sec.gov in the User-Agent (SEC's fair-access rule) for the free 8-K filings feed |
| `APP_ACCESS_TOKEN` | required for sync & background alerts | **Server-only**. `/api/*` requires it; enter it in Settings -> Sync & access |
| `EMAILJS_PRIVATE_KEY` | for background alerts / weekly email | **Server-only**. EmailJS -> Account -> API keys -> Private key. Also tick *Allow EmailJS API for non-browser applications* (Account -> Security) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | for notifications | **Server-only**. Generate once with `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | optional | `mailto:you@example.com` (contact for the push service) |

The server-only variables are read only by the Netlify functions at runtime and are **not** compiled into the bundle. Set them in Netlify (or `.env` for `npm run dev:full`).

(The spec's optional webhook URL is intentionally not implemented: a client-side webhook would be another public secret.)

### Ideas tab (what to buy now)
`/api/scan` pulls ~6 months of prices for ~60 large US stocks and ETFs (list in `src/lib/universe.ts`), scores each 0-100 (trend 60, 3-month momentum 15, near its high 5, minus 15 if overheated, +/-10 for recent news headlines on the top candidates), and the tab shows only healthy, not-overheated ones with reasons, a stop-loss and a share count for your risk limit. *Ask the AI for its top picks* reuses `/api/recommend`. *Check with AI & send to Today* turns an idea into a normal signal (AI review with your holdings, then Email/Copy). Results are cached 10 minutes. It ranks by price behaviour and news tone; it cannot predict returns, and "nothing looks good" is a valid result. If the scan times out on Netlify's 10 s function limit, fewer stocks get scored; trim the list in `universe.ts`.

### Risk, P&L and scoreboard
- **Today** opens with total profit/loss in dollars and today's change for everything you own.
- Every BUY card shows a suggested **stop-loss** (Settings: stop-loss %, default 5) and how many shares keep your loss within *Most I want to lose on one trade* (default $100). The stop is only a suggestion included in the email: you place any stop order yourself in Fidelity. SELL cards show the proceeds and gain/loss versus what you paid.
- **History -> Scoreboard** compares each real signal's price with the close 5 trading days later, with win rate and average move, split by what the AI said. Needs 20+ signals before it means anything and only counts this device's signals.
- **Stop Alerts** (top right) stops news checking and turns Auto-Email off. It does not touch anything in Fidelity and deletes nothing. Auto-Email itself now persists across refreshes; it needs your passphrase to switch on.

### Market, earnings, analysts, stop-loss, concentration (free data)
`/api/insights` (Yahoo + Finnhub free tier, `FINNHUB_KEY`) adds context without any AI cost:
- **Market check:** S&P 500 (SPY) trend is shown on Today. While it is falling, every BUY is answered **WAIT** by a free rule (no AI call).
- **Earnings warning:** earnings dates for the next 3 weeks show as a badge; a BUY within 5 days of earnings is answered **WAIT** by a free rule.
- **Analysts & basics:** buy/hold/sell counts, P/E, dividend yield and 52-week range on stock cards and Ideas, and passed to the AI check.
- **Smart stop-loss:** about 2.5x the stock's typical daily move (3-15%), so calm stocks get tight stops and jumpy ones looser stops. Turn off in Settings -> Risk to use a fixed %.
- **Concentration:** warns when one single stock (funds like VTI excluded) is over 25% of your money, or would be after a suggested buy.

### What the AI check receives
Headlines, today's price, the **6-month trend** (1/3-month change, 50-day average, RSI), market trend, earnings, analysts and basics, your holdings, the **share of your money** the stock would become, and your **stop-loss / risk limit**. Every hour (in the app and in background alerts) a held stock whose trend turned weak gets a **trend SELL** signal even when the news is quiet; it goes through the same rules and AI check. With background alerts on, the app's own auto-email stays quiet to avoid duplicate emails.

### Saving AI credits
- Default review model is `claude-sonnet-5-5` (about half the cost of Opus); set `REVIEW_MODEL` to change it.
- Only signals scoring at or above *Only auto-check signals scoring X%* (default 75%) get an automatic AI check; weaker ones show an *AI check* button.
- A daily limit (default 20 checks, Settings -> Alerts & email) covers every device, Ideas and background alerts together; usage shows on Today and in Settings. Failed calls are not counted.
- Identical questions are answered from a server cache (reviews 2 h, AI shortlist 1 h) for free; "sell what you don't own" is caught by a free rule; background alerts check at most 2 strong signals per run.

### Background alerts, weekly summary, notifications
- **Background alerts** (Settings -> Alerts & email): `netlify/functions/watch.ts` runs every 15 minutes, Mon-Fri 7am-8pm New York. It reads your synced holdings/watchlist, takes headlines from the last 24 h it has not seen, generates signals, asks Claude, and only for **APPROVE** at or above your auto-email score threshold sends the email (and a notification). Max 3 AI checks per run and 10 emails per day. Each alert is added to History and the Scoreboard on all devices. Needs sync, `ANTHROPIC_API_KEY`, `EMAILJS_PRIVATE_KEY` (and/or VAPID keys), live mode, and the toggle on. *Run a check now* runs one immediately (1 AI check, to fit the request time limit); *Test email* checks the server email setup.
- **Weekly summary** (`weekly.ts`, Fridays 21:00 UTC): profit/loss for the week and overall, this week's instructions, and the scoreboard. *Send summary now* to try it.
- **Notifications**: turn on per device. On iPhone, first add the app to the Home Screen (Safari -> Share -> Add to Home Screen) and open it from there; iOS 16.4+ only allows web notifications for installed apps.
- The service worker (`public/sw.js`) only handles notifications; it caches nothing, so you never see an old version.

### Syncing between your phone and computer
Browser storage is per device, so the app saves your holdings, watchlist, history and settings to a private Netlify Blobs document through `/api/sync`. Requirements: set `APP_ACCESS_TOKEN` in Netlify (sync refuses to run without it), redeploy, then on **each device** open Settings -> Sync & access, enter the same token and press *Save & sync now*. After that it syncs on open, when you switch back to the tab, and ~1.5 s after each change. History from both devices is merged; for settings, holdings and watchlist the latest save wins. The scoreboard syncs; Stop Alerts, auto-email, MCP and notifications are deliberately **not** synced. Signals and logs stay per device. The access token itself is stored only in that device's browser.

Enter what you own (symbol, shares, average cost) under Settings -> My holdings. Each review is written in plain words, compares the signal with your holdings (profit/loss, 'you do not own this', sell amount capped to your shares) and ends with one line: `CONFIRM: SELL 4 AAPL`, `WAIT: ...` or `DO NOT BUY ...`. Selling something you don't own is rejected by a rule before the AI is called (free). Holdings are typed by hand and stored only in your browser; keep them up to date after each trade.

Claude reads the headlines plus a live quote and returns a verdict. It is a second-opinion filter (stale news, rumours, wrong ticker, already-priced-in moves), not a prediction and not financial advice; it knows nothing about your portfolio. Each review costs a small amount of API credit, so it only runs on signals that already passed the local threshold. Because `/api/review` spends your credits, the functions only accept same-origin requests, are rate-limited per IP, and honour `APP_ACCESS_TOKEN`. **Set `APP_ACCESS_TOKEN`** (or password-protect the site), otherwise anyone who finds your URL can trigger reviews. Netlify sync functions time out after ~10 s by default; if reviews time out, set `REVIEW_MODEL=claude-sonnet-5-5` or raise the function timeout in Netlify.

### Security note — read this
Without a backend, **the variables in the first table (`NETLIFY_MCP_*`, `EMAILJS_*`, `NEWSAPI_KEY`) are compiled into the public JS bundle** and readable by anyone who opens the site. The server-only variables (`ANTHROPIC_API_KEY`, `FINNHUB_KEY`, `APP_ACCESS_TOKEN`) are not.
- EmailJS service/template/public key are designed to be public: restrict them to your Netlify domain and set a low send quota in the EmailJS dashboard.
- `NETLIFY_MCP_API_KEY` and `NEWSAPI_KEY` are real secrets. Use a dedicated, rate-limited, revocable key; or protect the whole site (Netlify password protection / SSO / Identity); or keep MCP unset. Anyone who can load the site can reuse an embedded key.
- Do not commit `.env`. Rotate any key you ever pasted into the repo.
- The passphrase is a local confirmation gate (salted SHA-256 in localStorage), not authentication; it does not protect the embedded keys.

### EmailJS template
Create a template with these variables: `to_email`, `subject`, `action`, `symbol`, `quantity`, `order_type`, `limit_price`, `reason`, `confidence`, `timestamp`, `note`, `instructions`. Set "To email" to `{{to_email}}`. The `note` is: *After execution, update the app by marking this instruction as executed and add order id and executed price.*

### MCP contract
`POST <endpoint>` with `Authorization: Bearer <key>` and `X-API-Key: <key>`; body `{headlines:[{title,url,source,publishedAt,symbol}], symbols, context}`.
The response must include header `X-MCP-Signature: hex(HMAC-SHA256(body, apiKey))` (expose it via `Access-Control-Expose-Headers`) or it is rejected. Signals for symbols not on the watchlist or with bad fields are dropped. `autoEmail:true` is honoured only if Auto-Email is ON and the session is unlocked.

## 4. Going live — safety checklist
- [ ] Set a passphrase in Settings (>= 8 chars)
- [ ] Env vars set in Netlify; EmailJS restricted to your domain; keys rotated/limited
- [ ] Site protected if MCP/NewsAPI keys are embedded
- [ ] Send yourself one manual email from a signal before turning on auto-email
- [ ] Settings -> *Enable live mode…* and confirm with the passphrase
- [ ] Enable Auto-Email only after sending one manual test email; it resets to OFF on every page load
- [ ] Know where **PANIC STOP** is (header): stops polling, disables auto-email, re-locks the session
- [ ] Review every instruction before placing it in Fidelity; record order id + price in History

## Known limitations
- Yahoo/Google can still rate-limit or change their feeds; failures show up in Logs and trigger backoff. Browser-side RSS/NewsAPI (when `Fetch news via Netlify function` is off) is mostly CORS-blocked.
- Polling only runs while a tab is open. No price data is fetched, so limit prices are user-entered.
- localStorage is per-browser and not encrypted.

### Reddit buzz (free)
Mention counts and 24 h change for r/wallstreetbets, r/stocks, r/investing come from ApeWisdom (no key). Top posts of the day and the mood (positive / negative / mixed, from free word scoring of titles weighted by upvotes) come from the official Reddit API: create a free *script* app at https://www.reddit.com/prefs/apps and set `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` in Netlify (server-only). Without the keys you still get mention counts and trends, but no mood or posts. Free rules: a BUY on a stock trending with mostly negative talk, or trending with positive hype after a big price jump, becomes WAIT. Owned stocks trending negative show a heads-up on Today. Reddit never creates a signal by itself; it is passed to the AI check as untrusted context. Cached 30 minutes.
