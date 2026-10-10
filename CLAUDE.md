# Working on this repo

- **Keep the Guide tab up to date.** Every change that adds or changes a user-visible feature must also update `src/pages/Guide.tsx` in the same commit: plain everyday words, and a live example built from the app's own components (made-up numbers, no working buttons).
- Push directly to `main` (the owner deploys from it via Netlify).
- Do not add automated tests unless asked.
- New features: describe them and get the owner's OK before building. Bug fixes can go straight in.
- The app never places orders and has no demo mode. Paid AI calls go through `netlify/lib/aiBudget.ts` (daily limit + cache); keep free rules ahead of AI calls.
- Phone-friendly is required: check a 390px-wide layout for any UI change.
- 🎚️ How careful (`src/lib/strictness.ts`): levels Careful / Balanced / Risky / Custom / Auto in `Settings.strictness` (+ `customRules`), synced. **Balanced = the original rules exactly** (checked against the old code on random data); keep it that way. Every BUY decision takes the resolved `Rules`: `analyze()` (trend.ts), `buyWait()`/`buyNotes()` (waitRules.ts), `isBuyIdea()` (picks.ts), the AI reviewer's strictness line (`AI_RULE`, reviewCore.ts), share sizing (`sizeQty`), the background check and "BUY is back on" (extraAlerts.ts). Auto resolves with the market (`resolveRules(settings, market)`). Locked at every level: no selling what you don't own, no buying on earnings day, no buying a downtrend with weak finances, never places orders. Score entries carry `level`.
