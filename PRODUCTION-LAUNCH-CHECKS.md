# GoDoggyDate Production Launch Checks

Run these before any soft launch or public launch:

1. `npm run verify:launch-config`
2. `cd web && npm run build && npm run lint && npm run typecheck`
3. `cd mobile && npm run lint && npm run typecheck`
4. `cd firebase/functions && npm run build`
5. Verify the deployed Stripe webhook points to the Firebase Function `stripeWebhook` and is
   subscribed to: `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`,
   `charge.dispute.closed`, `checkout.session.completed` (Founding Member payment link)
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
- Add `checkout.session.async_payment_succeeded` and `customer.subscription.created|updated|deleted` to the Stripe webhook endpoint (alongside `charge.dispute.closed`, step 5).
- Set `AI_GLOBAL_DAILY_LIMIT` on Vercel if the 2,000 AI calls/day default doesn't fit.
- Firebase Auth sign-in methods: **Google** on, **Apple** on (iOS and web), **Anonymous stays ON** (the iPhone app's guest mode), **Email/Password OFF** (nothing in the website or the app uses it). The rules make anonymous sign-in safe to leave on: a guest can browse, but creating `dogs/{uid}` needs a token whose `sign_in_provider` is `google.com` or `apple.com` (`firestore.rules`, `isRealAccount()`), and uploading photos, videos or avatars needs the same (`storage.rules`). A guest who links Google or Apple on the phone gets a token with the linked provider and can then create the profile.
- Report alerts are throttled, so one account can't flood the channel (50 reports once produced 50 alerts in 113 ms). Reporting the same person again in the same clock hour is a duplicate and gets no alert; each reporter gets at most **5 report alerts per hour**, then one "report burst" summary and silence until the next hour. Every report is still saved in `reports/` and in `moderationLog/report_<id>` (its `alert` field says what happened: `alert`, `summary`, `suppressed_duplicate`, `suppressed_cap`), and the evidence snapshot is still taken. The ops alerts for removed photo URLs and for failed founding checks use the same limiter.
- Dog photos: `photos[]` may only hold this project's Firebase Storage URLs and the `_placeholder_` padding. `onDogProfileWriteModerate` drops anything else on every write (another host, `data:` URLs, non-strings), because the public `/d/` page and the server-rendered share image would otherwise make every visitor's browser and our server fetch an attacker's URL. Each removal is logged in `moderationLog` (`kind: "dog_photo_url"`, with the dropped URLs) and alerts ops (at most 3 per dog per hour). The owner is not shown a notice. In the emulators only, `http://127.0.0.1:9199/` and `http://localhost:9199/` URLs are accepted too. The accepted buckets are the project's configured bucket, `<project>.appspot.com` and `<project>.firebasestorage.app`; if profile photos live in any other bucket, list it in `GDD_PHOTO_BUCKETS` (comma-separated) in `firebase/functions/.env` **before deploying**, or every photo on the next profile write would be dropped (the dropped URLs stay in `moderationLog`). After deploying, open a test profile that has photos, save it, and confirm the photos are still there and `moderationLog` has no `dog_photo_url` entry for it.
- The alert limits write small documents to `opsThrottle/`. Optional: in the Firestore console set a TTL policy on collection `opsThrottle`, field `expireAt`, so they clear themselves. Nothing breaks without it.
- Run the security-rules tests before every rules deploy (they use their own project id, so they never touch app data):
  `firebase emulators:exec --only firestore,storage --project demo-rules-test "npm --prefix firebase/tests ci && npm --prefix firebase/tests test"`
  or, against emulators that are already running, `cd firebase/tests && npm ci && npm test`.

Founding ladder (#1–50 free, #51–150 at $39, then closed):

- One numbered run of 150 Founding Members, set in `shared/founding.ts` (copied to `firebase/functions/src/founding.ts`; `shared/serverMirrors.test.ts` fails if the two differ). The first 50 dogs with a **finished** profile get a number and the lifetime entitlement free (`onDogProfileFounding`). Numbers #51–150 are handed out by the Stripe webhook as each $39 payment lands. Every member shows the same "⭐ Founding Member #N" badge.
- What "finished" means for a free number (`foundingProfileGaps` in `shared/founding.ts`): name, breed, age, sex, size, an energy level, at least one temperament or play-style chip, a location on the **public** dog doc (coordinates, or city and state, or a place name; a ZIP alone is private and doesn't count, so a ZIP-only profile waits until it has one of those), and at least **3 real photos**. A real photo is a Firebase Storage URL for this project's bucket inside the owner's own `dogs/<uid>/` folder; `_placeholder_` padding and any other URL don't count. A hollow `{ name: 'x' }` document gets nothing; if it is completed later, the number is awarded then. The check runs on every write to `dogs/{uid}`, is transactional and idempotent (re-saving never awards twice, the counter only moves with an award, so numbers stay gapless), and someone who bought Founding before making a profile gets their **purchased** number copied onto the dog doc as soon as it exists. Someone whose membership was refunded or lost to a dispute never gets a free number afterwards.
- Creating a dog profile needs a Google or Apple account (`firestore.rules`). A throwaway anonymous or email account can't take a spot. A dog doc written for a user that no longer exists or is banned (an ID token stays valid for up to an hour after deleteAccount or a ban) is deleted by the same trigger and awards nothing; it is logged in `moderationLog` (`orphan_dog_deleted`).
- If the founding check itself fails, the ops channel is alerted ("could not check the founding number for dog …"); the check runs again on the dog's next profile save.
- Deploying: `onDogProfileFounding` replaces `onDogProfileCreated`. Firebase can't change a deployed function's trigger type in place, so the old function is a different name; `firebase deploy --only functions` asks to delete `onDogProfileCreated` (answer yes, or deploy with `--force`). Don't leave both deployed.
- The $39 offer (homepage, profile, chat) only appears once `counters/foundingPack` reaches 50, and disappears at 150.
- Keep the Stripe cap: on the Payment Link, **Options → Limit the number of payments** set to 100. The webhook also stops numbering at #150, and alerts the ops channel if a payment arrives after that, from someone who is already a member, while free spots are still open, for an account that no longer exists or is banned, or with a raised quantity ($78 for two). Each of those needs a manual refund decision.
- One account holds one membership: a checkout whose subtotal pays for more than one ($78) grants one and alerts you to refund the rest by hand. A 100%-off checkout (nothing charged) never grants and never spends a number; it alerts you in case you meant to give it away, and then you grant it by hand. A partial promo code still grants.
- A refund or dispute ends a paid membership and retires its number (the counter never goes down). Free members are never touched by refunds. A refund or dispute that arrives after the account was deleted only marks the payment record; it doesn't recreate anything. `charge.dispute.closed`: a **lost** dispute makes sure the membership stays revoked; a **won** dispute is recorded on the payment and alerts you, and the membership is **not** restored automatically (its number was retired when the dispute opened): grant it by hand if you want them back.
- Rollout order: delete test accounts (`scripts/admin-delete-user.cjs`), deploy functions, then run `node scripts/founding-ladder-backfill.cjs` (dry run) and again with `--confirm`. It grants the free entitlement to existing #1–50 holders and removes free numbers above 50 that the old rules handed out.
- The Payment Link is the only way to buy Founding Member. `/api/stripe/checkout` refuses `tier: "founding"` because a session created there would not count against the Stripe limit. Remove `STRIPE_FOUNDING_MEMBER_PRICE_ID` from Vercel; nothing reads it now.

Pack Day (group playdates):

- Deploys with the functions (`createPackDay`, `rsvpPackDay`, `cancelPackDay`, `onPackDayCancelled`, `sendPackDayReminders`) and `firestore.rules` (`packDays/` is read-only for clients). Deploy functions and rules before the website: the new Pack Day tab reads `packDays/` and fails until the rules are live.
- Cancellation pushes come from `onPackDayCancelled`, which fires when an event's status changes to `cancelled`, whoever changed it. `cancelPackDay` only changes the status. Deploy the two together: the new `cancelPackDay` without the trigger cancels without telling anyone.
- `sendPackDayReminders` runs on Cloud Scheduler (every 30 minutes), like the other scheduled functions.
- The ⭐ Official badge is set by hand: host the event as yourself, then set `official: true` on its `packDays/{id}` document in the Firebase console. Clients cannot set it.
- Smoke test with two accounts: host one, RSVP from the second, check the host's push, open `/pack/{id}` signed out, cancel, and confirm the attendee gets exactly one push ("… was cancelled by the host.").

Removing a Pack Day (moderators):

- The ops alert for a Pack Day report ends with the command to run. Run it as a dry run first. It prints the event and what it would change, and changes nothing:

  ```
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
    node scripts/admin-remove-packday.cjs <eventId> --reason "Broke the Pack Day rules"
  ```

  Then run it again with `--confirm` added. The event id is also the last part of an `/app/pack/<eventId>` link.
- It cancels the event the same way the host's Cancel button does. It also sets `removedByModerator: true` and `removedReason`, and copies the event into `moderationLog/packday_<eventId>`.
- `onPackDayCancelled` then pushes to:
  - everyone signed up: "<title> was removed by GoDoggyDate."
  - the host: the event was removed because it broke the community rules.

  Nothing is pushed for an event that's already over. Deploy the functions before using the script. The push goes out only at the moment of cancellation, so events removed before the deploy are never announced.
- `removedReason` is stored on the event, which every signed-in member can read. Write it for them, not as an internal note.
- Both apps show "This Pack Day was cancelled." They don't say who cancelled, so a removal doesn't blame the host.
- The title, place and note stay readable at the event's link, including the public `/pack/<eventId>` page, marked cancelled. If the text itself is the problem, delete `packDays/<eventId>` in the Firebase console after running the script. The pushes still go out, and the moderation log keeps a copy.
- Removing an event doesn't stop the host from creating another. If the host is the problem, act on the account too (`scripts/admin-ban-user.cjs`, next section).

Banning or removing a user (moderators):

- Both scripts need the functions built once, because they load the shared cleanup module from `firebase/functions/lib`: `cd firebase/functions && npm install && npm run build`. Both print the project first, are a **dry run unless you add `--confirm`** (`--dry-run` is accepted too), and accept `--uid=<uid>` or `--email=<email>`.
- **Ban** (stop a person coming back, keep the evidence):

  ```
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
    node scripts/admin-ban-user.cjs --uid=<uid> --reason "Harassment in chat"            # dry run
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
    node scripts/admin-ban-user.cjs --uid=<uid> --reason "Harassment in chat" --confirm
  ```

  It disables the Firebase Auth user and revokes their refresh tokens; deletes `dogs/{uid}` so the dog leaves discovery, the public `/d/` page and the share image (a copy of the profile goes into the moderation record first); deletes their push tokens; cancels Pack Days they host that are still ahead (`onPackDayCancelled` tells the attendees) and removes them from ones they joined; and writes `moderationLog` (`kind: "user_banned"`, with the reason, their email and the profile as it was; Admin-only). The Auth user is **kept, disabled**, on purpose: the same Google or Apple account then maps to the disabled uid and can't sign in or sign up again with a new uid (and a new Founding number). Chats and matches are left alone, and a Stripe subscription is not cancelled (the ids are printed: cancel it in Stripe). An ID token they already hold keeps working for up to an hour; if they use it to recreate the dog doc, `onDogProfileFounding` deletes it again because the user is disabled. To lift a ban, enable the Auth user again in the Firebase console; the dog profile is not restored (the copy is in the moderation log).
- **Delete** (remove everything about a person, e.g. test accounts or a legal request):

  ```
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
    node scripts/admin-delete-user.cjs --email=someone@example.com                       # dry run
  GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
    node scripts/admin-delete-user.cjs --email=someone@example.com --confirm
  ```

  It runs the **same cleanup as the in-app "Delete account"** (`firebase/functions/src/accountCleanup.ts`): matches in every participant slot including legacy ones, with their messages; swipe decisions either way; ratings and reports they filed; blocks; `users/` and `dogs/` with all subcollections; their place in other dogs' households and the invites they made; Pack Days; and their photos in Storage. Without deleting the photos, their links stay public: a Storage download URL carries its own token and ignores `storage.rules`. It then deletes the Auth user, after which the same Google or Apple account **can register again** with a new uid. Add `--keep-disabled` to delete all the data but leave the Auth user disabled instead, which keeps that account out. Either way it writes `moderationLog` (`admin_user_deleted` or `admin_user_deleted_kept_disabled`). Payments, matchUnlocks, stripeEvents, moderationLog and safetyEvidence are kept. It does not cancel Stripe subscriptions (it prints the ids; the in-app deletion does cancel them).
- Both scripts act on project `godoggydate`. `GDD_PROJECT_ID` (with the `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` and `FIREBASE_STORAGE_EMULATOR_HOST` variables) points them at local emulators instead; `GDD_STORAGE_BUCKET` names the bucket if it isn't `<project>.appspot.com` or `<project>.firebasestorage.app`.

Account deletion (in-app "Delete account"):

- `deleteAccount` revokes the person's refresh tokens first, then cancels their Stripe subscriptions if they have one on record (`users/{uid}/private/entitlements.pro`; skipped quietly when there is none; if Stripe can't be reached or refuses, the ops channel is alerted with the subscription id so they aren't billed), then removes their data (the module above) and finally the Auth user. It now needs the `STRIPE_SECRET_KEY` and `OPS_ALERT_WEBHOOK_URL` secrets bound, like `stripeWebhook`; both already have to exist for deploys.
- **Apple token revocation is NOT done** and can't be faked. App Store Review expects that deleting an account for someone who signed in with Apple also revokes their Sign in with Apple token (guideline 5.1.1(v)). The Apple ID of a deleted account therefore still lists GoDoggyDate under "Sign in with Apple" until it is done. To enable it the owner must provide: (1) a Sign in with Apple **private key** (.p8) with its Key ID, plus the Apple **Team ID** and the **Services ID** (Apple Developer → Certificates, Identifiers & Profiles → Keys); (2) enter them in Firebase console → Authentication → Sign-in method → Apple (the "OAuth code flow configuration"), so Firebase can exchange the authorization code from a sign-in for a revocable token. After that the apps (or `deleteAccount`) still need a code change to supply the authorization code and call Firebase's token-revocation API. Until then, tell anyone who asks that they can remove GoDoggyDate from their Apple ID settings themselves.

Content filter (chat messages, dog profiles, Pack Day text):

- Matching reads through Unicode tricks: fullwidth, circled and accented forms, zero-width characters, look-alike Cyrillic and Greek letters, l33tspeak ("n00dz"), censor marks ("n*gger") and spaced-out letters. "xxx" at the end of a message is a kiss and is allowed; "xxx videos" is not. A few ordinary uses of listed words are let through (Maine Coon, the coonhound breeds, Coon Rapids, "a chink in the fence", Van Dyke). Edit `shared/contentFilter.ts` and copy its body to `firebase/functions/src/contentFilter.ts`; `shared/contentFilterMirror.test.ts` fails if they differ.
- Both apps refuse slurs, sexual solicitation and threats before saving, and the server checks every write again: `onMessageCreatedNotify` for chat, `onDogProfileWriteModerate` for dog profiles, and `createPackDay` for Pack Day text. What was refused is kept in `moderationLog/` (Admin-only), and the ops alert carries ids, never the text.
- When the server clears dog profile text, it also writes `users/{uid}/private/moderationNotice`, which only the owner can read: `{ fields, reason, at }`.
  - `fields` lists what was cleared, by editor field: `name`, `breed`, `location` (city and state), `bio`, `healthNotes`, `prompts`, `temperament`, and the other chip lists.
  - `reason` is `slur`, `sexual` or `threat`. It names the most serious when fields failed for different reasons.
  - A second clear before the owner dismisses the notice adds its fields to the same notice.
- What the owner sees: the cleared field is blank, or the item is gone from the list or prompts. The next time they open the app, web or iPhone, a notice names the fields that were removed and why, and asks them to rewrite them. Dismissing it deletes the notice. Until the app versions that read it ship, the owner sees only the blank field.
- Check after deploy, on a test account: in the Firestore console, put a blocked word in that dog's `name`. The console skips the apps' check, but the server check still runs. Confirm that:
  - the name is cleared;
  - the notice appears in the app and goes away when dismissed;
  - the ops alert arrives.

Deploying these functions (from the repo root, with the `OPS_ALERT_WEBHOOK_URL` secret already set):

```
firebase deploy --only functions --project godoggydate
```

That deploys every function, including the earlier content filter work that hasn't gone out yet. To deploy only the ones that the moderator removal and the profile notice touch:

```
firebase deploy --only functions:cancelPackDay,functions:onPackDayCancelled,functions:onReportCreated,functions:onDogProfileWriteModerate --project godoggydate
```

The backend-integrity changes (founding completion rule, Stripe webhook edges, report throttling, photo-URL clean-up, deleteAccount, household limits) are in `onDogProfileFounding`, `stripeWebhook`, `onReportCreated`, `onDogProfileWriteModerate`, `deleteAccount`, `createHouseholdInvite` and `removeHouseholdMember`, and they go out together with the rules (`firebase deploy --only firestore:rules,storage,functions --project godoggydate`). After deploying the rules, a guest session on the iPhone can no longer create a dog profile or upload photos until it signs in with Google or Apple; check that the iPhone onboarding asks a guest to link an account first.

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
