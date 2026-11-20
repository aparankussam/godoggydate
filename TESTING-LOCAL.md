# Local Testing Guide

This guide is for local testing with:
- Expo dev client + Metro
- iOS Simulator
- Next.js API routes on localhost
- Firebase project `godoggydate`
- Stripe test mode

Before you start, run `npm run audit:runtime-config` from the repo root and make sure your local runtime files all point at the same Firebase project.

## 1. Start Services

### Web API on port 3001

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate/web
npm run dev:3001
```

### Metro for Expo dev client

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate/mobile
npm run start:dev-client
```

### iOS simulator app

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate/mobile
npm run ios
```

Use `localhost`, not LAN IP, for the iOS Simulator.

## 2. Seed Predictable Test Data

### Seed dogs and demo users

Run after Firebase Storage/Firestore are configured:

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate
FIREBASE_PROJECT_ID=godoggydate GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccountKey.json npx ts-node scripts/seed.ts
```

This creates seeded dog profiles and demo users like:
- `user_seed_0`
- `user_seed_1`
- `user_seed_2`

### Prepare a signed-in tester for guaranteed matches

After you sign in in the mobile app and save your own dog profile, get your Firebase auth UID from Metro logs or app debugging and run:

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate
FIREBASE_PROJECT_ID=godoggydate TEST_USER_ID=<your_firebase_uid> node scripts/prepare-dev-user.cjs
```

This seeds reverse likes from:
- `user_seed_0`
- `user_seed_1`
- `user_seed_2`

So swiping right on those seeded dogs creates a deterministic mutual match.

Optional direct locked match shortcut:

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate
FIREBASE_PROJECT_ID=godoggydate TEST_USER_ID=<your_firebase_uid> DIRECT_LOCKED_MATCH=true node scripts/prepare-dev-user.cjs
```

## 3. Test User Flow

### Auth + profile

1. Launch the app in the iOS simulator via dev client.
2. Sign in with Google or guest.
3. Save a complete dog profile:
   - at least 3 photos
   - breed
   - age
   - sex
   - size
   - at least 1 play style
   - ZIP or city/state

### Discover

After seeding, Discover should show demo dogs. Good seeded candidates to swipe on:
- `Kaju` (`user_seed_0`)
- `Noodle` (`user_seed_1`)
- `Poppy` (`user_seed_2`)

### Match creation

After running `prepare-dev-user.cjs`, swipe right on one of the seeded dogs above.

Expected result:
- a mutual match is created in `matches/{sorted_uid_pair}`
- it appears in the Matches tab

### Reach payment screen

1. Open the Matches tab
2. Tap the new match
3. The chat should open in locked state
4. You should see `Unlock Chat` and a `Pay $4.99` button

## 4. Stripe Test Payment

Use Stripe test card:

- Card number: `4242 4242 4242 4242`
- Any future expiry date
- Any CVC
- Any ZIP/postal code

## 5. Expected Success Result

After successful payment:
- PaymentSheet completes successfully
- Stripe webhook receives `payment_intent.succeeded`
- Firebase Function `stripeWebhook` updates:
  - `matches/{matchId}.dog1ChatUnlocked = true` or `dog2ChatUnlocked = true`
  - `matches/{matchId}.chatUnlocked = true`
  - `paymentId`
  - `unlockedAt`
- Reopening or refreshing the chat should show the message composer instead of the paywall

## 6. Webhook Requirement

Mobile unlock completion depends on the Firebase Function webhook, not only the Next.js route.

You still need working Stripe Functions config and webhook forwarding/deployment for true end-to-end unlock verification.

### Minimum webhook verification

Set Firebase Functions Stripe secrets:

```bash
cd /Users/anandp/Projects/goDoggyDate/godoggydate
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions
```

Forward Stripe test events to the deployed function:

```bash
stripe listen --forward-to https://us-central1-godoggydate.cloudfunctions.net/stripeWebhook
```

If you test on a physical device instead of iOS Simulator, replace `localhost` in `mobile/.env` with your Mac's LAN IP for the web API base URL and restart Metro + the native app.

## 7. Run the website against the Firebase emulators (no real accounts or data)

Useful for testing sign-in-gated pages, profile saves, chat, Pack Day and the Cloud
Functions without touching the real `godoggydate` project or Stripe.

1. Start the emulators from the repo root (needs Java and `firebase-tools`):

   ```bash
   (cd firebase/functions && npm ci && npm run build)
   STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_x OPS_ALERT_WEBHOOK_URL=http://127.0.0.1:9/sink \
     firebase emulators:start --only auth,firestore,storage,functions --project demo-godoggydate
   ```

   This loads the real `firestore.rules`, `storage.rules` and every callable and
   Firestore-triggered function. Scheduled functions (reminders, celebrations,
   Pack Day reminders) are not run by the emulator.

2. Create `web/.env.local` (gitignored). The `demo-` project id is required; the
   emulator hook in `web/shared/utils/firebase.ts` refuses to turn on without it,
   so a real deployment can never be pointed at an emulator:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-godoggydate
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-godoggydate.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
   NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:demo
   NEXT_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
   GCLOUD_PROJECT=demo-godoggydate
   ```

3. `cd web && npm run dev`, then sign in with Google (the Auth emulator shows a fake
   account picker). Photos, profiles and matches land in the emulators only.

Things that do not work this way: AI features (no Gemini key), payments (no Stripe
keys), push notifications, and social-card images when the emoji CDN is blocked.
