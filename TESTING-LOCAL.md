# Local Testing Guide

This guide is for local testing with:
- Expo dev client + Metro
- iOS Simulator
- Next.js API routes on localhost
- Firebase project `godoggydate`
- Stripe test mode

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
