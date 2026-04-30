# GoDoggyDate Production Launch Checks

Run these before any soft launch or public launch:

1. `npm run verify:launch-config`
2. `cd web && npm run build && npm run lint && npm run typecheck`
3. `cd mobile && npm run lint && npm run typecheck`
4. `cd firebase/functions && npm run build`
5. Verify the deployed Stripe webhook points to the Firebase Function `stripeWebhook`
6. Complete a real Stripe test payment and verify:
   - only the paying user gets chat access
   - a second tap reuses the same pending intent or returns a safe conflict
   - a replayed webhook does not create duplicate payment records
7. Run `npm run audit:match-unlocks` against the target Firebase project after test payments

Manual checks still required:

- Set the real Expo EAS project id via `EXPO_PUBLIC_EAS_PROJECT_ID` (or `EAS_PROJECT_ID`) for `mobile/app.config.js`
- Provision `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` (or ADC) on the web host
- Regenerate `web/package-lock.json` on a machine with network access before final CI/prod deploy
