# GoDoggyDate Analytics Events

The GA4 / dashboard reference for the launch funnel, and for the telemetry endpoints that sit next to it. Every event named here is fired by the code today. To check this file against the code at any time:

```bash
node scripts/analytics-inventory.cjs          # every event the code fires, web / mobile / both
node scripts/analytics-inventory.cjs --check  # exits 1 if the code fires an event this file doesn't mention
```

## Required environment

Set these on the deployed web app (Vercel):

```bash
NEXT_PUBLIC_SITE_URL=https://godoggydate.com
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
GA4_API_SECRET=...            # server-only; needed for the iPhone relay (see below)
GOOGLE_SITE_VERIFICATION=your-google-token
```

## How events get to GA4

- **Web** fires `gtag('event', ...)` from the browser (`web/lib/analytics.ts`). GA4 supplies the session itself. Signed-in users are tagged with their Firebase uid as GA `user_id` (`setAnalyticsUser`), which lets GA4 join one person across browsers.
- **iPhone app** posts the same event names to the web app's `/api/analytics` relay, which holds `GA4_API_SECRET` and forwards to the GA4 Measurement Protocol. Every mobile event carries `platform: mobile`, plus `session_id` and `engagement_time_msec`: the Measurement Protocol drops events that have no session id, so the app keeps one session id per 30 minutes of activity (it survives an app restart inside that window) and the relay fills in a 30-minute bucket for older app builds that send none. The relay accepts any event name that is snake_case and at most 40 characters, so new events need no relay change.
- **Once-per-account events** (`first_*`) are sent through `trackFirstTime()`: remembered in the browser's localStorage per account, so a person who signs in on a second browser fires them again. Count users, not events, in GA4 and that doesn't matter.

## The launch funnel

Visit, quiz, sign up, profile complete, first swipe, first match, first message, first playdate. Each step is one event, and **all eight are measurable on web**:

| Step | Event | Platform | Notes |
|------|-------|----------|-------|
| 1. Visit | `landing_view` (homepage), `page_view` (any route) | web | `cta_click` = main landing CTA |
| 2. Quiz | `quiz_start`, `quiz_complete`, `quiz_signup_cta` | web | `quiz_retake` is a repeat; `quiz_share` / `quiz_share_compat` are shares |
| 3. Sign up | `sign_up` (new account) / `login` (returning), param `method` | web | GA4 recommended events. `auth_open` -> `sign_in_attempt` -> `sign_in_success` / `sign_in_failure` is the finer-grained auth funnel and also fires for returning users |
| 4. Profile complete | `profile_completed` (`profile_saved` on every save) | web + mobile | Swipe-ready, which is also what unlocks Discover |
| 5. First swipe | `first_swipe` (param `action`) | web | Once per account; `swipe_action` is every like/pass |
| 6. First match | `first_match` | web | Once per account; `match_created` is every match |
| 7. First message | `first_message_sent` | web | Once per account; `message_sent` is every message |
| 8. First playdate | `playdate_proposed`, then `playdate_confirmed` | web + mobile | Not once-gated, count users. **`playdate_confirmed` is the north-star metric** |

