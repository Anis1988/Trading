# Working on this repo

- **Keep the Guide tab up to date.** Every change that adds or changes a user-visible feature must also update `src/pages/Guide.tsx` in the same commit: plain everyday words, and a live example built from the app's own components (made-up numbers, no working buttons).
- Push directly to `main` (the owner deploys from it via Netlify).
- Do not add automated tests unless asked.
- New features: describe them and get the owner's OK before building. Bug fixes can go straight in.
- The app never places orders and has no demo mode. Paid AI calls go through `netlify/lib/aiBudget.ts` (daily limit + cache); keep free rules ahead of AI calls.
- Phone-friendly is required: check a 390px-wide layout for any UI change.
