# GoDoggyDate Repo Operations

This repo has a few local-workflow sharp edges. Use this file as the operational source of truth before launch work.

## Canonical repo

- The active app repo is `godoggydate/`.
- Sibling folders such as `godoggydate_clean`, `godoggydate_working`, `godoggydate_backup`, and `godoggydate_stabilize` should be treated as historical snapshots unless intentionally revived.
- Do not copy env files, plist files, or deployment commands between those folders without re-validating project ids.

## Canonical runtime targets

- Choose one Firebase project id and use it everywhere:
  - `.firebaserc`
  - `web/.env.local`
  - `mobile/.env`
  - `mobile/GoogleService-Info.plist`
  - `mobile/ios/GoDoggyDate/GoogleService-Info.plist`
  - any local root `.env.local` values used by scripts
- Stripe webhook verification for launch belongs on the deployed Firebase Function `stripeWebhook`, not the inactive Next.js webhook stubs.

## Secret hygiene

- Treat `serviceAccountKey.json` as local-only bootstrap material. Do not commit it, share it casually, or assume it is safe forever.
- If any local secret file or env value has been copied outside this machine or into chat/email/screenshots, rotate it.
- Prefer `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` or application default credentials on hosts instead of checking JSON credentials into repos.

## Recommended commands

- `npm run verify:launch-config`
- `npm run test:launch-config`
- `npm run audit:runtime-config`
- `npm run audit:match-unlocks`

## Current known local drift to resolve manually

- The root `.env.local` may point at a different Firebase project than `web/.env.local`, `mobile/.env`, and the iOS Firebase plist files.
- `NEXT_PUBLIC_BASE_URL` is deprecated. Prefer:
  - `NEXT_PUBLIC_APP_URL` for the public web origin
  - `EXPO_PUBLIC_PAYMENTS_API_URL` for mobile payment API calls
  - `EXPO_PUBLIC_WEB_URL` as the mobile fallback origin
