# Trading Assistant (frontend-only)

React + TypeScript + Tailwind SPA, deployed to Netlify from GitHub. It watches news for a watchlist, produces BUY/SELL **signals**, and either shows copy-paste instructions or emails them via EmailJS.

> **Not a broker.** This app never places or routes orders and never calls a broker API. You must manually confirm and execute every trade in your Fidelity account. Not financial advice.

## Features
- Dashboard, Signal Center, History (CSV export + executed/order-id audit trail), Logs, Settings
- Poller with exponential backoff + jitter (default 30 s, configurable, min 10 s)
- Sources: **Netlify function `/api/news`** (Yahoo Finance + Google News RSS, optional Finnhub - server-side, so no CORS blocks), browser RSS/NewsAPI as a fallback, optional MCP (also the route for X/Twitter, which is never fetched in-browser)
- **AI trade review** (`/api/review`, Claude): every signal gets APPROVE / CAUTION / REJECT with rationale, risks and live price context. **REJECT blocks emails**; auto-email requires APPROVE; a failed review never counts as approval
- Local engine: keyword weights + small sentiment lexicon -> side + confidence (`src/lib/signals.ts`)
- Optional MCP: POST headlines, receive `{ signals: [{symbol, side, confidence, reason, qty, autoEmail?}] }`
- EmailJS fallback; **Panic Stop** button; **mock/demo mode is the default**
- State in `localStorage` (settings, watchlist, signals, history, logs); JSON import/export, history CSV

## Run locally
Requires Node 20+.
```bash
npm install
cp .env.example .env     # optional: fill in EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_USER_ID
npm run dev              # UI only, http://localhost:5173 (mock mode works fully)
npm run dev:full         # UI + Netlify functions, http://localhost:8888 (needed for live news + AI review)
```
It starts in mock mode, so no keys are needed (AI review is simulated there). `.env` is git-ignored; restart `npm run dev` after editing it.
Production check: `npm run build && npm run preview`.

## 1. GitHub setup
```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
git checkout -b demo && git push -u origin demo   # optional demo branch
```
`.env` files are git-ignored. Never commit keys.

## 2. Connect to Netlify
1. https://app.netlify.com/start -> *Import an existing project* -> pick the repo.
2. Build settings are read from `netlify.toml` (`npm run build`, publish `build`).
3. Site configuration -> Environment variables -> add the variables below, then trigger a redeploy.
4. **Demo branch:** `netlify.toml` sets `FORCE_MOCK=true` for the `demo` branch deploy. Enable branch deploys for `demo` in Netlify (Build & deploy -> Branches). That deploy cannot leave mock mode.

## 3. Netlify environment variables
| Name | Required | Purpose |
|---|---|---|
| `EMAILJS_SERVICE_ID` | for email | EmailJS service |
| `EMAILJS_TEMPLATE_ID` | for email | EmailJS template |
| `EMAILJS_USER_ID` | for email | EmailJS **public key** |
| `NETLIFY_MCP_ENDPOINT` | optional | https MCP endpoint |
| `NETLIFY_MCP_API_KEY` | optional | MCP key (also the HMAC key) |
| `NEWSAPI_KEY` | optional | NewsAPI |
| `FORCE_MOCK` | optional | `true` locks the build to mock mode |
| `ANTHROPIC_API_KEY` | for AI review | **Server-only** (functions). Never reaches the browser |
| `REVIEW_MODEL` | optional | Default `claude-opus-5-5`; set `claude-sonnet-5-5` for faster/cheaper reviews |
| `FINNHUB_KEY` | optional | **Server-only**. Adds Finnhub company news |
| `APP_ACCESS_TOKEN` | strongly recommended | **Server-only**. If set, `/api/*` requires it; enter it in Settings -> AI trade review |

The last four are read only by the Netlify functions at runtime and are **not** compiled into the bundle. Set them in Netlify (or `.env` for `npm run dev:full`).

