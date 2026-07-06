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
8. Confirm web, mobile, scripts, and Firebase deploys all target the same canonical Firebase project id
9. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID`, deploy, and verify GA4 Realtime shows:
   - `page_view`
   - `landing_view`
   - `cta_click`
   - `auth_open`
   - `sign_in_success`
10. Set `GOOGLE_SITE_VERIFICATION`, deploy, and submit `https://godoggydate.com/sitemap.xml` in Google Search Console

Manual checks still required:

- Set the real Expo EAS project id via `EXPO_PUBLIC_EAS_PROJECT_ID` (or `EAS_PROJECT_ID`) for `mobile/app.config.js`
- Provision `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` (or ADC) on the web host
- Provision `NEXT_PUBLIC_SITE_URL=https://godoggydate.com` on the web host so metadata and sitemap use the production origin
- Provision `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `GOOGLE_SITE_VERIFICATION` on the web host
- Regenerate `web/package-lock.json` on a machine with network access before final CI/prod deploy
- Update Stripe Dashboard webhooks to the deployed Firebase Function URL, not the inactive Next.js webhook stubs
