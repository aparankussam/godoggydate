# GoDoggyDate Production Launch Checks

Run these before any soft launch or public launch:

1. `npm run verify:launch-config`
2. `cd web && npm run build && npm run lint && npm run typecheck`
3. `cd mobile && npm run lint && npm run typecheck`
4. `cd firebase/functions && npm run build`
5. Verify the deployed Stripe webhook points to the Firebase Function `stripeWebhook` and is
   subscribed to: `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`,
   `checkout.session.completed` (Founding Member payment link)
6. Complete a real Stripe test payment and verify:
   - one payment unlocks chat for BOTH matched users (both-sides semantics)
   - a second tap reuses the same pending intent or returns a safe conflict
   - a replayed webhook does not create duplicate payment records
   - a Founding Member payment-link purchase grants `users/{uid}/private/entitlements.lifetimeChatUnlocks`
     and opens every locked chat for that user
7. Run `npm run audit:match-unlocks` against the target Firebase project after test payments
8. Confirm web, mobile, scripts, and Firebase deploys all target the same canonical Firebase project id
9. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID`, deploy, and verify GA4 Realtime shows:
   - `page_view`
   - `landing_view`
   - `cta_click`
   - `auth_open`
   - `sign_in_success`
10. Set `GOOGLE_SITE_VERIFICATION`, deploy, and submit `https://godoggydate.com/sitemap.xml` in Google Search Console

Safety and payment alerts (required before deploying functions):

- Create a Slack or Discord incoming webhook and run `firebase functions:secrets:set OPS_ALERT_WEBHOOK_URL`. Reports and paid-but-ungranted checkouts alert here; deploy needs this secret to exist.
- Add `checkout.session.async_payment_succeeded` and `customer.subscription.created|updated|deleted` to the Stripe webhook endpoint.
- Set `AI_GLOBAL_DAILY_LIMIT` on Vercel if the 2,000 AI calls/day default doesn't fit.
- Disable Email/Password and Anonymous sign-in in Firebase Auth. The website doesn't use them, and mobile guest mode must be reworked before it ships.

Founding ladder (#1–50 free, #51–150 at $39, then closed):

- One numbered run of 150 Founding Members, set in `shared/founding.ts` and mirrored by `FOUNDING_FREE_CAP` / `FOUNDING_TOTAL_CAP` in `firebase/functions/src/index.ts`. The first 50 dogs with a profile get a number and the lifetime entitlement free (`onDogProfileCreated`). Numbers #51–150 are handed out by the Stripe webhook as each $39 payment lands. Every member shows the same "⭐ Founding Member #N" badge.
- The $39 offer (homepage, profile, chat) only appears once `counters/foundingPack` reaches 50, and disappears at 150.
- Keep the Stripe cap: on the Payment Link, **Options → Limit the number of payments** set to 100. The webhook also stops numbering at #150, and alerts the ops channel if a payment arrives after that, from someone who is already a member, or while free spots are still open. Each of those needs a manual refund decision.
- A refund or dispute ends a paid membership and retires its number (the counter never goes down). Free members are never touched by refunds.
- Rollout order: delete test accounts (`scripts/admin-delete-user.cjs`), deploy functions, then run `node scripts/founding-ladder-backfill.cjs` (dry run) and again with `--confirm`. It grants the free entitlement to existing #1–50 holders and removes free numbers above 50 that the old rules handed out.
- The Payment Link is the only way to buy Founding Member. `/api/stripe/checkout` refuses `tier: "founding"` because a session created there would not count against the Stripe limit. Remove `STRIPE_FOUNDING_MEMBER_PRICE_ID` from Vercel; nothing reads it now.

Pack Day (group playdates):

- Deploys with the functions (`createPackDay`, `rsvpPackDay`, `cancelPackDay`, `sendPackDayReminders`) and `firestore.rules` (`packDays/` is read-only for clients). Deploy functions and rules before the website: the new Pack Day tab reads `packDays/` and fails until the rules are live.
- `sendPackDayReminders` runs on Cloud Scheduler (every 30 minutes), like the other scheduled functions.
- The ⭐ Official badge is set by hand: host the event as yourself, then set `official: true` on its `packDays/{id}` document in the Firebase console. Clients cannot set it.
- Smoke test with two accounts: host one, RSVP from the second, check the host's push, open `/pack/{id}` signed out, cancel, and confirm the attendee's push.

Manual checks still required:

- Set the real Expo EAS project id via `EXPO_PUBLIC_EAS_PROJECT_ID` (or `EAS_PROJECT_ID`) for `mobile/app.config.js`
- Provision `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` (or ADC) on the web host
- Provision `NEXT_PUBLIC_SITE_URL=https://godoggydate.com` on the web host so metadata and sitemap use the production origin
- Provision `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `GOOGLE_SITE_VERIFICATION` on the web host
- Regenerate `web/package-lock.json` on a machine with network access before final CI/prod deploy
- Update Stripe Dashboard webhooks to the deployed Firebase Function URL, not the inactive Next.js webhook stubs
- Create the $39 Founding Member Payment Link in Stripe and set `NEXT_PUBLIC_FOUNDING_MEMBER_PAYMENT_LINK` on the web host (CTA stays hidden until set)
- After deploying updated firestore.rules, confirm a mutual like creates a match (the pre-fix rules blocked the reverse-swipe read, so no match could ever be created)

Push notifications + mobile analytics (added 2026-07-06):

11. Generate a Web Push certificate (Firebase console → Cloud Messaging) and set `NEXT_PUBLIC_FIREBASE_VAPID_KEY` on Vercel
12. Create a GA4 Measurement Protocol API secret and set `GA4_API_SECRET` on Vercel (server-only — never NEXT_PUBLIC)
13. Redeploy Firebase Functions (`firebase deploy --only functions`) to activate onMatchCreatedNotify / onMessageCreatedNotify
14. For Android push: add `mobile/android/app/google-services.json` (Firebase console → Android app) and upload the FCM service credentials to Expo (`eas credentials`); iOS APNs is EAS-managed automatically