(The spec's optional webhook URL is intentionally not implemented: a client-side webhook would be another public secret.)

### Ideas tab (what to buy now)
`/api/scan` pulls ~6 months of prices for ~60 large US stocks and ETFs (list in `src/lib/universe.ts`), scores each 0-100 (trend 60, 3-month momentum 15, near its high 5, minus 15 if overheated, +/-10 for recent news headlines on the top candidates), and the tab shows only healthy, not-overheated ones with reasons, a stop-loss and a share count for your risk limit. *Ask the AI for its top picks* reuses `/api/recommend`. *Check with AI & send to Today* turns an idea into a normal signal (AI review with your holdings, then Email/Copy). Results are cached 10 minutes. It ranks by price behaviour and news tone; it cannot predict returns, and "nothing looks good" is a valid result. If the scan times out on Netlify's 10 s function limit, fewer stocks get scored; trim the list in `universe.ts`.

### Risk, P&L and scoreboard
- **Today** opens with total profit/loss in dollars and today's change for everything you own.
- Every BUY card shows a suggested **stop-loss** (Settings: stop-loss %, default 5) and how many shares keep your loss within *Most I want to lose on one trade* (default $100). The stop is only a suggestion included in the email: you place any stop order yourself in Fidelity. SELL cards show the proceeds and gain/loss versus what you paid.
- **History -> Scoreboard** compares each real signal's price with the close 5 trading days later, with win rate and average move, split by what the AI said. Needs 20+ signals before it means anything and only counts this device's signals.
- **Stop Alerts** (top right) stops news checking and turns Auto-Email off. It does not touch anything in Fidelity and deletes nothing. Auto-Email itself now persists across refreshes; it needs your passphrase to switch on.

### Trends tab
Shows ~6 months of daily prices (via `/api/trends`, Yahoo, no key) for your watchlist and holdings, or a built-in list of 24 popular large companies. Each card has a chart, 1- and 3-month change, a simple 0-5 trend score (price above 50-day average, 20-day above 50-day, positive 1- and 3-month change, RSI between 40 and 70), a plain-words idea (buy candidate / wait / hold / sell / avoid), and your own profit or loss if you own it. *Ask the AI what to look at* (`/api/recommend`, a few cents per click, never automatic) picks up to 3 BUY and 2 SELL ideas from the table; SELL ideas are limited to stocks you own. It sees only price trends, not news or company financials. It is for ideas, not advice, and nothing here sends emails or places orders.

### Syncing between your phone and computer
Browser storage is per device, so the app saves your holdings, watchlist, history and settings to a private Netlify Blobs document through `/api/sync`. Requirements: set `APP_ACCESS_TOKEN` in Netlify (sync refuses to run without it), redeploy, then on **each device** open Settings -> Sync & access, enter the same token and press *Save & sync now*. After that it syncs on open, when you switch back to the tab, and ~1.5 s after each change. History from both devices is merged; for settings, holdings and watchlist the latest save wins. Mock/live mode, Panic Stop, auto-email and MCP are deliberately **not** synced. Signals and logs stay per device. The access token itself is stored only in that device's browser.

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
- [ ] Test the full flow in mock mode first
- [ ] Settings -> *Enable live mode…* and confirm with the passphrase
- [ ] Enable Auto-Email only after sending one manual test email; it resets to OFF on every page load
- [ ] Know where **PANIC STOP** is (header): stops polling, disables auto-email, re-locks the session
- [ ] Review every instruction before placing it in Fidelity; record order id + price in History

## Known limitations
- Yahoo/Google can still rate-limit or change their feeds; failures show up in Logs and trigger backoff. Browser-side RSS/NewsAPI (when `Fetch news via Netlify function` is off) is mostly CORS-blocked.
- Polling only runs while a tab is open. No price data is fetched, so limit prices are user-entered.
- localStorage is per-browser and not encrypted.
