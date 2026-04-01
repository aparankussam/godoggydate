# 🐾 GoDoggyDate — MVP Setup Guide

> **Launch in 5 days.** This guide covers environment setup, Firebase configuration, Stripe wiring, and deployment for both mobile (iOS/Android) and web.

---

## Table of Contents
1. [Project Structure](#1-project-structure)
2. [Prerequisites](#2-prerequisites)
3. [Day 1 — Firebase Setup](#3-day-1--firebase-setup)
4. [Day 2 — Web App (Next.js)](#4-day-2--web-app-nextjs)
5. [Day 3 — Mobile App (Expo)](#5-day-3--mobile-app-expo)
6. [Day 4 — Stripe Payments](#6-day-4--stripe-payments)
7. [Day 5 — Deploy](#7-day-5--deploy)
8. [Architecture Overview](#8-architecture-overview)
9. [Matching Engine](#9-matching-engine)
10. [Trust Score System](#10-trust-score-system)
11. [Environment Variables Reference](#11-environment-variables-reference)
12. [Common Issues](#12-common-issues)

---

## 1. Project Structure

```
godoggydate/
├── mobile/                     # React Native + Expo SDK 51
│   ├── app/                    # Expo Router screens
│   │   ├── _layout.tsx         # Root layout (fonts, gesture handler)
│   │   ├── index.tsx           # Splash → routing
│   │   ├── onboarding.tsx      # 3-step dog profile creation
│   │   └── (tabs)/             # Main tab navigator
│   │       ├── discover.tsx    # Swipe feed
│   │       ├── matches.tsx     # Matches + chat + rating
│   │       └── profile.tsx     # Dog profile view
│   └── constants/theme.ts      # Design tokens
│
├── web/                        # Next.js 14 App Router
│   ├── app/
│   │   ├── layout.tsx          # Root layout (fonts, metadata)
│   │   ├── page.tsx            # Landing page
│   │   ├── app/page.tsx        # Web app (discover + matches)
│   │   ├── globals.css         # Tailwind + design system
│   │   └── api/
│   │       └── payments/
│   │           ├── create-intent/route.ts   # Stripe PI creation
│   │           └── webhook/route.ts         # Stripe webhook
│   └── public/manifest.json    # PWA manifest
│
├── shared/                     # Platform-agnostic code
│   ├── types/
│   │   ├── index.ts            # All TypeScript types
│   │   └── breeds.ts           # 45 breeds with compatibility data
│   ├── utils/
│   │   ├── matchingEngine.ts   # Compatibility scoring algorithm
│   │   ├── firebase.ts         # Firebase initialization
│   │   └── stripe.ts           # Stripe helpers
│   └── data/
│       └── seedDogs.ts         # 15 demo dogs
│
├── firebase/
│   └── functions/src/index.ts  # Cloud Functions (Stripe webhook + trust score)
│
├── scripts/seed.ts             # Firestore seed script
├── firestore.rules             # Security rules
├── storage.rules               # Storage security rules
├── firebase.json               # Firebase project config
├── firestore.indexes.json      # Composite indexes
└── .env.example                # Environment variable template
```

---

## 2. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |
| pnpm or npm | latest | `npm i -g pnpm` |
| Firebase CLI | ≥ 13 | `npm i -g firebase-tools` |
| Expo CLI | ≥ 8 | `npm i -g expo-cli` |
| EAS CLI | ≥ 10 | `npm i -g eas-cli` |
| Stripe CLI | ≥ 1.19 | [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli) |
| Xcode | ≥ 15 | macOS App Store (iOS only) |
| Android Studio | latest | [developer.android.com](https://developer.android.com) |

---

## 3. Day 1 — Firebase Setup

### 3.1 Create Project

```bash
# Login
firebase login

# Create project (or use existing)
firebase projects:create godoggydate-c6c92 --display-name "GoDoggyDate"

# Set active project
firebase use godoggydate-c6c92
```

### 3.2 Enable Services

In the [Firebase Console](https://console.firebase.google.com):
1. **Authentication** → Sign-in methods → Enable **Phone**
2. **Firestore Database** → Create database → Start in **production mode**
3. **Storage** → Get started

### 3.3 Deploy Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

If the web app shows a composite index error on Matches or Messages, redeploy indexes explicitly:

```bash
firebase deploy --only firestore:indexes
```

### 3.4 Seed Data (Optional but recommended)

```bash
# Against emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/seed.ts

# Against live project (ensure service account is set up)
FIREBASE_PROJECT_ID=godoggydate-c6c92 npx ts-node scripts/seed.ts
```

### 3.5 Start Emulators (for local dev)

```bash
firebase emulators:start
# UI at http://localhost:4000
```

---

## 4. Day 2 — Web App (Next.js)

### 4.1 Install Dependencies

```bash
cd web
npm install
```

### 4.2 Configure Environment

```bash
cp ../.env.example .env.local
# Edit .env.local with your Firebase + Stripe keys
```

### 4.3 Run Dev Server

```bash
npm run dev
# http://localhost:3000 — landing page
# http://localhost:3000/app — web app
```

### 4.4 Key Files to Customise

| File | What to change |
|------|---------------|
| `app/page.tsx` | Landing page copy, hero image, CTA |
| `app/globals.css` | Brand colours (CSS variables at top) |
| `tailwind.config.ts` | Extend colour/font tokens |
| `app/app/page.tsx` | Web app — replace demo data with Firestore |

---

## 5. Day 3 — Mobile App (Expo)

### 5.1 Install Dependencies

```bash
cd mobile
npm install
```

### 5.2 Configure Environment

```bash
cp ../.env.example .env
# Expo reads EXPO_PUBLIC_* vars automatically
```

### 5.3 Run on Device / Simulator

```bash
# Start dev server
npx expo start

# Then press:
# i — iOS Simulator
# a — Android Emulator
# Scan QR — Expo Go on physical device
```

### 5.4 Add Google Fonts (required)

```bash
npx expo install @expo-google-fonts/fraunces @expo-google-fonts/nunito expo-font
```

### 5.5 Key Files to Customise

| File | What to change |
|------|---------------|
| `constants/theme.ts` | Colours, fonts, spacing |
| `app/onboarding.tsx` | Onboarding questions, validation |
| `app/(tabs)/discover.tsx` | Swipe card layout, feed logic |
| `app.json` | Bundle ID, app name, icons |

### 5.6 Replace Demo Data with Firebase

In `discover.tsx`, replace the static `FEED` array with a Firestore query:

```typescript
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { getFirebase } from '../../../shared/utils/firebase';

const { db } = getFirebase();
const snap = await getDocs(
  query(collection(db, 'dogs'), where('location', '!=', null))
);
const dogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
```

---

## 6. Day 4 — Stripe Payments

### 6.1 Create Stripe Account

1. Sign up at [stripe.com](https://stripe.com)
2. Get your **Publishable Key** and **Secret Key** from the Dashboard
3. Add them to `.env.local`

### 6.2 Wire Webhook (local testing)

```bash
# Start Stripe CLI listener
stripe listen --forward-to localhost:3000/api/payments/webhook

# This prints a webhook signing secret — add it as STRIPE_WEBHOOK_SECRET
```

### 6.3 Test Payment Flow

```bash
# Test card: 4242 4242 4242 4242 — any future date — any CVC
```

### 6.4 Production Webhook

In your [Stripe Dashboard](https://dashboard.stripe.com/webhooks):
1. Add endpoint: `https://godoggydate.com/api/payments/webhook`
2. Select event: `payment_intent.succeeded`
3. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`

### 6.5 Mobile Stripe Setup

```bash
cd mobile
npx expo install @stripe/stripe-react-native
```

Wrap your root layout with `StripeProvider`:

```tsx
import { StripeProvider } from '@stripe/stripe-react-native';

<StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
  {/* app */}
</StripeProvider>
```

---

## 7. Day 5 — Deploy

### 7.1 Deploy Web (Vercel — recommended)

```bash
npm i -g vercel
cd web
vercel --prod
# Add all NEXT_PUBLIC_* and server env vars in Vercel dashboard
```

### 7.2 Deploy Cloud Functions

```bash
cd firebase/functions
npm install
npm run build
cd ../..
firebase deploy --only functions
```

### 7.3 Build Mobile App (EAS)

```bash
cd mobile
eas login
eas build:configure

# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

### 7.4 Submit to Stores

```bash
# App Store
eas submit --platform ios

# Google Play
eas submit --platform android
```

---

## 8. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    CLIENTS                          │
│  iOS App (Expo)  │  Android App  │  Web (Next.js)  │
└──────────┬───────────────────────────────┬──────────┘
           │                               │
           ▼                               ▼
┌──────────────────────┐    ┌─────────────────────────┐
│   Firebase Auth      │    │  Next.js API Routes     │
│   (Phone OTP)        │    │  /api/payments/*        │
└──────────┬───────────┘    └────────────┬────────────┘
           │                             │
           ▼                             ▼
┌──────────────────────┐    ┌─────────────────────────┐
│   Firestore          │    │  Stripe                 │
│   (Main Database)    │◄───│  Payment Intents        │
└──────────┬───────────┘    └─────────────────────────┘
           │
           ▼
┌──────────────────────┐
│  Firebase Functions  │
│  - stripeWebhook     │
│  - onRatingCreated   │
│  - cleanupStale      │
└──────────────────────┘
```

### Data Flow: Match → Chat Unlock

```
User swipes right → mutual like detected
        ↓
Match document created (chatUnlocked: false)
        ↓
User taps "Unlock Chat $4.99"
        ↓
POST /api/payments/create-intent
        ↓
Stripe PaymentIntent created → clientSecret returned
        ↓
Client confirms payment (Stripe SDK)
        ↓
Stripe fires payment_intent.succeeded webhook
        ↓
Firebase Function updates match.chatUnlocked = true
        ↓
Chat opens 🎉
```

---

## 9. Matching Engine

The engine scores every candidate dog 0–100 against the user's dog.

### Weights

| Signal | Weight |
|--------|--------|
| Breed compatibility | 30% |
| Size compatibility | 20% |
| Energy level delta | 15% |
| Good-with / Not-good-with | 15% |
| Play style overlap | 10% |
| Health signals | 5% |
| Distance bonus | 5% |

### Penalties

| Condition | Penalty |
|-----------|---------|
| Unsafe size pairing (XS vs XL) | −15 pts |
| High energy vs easily overstimulated | −15 pts |
| notGoodWith cross-match | −15 pts |
| Behaviour flag conflict | −15 pts |

Scores are clamped to **30–99**. Dogs with unsafe pairings are sorted to the bottom of the feed — never hidden, always warned.

---

## 10. Trust Score System

```
trustScore = clamp(weightedAvgStars/5 + confidenceBonus, 0, 1)
```

- **Weighted average**: recent ratings count more (90-day half-life exponential decay)
- **Confidence bonus**: up to +0.10 for dogs with 30+ ratings
- **Recalculated**: automatically via Cloud Function on every new rating
- **Displayed**: as a shield badge (🛡️) on swipe cards

---

## 11. Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_FIREBASE_*` | Web `.env.local` | Firebase client config |
| `EXPO_PUBLIC_FIREBASE_*` | Mobile `.env` | Firebase client config |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Web | Stripe client key |
| `STRIPE_SECRET_KEY` | Web server only | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Web server only | Stripe webhook signing secret |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Web | Mapbox GL JS token |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | Mobile | Mapbox token |
| `FIREBASE_PROJECT_ID` | Scripts/Functions | Firebase project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Scripts/Functions | Path to service account JSON |

---

## 12. Common Issues

**`Module not found: shared/types`**
→ Add path alias in `tsconfig.json`:
```json
{ "paths": { "shared/*": ["../shared/*"] } }
```

**Expo font not loading**
→ Ensure `useFonts` hook is called before first render. Check `SplashScreen.preventAutoHideAsync()` is called at module level.

**Firestore permission denied**
→ Check you're authenticated before reading/writing. Rules require `request.auth != null`.

**Stripe webhook 400 error**
→ Ensure `STRIPE_WEBHOOK_SECRET` matches the secret shown by `stripe listen`. For production, use the Dashboard signing secret.

**Build fails on `firebase-admin` in Next.js**
→ Add to `next.config.js`:
```js
module.exports = {
  experimental: { serverComponentsExternalPackages: ['firebase-admin'] }
}
```

---

## Quick Start (TL;DR)

```bash
# 1. Clone / extract project
cd godoggydate

# 2. Set up env
cp .env.example web/.env.local
cp .env.example mobile/.env

# 3. Install deps
cd web && npm install && cd ..
cd mobile && npm install && cd ..
cd firebase/functions && npm install && cd ../..

# 4. Start Firebase emulators
firebase emulators:start &

# 5. Seed data
FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/seed.ts

# 6. Run web
cd web && npm run dev

# 7. Run mobile (new terminal)
cd mobile && npx expo start
```

---

*Built with ❤️ for dogs everywhere. Questions? hello@godoggydate.com*
