# Trading Assistant (frontend-only)

React + TypeScript + Tailwind SPA, deployed to Netlify from GitHub. It watches news for a watchlist, produces BUY/SELL **signals**, and either shows copy-paste instructions or emails them via EmailJS.

> **Not a broker.** This app never places or routes orders and never calls a broker API. You must manually confirm and execute every trade in your Fidelity account. Not financial advice.

## Features
- Dashboard, Signal Center, History (CSV export + executed/order-id audit trail), Logs, Settings
- Poller with exponential backoff + jitter (default 30 s, configurable, min 10 s)
- Sources: RSS (parsed in browser), NewsAPI, optional MCP (also the route for X/Twitter, which is never fetched in-browser)
- Local engine: keyword weights + small sentiment lexicon -> side + confidence (`src/lib/signals.ts`)
- Optional MCP: POST headlines, receive `{ signals: [{symbol, side, confidence, reason, qty, autoEmail?}] }`
- EmailJS fallback; **Panic Stop** button; **mock/demo mode is the default**
- State in `localStorage` (settings, watchlist, signals, history, logs); JSON import/export, history CSV

## Run locally
Requires Node 20+.
```bash
npm install
cp .env.example .env     # optional: fill in EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_USER_ID
npm run dev              # open http://localhost:5173
```
It starts in mock mode, so no keys are needed. `.env` is git-ignored; restart `npm run dev` after editing it.
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

(The spec's optional webhook URL is intentionally not implemented: a client-side webhook would be another public secret.)

### Security note — read this
Without a backend, **every variable above is compiled into the public JS bundle** and readable by anyone who opens the site.
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
- Most RSS feeds and NewsAPI (free plan) block browser CORS. The UI reports this in Logs; use a proxy you trust or MCP.
- Polling only runs while a tab is open. No price data is fetched, so limit prices are user-entered.
- localStorage is per-browser and not encrypted.