Recommended GA4 setup: mark `sign_up`, `profile_completed`, `first_swipe`, `first_match`, `first_message_sent` and `playdate_confirmed` as key events, then build an Explore -> Funnel exploration with steps 1 to 8 (user-based, "open funnel" so a person who skips a step isn't dropped). The iPhone app does **not** yet send `sign_up`, `login`, the `first_*` events or the quiz events (new iPhone UI is a follow-up), so until it does the funnel is a web funnel; iPhone users still show up from `profile_completed` onward.

## Other events

### Sign-in and account (web)

| Event | Meaning |
|------|---------|
| `auth_open` | Sign-in modal opened |
| `sign_in_attempt` / `sign_in_success` / `sign_in_failure` | Google or Apple sign-in started / completed / failed |
| `in_app_browser_notice` | Sign-in modal shown inside an app's built-in browser (Facebook, Instagram...), where Google sign-in cannot finish. Params: `app`, `platform` |
| `guest_like_requires_auth` | A signed-out visitor tried to like a dog and was asked to sign in |
| `signed_out` | User signed out |
| `account_delete_requested` | Account deletion confirmed |

### Discover, matches and chat

| Event | Platform | Meaning |
|------|----------|---------|
| `swipe_action` | web + mobile | Like or pass |
| `match_created` | web + mobile | Mutual match |
| `chat_view` | web + mobile | Unlocked chat opened |
| `chat_unlock_prompt_view` | web + mobile | Locked chat opened |
| `chat_unlock_payment_submitted` | web | $4.99 unlock payment submitted (before the webhook confirms it) |
| `message_sent` | web + mobile | Chat message sent |
| `playdate_proposed` / `playdate_confirmed` | web + mobile | Playdate proposal sent in chat / accepted |
| `playdate_rated` | web + mobile | Post-playdate rating submitted |
| `discover_radius_changed` | web | Distance filter changed |
| `waitlist_joined` | web | Joined the "no dogs near me yet" waitlist (`position`, `already`) |
| `while_you_wait_click` | web | A link in the "while you wait" panel clicked |
| `invite_shared` | web | Personal invite link shared (`method`: share / copy / email, `source`) |
| `invite_friend_clicked` | web | Invite flow triggered |

### Safety and moderation

| Event | Platform | Meaning |
|------|----------|---------|
| `report_submitted` | web + mobile | A report was filed |
| `block_user` | web | A user was blocked |
| `content_filter_blocked` | mobile | Text stopped by the content filter |

### Profile, Pro and push

| Event | Platform | Meaning |
|------|----------|---------|
| `profile_saved` | web + mobile | Dog profile saved |
| `public_page_toggled` | web | Public dog page switched on or off (`enabled`) |
| `cover_photo_crop_saved` | mobile | Cover crop saved |
| `founding_member_cta_click` | web + mobile | Founding Member offer clicked |
| `pro_checkout_click` | web + mobile | Pro checkout button clicked |
| `reminder_completed` | web + mobile | A care reminder ticked off |
| `today_profile_incomplete_click`, `today_safety_prompt_click` | web + mobile | Today panel prompts clicked |
| `push_enable_click`, `push_enabled`, `push_enable_failed` | web | Push notification opt-in |

### Pack Day

`packday_list_open`, `packday_view`, `packday_created`, `packday_rsvp`, `packday_calendar`, `packday_share` fire on web and mobile. Web only: `packday_public_cta` (public page CTA), `pack_day_entry_click` (entry from the profile), `packday_gate_signin` (signed-out visitor hit the sign-in gate), `packday_attendee_card_open`, `packday_headsup_shown`. Mobile only: `packday_map`.

### Growth, quiz and the Playroom (fun features)

All of these fire on both web and mobile. The AI features (roast, apology, texts, letter, human review) fire a `_generate_click` then a `_generated` event, and every feature fires `_share_click` when someone taps share and `_shared` when the share or download completes:

| Feature | Events |
|---------|--------|
| Roast | `roast_generate_click`, `roast_generated`, `roast_share_click`, `roast_shared` |
| Apology | `apology_generate_click`, `apology_generated`, `apology_share_click`, `apology_shared` |
| Texts from your dog | `texts_generate_click`, `texts_generated`, `texts_share_click`, `texts_shared` |
| Letter | `letter_generate_click`, `letter_generated`, `letter_share_click`, `letter_shared` |
| Human review | `human_review_generate_click`, `human_review_generated`, `human_review_share_click`, `human_review_shared` |
| Adventures | `adventures_share_click`, `adventures_shared` |
| Barkle | `barkle_share_click`, `barkle_shared` |
| Dog quiz | `dogquiz_share_click`, `dogquiz_shared` |
| Dogtype | `dogtype_share_click`, `dogtype_shared` |
| Diptych | `diptych_share_click`, `diptych_shared` |
| Handoff card | `handoff_card_share_click`, `handoff_card_shared` |
| Memory card | `memory_card_share_click`, `memory_card_shared` |
| Milestone | `milestone_share_click`, `milestone_shared` |
| Plaque | `plaque_share_click`, `plaque_shared` |
| Recruit card | `recruit_card_share_click`, `recruit_card_shared` |
| Snoot | `snoot_share_click`, `snoot_shared` |
| Sticker studio | `sticker_studio_share_click`, `sticker_studio_shared` |
| Story | `story_share_click`, `story_shared` |
| Trading card | `trading_card_share_click`, `trading_card_shared` |
| Wanted poster | `wanted_share_click`, `wanted_shared` |

Other events in the same family:

- Web and mobile: `adventures_open`, `adventure_stamped`, `barkle_complete`, `snoot_open`, `snoot_milestone`, `sticker_studio_open`, `dogquiz_setup_start`, `dogquiz_key_set`, `dogquiz_key_redo`, `dogquiz_guest_start`, `dogquiz_guest_scored`, `compat_explorer_view`, `compat_explorer_browse_all_click`, `compat_explorer_unlock_boop_click`, `compat_explorer_unlock_invite`, `compat_explorer_unlock_invite_shared`.
- Web only: `fun_hub_open`, `fun_hub_click`, `wanted_mugshot_change`, `compat_detail_open`, `compat_link_click`, `compat_type_page_click`, `compat_share_click`, `compat_shared`, `compat_invite_click`, `compat_invite_shared`.
- Mobile only: `fun_open`, `barkle_open`, `wanted_open`, `excuse_share_click`, `excuse_shared`, `dogtype_reveal_open`, `dogtype_reveal_cta`, `dogtype_compat_share_click`, `dogtype_compat_shared`, `compat_explorer_cta_click`, `compat_explorer_detail_open`, `compat_explorer_invite_click`, `compat_explorer_invite_shared`, `compat_explorer_type_page_click`.

### Recommended custom dimensions

Register these event parameters in GA4 for cleaner reporting: `source`, `method`, `action`, `platform`, `context`, `compatibility_score`, `reason`, `has_existing_messages`, `enabled`.

## Quick validation after deploy

1. Open the homepage in an incognito window and click the primary CTA.
2. Open the auth modal, complete sign-in (a new Google account fires `sign_up`).
3. Save a complete dog profile, swipe once, and send a message after a match.

GA4 Realtime should then show `page_view`, `landing_view`, `cta_click`, `auth_open`, `sign_up`, `sign_in_success`, `profile_completed`, `first_swipe` and (after a match) `first_match` / `first_message_sent`. iPhone events appear with `platform = mobile`.

## Telemetry endpoints and monitoring

Three small public endpoints. All are same-origin only, size-capped and per-IP rate limited (in memory, so per serverless instance), and none logs anything identifying.

| Endpoint | What it does |
|----------|--------------|
| `POST /api/analytics` | GA4 relay for the iPhone app (above). 204 and a no-op when GA4 isn't configured |
| `POST /api/client-error` | Browser error reports from `web/lib/errorReporting.ts` |
| `POST /api/csp-report` | Content-Security-Policy violation reports (below) |

### Browser error monitoring

`web/lib/errorReporting.ts` listens for uncaught errors and unhandled promise rejections, and the Next error boundaries (`app/error.tsx`, `app/global-error.tsx`) report render crashes. Each report is a small JSON document: message (300 chars), stack frames (1,500 chars, no message text, origins or query strings), the route with ids collapsed (`/d/[id]`), the browser's user agent and the release. Never an email, uid or token: the text is scrubbed in the browser and again on the server. Noise is dropped (`Script error.`, ResizeObserver notices, aborted requests, a closed sign-in popup, browser-extension errors) and a page sends at most five reports.

On the server each **distinct** error (same kind, message, top stack frame and release) produces exactly one log line, so the logs stay searchable:

```
[client-error] {"fp":"1756529c","kind":"error","message":"...","route":"/app/messages/[id]","release":"a1b2c3d","count":1,"stack":"..."}
```

Search Vercel logs for `[client-error]`. An error that keeps happening is logged again, with its running `count`, at most once an hour. Dedup is per serverless instance, so a busy deployment can log one error once per warm instance.

Optional alert: set `CLIENT_ERROR_WEBHOOK_URL` (a Slack- or Discord-compatible https webhook) and each new error also posts a one-line summary, at most one post a minute per instance. `release` is the first 7 characters of the git commit on Vercel (`NEXT_PUBLIC_RELEASE` overrides it).

### Security headers and the CSP rollout

`web/next.config.js` sends on every route: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, a `Permissions-Policy` (geolocation for this site, camera and microphone off, payment delegated to Stripe), `Strict-Transport-Security` (one year, subdomains; no `preload` yet), and no `X-Powered-By`. There is deliberately **no** `Cross-Origin-Opener-Policy`: `same-origin` would cut the link the Google and Apple sign-in popups use to hand the result back.

The Content-Security-Policy ships as **`Content-Security-Policy-Report-Only`**: browsers report what it would block to `/api/csp-report` (one `[csp-report]` log line per report, URLs reduced to origin or path) but block nothing, so it cannot break sign-in, payments or analytics. Plan to switch it to enforcing:

1. **Collect (now, 1 to 2 weeks).** Search the Vercel logs for `[csp-report]`. Expect little. Every `blocked` host that is not Google, Firebase, Stripe or Google Analytics needs a decision: add it to the policy, or find out who is injecting it (browser extensions show up as `blocked: "inline"` / `"eval"` or odd hosts with no `source`).
2. **Exercise the paths a log can't see.** On production, with the policy still report-only, do one real Google sign-in, one Apple sign-in, a Stripe test payment (chat unlock and Pro checkout), a photo upload, push opt-in and a share-card download, and confirm no new `[csp-report]` lines appear for them.
3. **Tighten.** Replace the family wildcards (`*.googleapis.com`, `*.google-analytics.com`...) with the exact hosts seen in the reports, and move `script-src` off `'unsafe-inline'` by adding a per-request nonce (Next.js middleware) so only our own inline bootstrap scripts run.
4. **Enforce.** In `next.config.js` change the header key `Content-Security-Policy-Report-Only` to `Content-Security-Policy` and add `frame-ancestors 'self'` (browsers ignore it in report-only mode). Keep `report-uri` so violations stay visible. To roll back, change the key back; nothing else moves.
5. **Later, optional:** add `preload` to the HSTS header after confirming every subdomain is https-only, and submit the domain to the preload list.

Not yet verified against real services (the sandbox this was built in cannot reach Google or Stripe): the Google and Apple sign-in popups, Stripe, and Google Analytics actually loading. Step 2 covers them.
