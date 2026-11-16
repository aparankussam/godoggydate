# Existing feature inventory: GoDoggyDate codebase

Sources are repo-relative paths (read 2026-11-12, branch `claude/project-launch-review-844621`). "Both" = web + mobile. Everything is FREE unless marked.

## Core loops

### Takeaway
The full loop (sign-in, AI onboarding, swipe, match, chat, playdate propose/confirm, rate) is built on both platforms. Chat is currently free for everyone.

### Cited Findings
- **Sign-in**: Google on web behind an 18+/Terms checkbox (`web/components/AuthModal.tsx`); Apple, Google and anonymous guest on mobile (`mobile/app/welcome.tsx`, `mobile/lib/session.tsx`).
- **Vibe Check onboarding** (live, both): 1-3 photos in, AI-drafted profile plus archetype out; 30/day cap (`web/app/api/ai/vibe-check/route.ts`). Manual form: `web/components/DogProfileForm.tsx`, `mobile/app/onboarding.tsx`.
- **Dogtype Reveal** (live, both): animated one-time unveil of a deterministic 16-type personality after profile completion (`web/components/DogtypeReveal.tsx`, `mobile/app/dogtype-reveal.tsx`, `shared/dogtype.ts`).
- **Discover** (live, both): swipe deck ranked by compatibility then distance, with a 7-axis "why" breakdown and a "Safety mismatch" block state (`web/components/SwipeStack.tsx`, `CompatBreakdown.tsx`, `shared/utils/matchingEngine.ts`). Read-only "See how matching works" demo (`DemoGalleryGrid.tsx`). Report/block from the card (`ReportProfileMenu.tsx`).
- **Today panel** (web only): empty-deck screen showing due reminders, profile completeness and Founding Pack number (`web/components/TodayPanel.tsx`).
- **Match**: match modal, matches list with unread badges, matched-dog profile page, one **Best Friend** slot per dog (`MatchModal.tsx`, `web/app/app/matches/page.tsx`, `web/app/app/dog/[matchId]/page.tsx`, `web/lib/bestFriend.ts`).
- **Chat + playdates** (live, both): realtime chat, icebreaker prompts, playdate proposal (date/time/free-text place) and accept-to-confirm (`web/app/app/messages/[matchId]/page.tsx`, `mobile/app/chat/[matchId].tsx`). `playdate_confirmed` is the north-star metric (`ANALYTICS-EVENTS.md`).
- **Playdate Heads-Up** (web only): pre-meetup briefing from the other dog's declared flags (`PlaydateHeadsUpCard.tsx`).
- **Playdate Payout**: post-date star rating + "would meet again", feeding a server trust score; then a shareable **Playdate Memory Card** (`PlaydateRatingModal.tsx`, `PlaydateMemoryCard.tsx`, `onRatingCreated` in `firebase/functions/src/index.ts`).

### Gaps
- Whether `trustScore` is shown to users anywhere was not verified.
- `PRODUCTION-LAUNCH-CHECKS.md` says mobile guest mode "must be reworked before it ships".

## Fun and engagement

### Takeaway
A large set of single-player, share-card toys exists already; most new "fun card" ideas would duplicate something here.

### Cited Findings
- **The Playroom** hub: `web/app/app/fun/page.tsx`, `mobile/app/fun/playroom.tsx`.
- AI generators (Gemini Flash, all free, both): **Roast My Dog** (25/day), **Notes-App Apology** (25/day), **Texts From Your Dog** (6/week), **My Human: A Review** (client-gated to roughly quarterly), **Gotcha Day Letter** (appears only near a real birthday/Gotcha Day, cached per occasion) (`web/app/api/ai/{roast,apology,texts,human-review,letter}/route.ts`). Global 2,000 calls/day cap, anonymous users rejected (`web/lib/aiGuard.ts`).
- Non-AI toys: **Who actually knows {dog}?** pass-the-phone quiz (`shared/dogQuiz.ts`); **Employee of the Month** plaque, rotates monthly (`shared/plaque.ts`); **Wanted Poster** (`shared/wanted.ts`); **Adventure Passport** bucket list of real-world quests, self-stamped (`shared/adventures.ts`); **Snoot Boop** tap toy with milestone titles at 10/50/150/500/1,500 (`web/lib/boops.ts`); **Sticker Studio** (earned decals on photos); **Barkle** daily breed Wordle, public (`web/app/barkle/page.tsx`, `shared/barkle.ts`).
- Profile surfaces: **Dog Trading Card**, **Vibe Type card**, **Dogtype card**, **Life Stage card** (size-aware cohort averages), **Milestones card** (birthday, Gotcha Day, app anniversary), **Earned Stickers**, cover-photo focal editor (`web/app/app/profile/page.tsx`).
- **Reveal Explorer** ("Who does {dog} get along with?"): top Dogtype match free; others locked behind **keys** earned by Snoot Boop milestones or invites; includes a real per-type dog census (`CompatExplorer.tsx`, `web/lib/revealUnlocks.ts`, `dogtypeCounts.ts`). Two-dog compare card: `DogtypeCompatCard.tsx`.
- **Handoff Card** (web only): one image for a sitter/walker with warnings and reminders (`HandoffCard.tsx`).
- **Household**: invite a partner/sitter onto the dog's account by code (`HouseholdSection.tsx`, `web/app/app/household/join/page.tsx`, callable functions).

### Gaps
- No file contains a "Ka-too letter" label that I found; presumably the Gotcha Day Letter rendered for a dog of that name (inferred).
- Keys, boops, passport stamps and quiz results are device-local storage only: no sync, and an "invite" key is recorded on share, not on a friend joining.

## Sharing and viral mechanics

### Cited Findings
- Every card exports to PNG and uses the native share sheet (`web/lib/shareCard.ts`, `mobile/lib/shareCard.ts`); 9:16 **Story** template (`StoryShareCard.tsx`).
- Public no-signup pages: `/quiz` (8-question Dogtype quiz), `/excuse` (Official Dog Excuse Note), `/barkle`, `/dogtype` + 16 type pages, `/compat/[code]`, `/d/[slug]` public dog page; SEO articles `/playdate-safety`, `/dog-playdates`, `/dog-socialization-tips`.
- OG images: root, `barkle`, `quiz`, `dogtype/[code]`, `compat/[code]`, `d/[slug]` (`opengraph-image.tsx` files).
- **Recruit Card**: empty-deck invite sharing the user's own dog card (`web/app/app/page.tsx`, `mobile/app/(tabs)/discover.tsx`).

### Inferences
- No referral program: no referral codes, attribution or rewards found (only `rel="noreferrer"` hits).

## Retention

### Cited Findings
- Push (FCM web + Expo): new match, new message, reminder due/overdue (daily job), birthday / Gotcha Day / anniversary (daily 9am job) (`firebase/functions/src/index.ts`: `onMatchCreatedNotify`, `onMessageCreatedNotify`, `sendReminderNotifications`, `sendCelebrationNotifications`). Web opt-in banner on Matches (`EnablePushBanner.tsx`).
- **Cadence** reminders: heartworm, flea/tick, rabies, booster, license, grooming, vet, custom; recurring with a completion streak (`web/lib/reminders.ts`, `RemindersSection.tsx`).
- Built-in cadences: Barkle daily, Texts weekly, Plaque monthly, Human Review quarterly.

### Gaps
- No email sending found in Cloud Functions. No app-wide daily streak; streaks exist only per reminder.

## Monetization

### Cited Findings
- **Founding Member, $39 one-time**: Stripe Payment Link; grants lifetime chat unlocks and lifetime Pro. CTA hidden until `NEXT_PUBLIC_FOUNDING_MEMBER_PAYMENT_LINK` is set (`web/lib/entitlements.ts`, `FoundingPackSection.tsx`).
- **Founding Pack number**: free server-assigned badge for the first 500 dogs (`onDogProfileCreated`).
- **goDoggyDate Pro**: $6.99/mo or $59.99/yr, 7-day trial (`shared/pro.ts`). Checkout gated by `NEXT_PUBLIC_PRO_ENABLED`; otherwise shows "Coming soon". `ProUpsellCard.tsx` states no Pro-exclusive feature is live.
- **"Coming to Pro"** (copy only): a card in the dog's voice (daily Pet Twin), Year in Dog, life-stage checklists, Legacy Vault. `shared/pro.ts` also names stage alerts and unlimited Dogtype compatibility.
- **Per-match chat unlock**: built but dormant (`CHAT_FREE_LAUNCH_MODE = true` in `shared/matchAccess.ts`); priced $0.50 now, $4.99 normally (`shared/utils/stripe.ts`); designed to switch on per ZIP at 20 dogs.

## Location and real world

### Cited Findings
- Approximate geolocation rounded to ~1.1 km; distance in miles; 50-mile default radius; "N within X mi" density line (`web/lib/location.ts`, `web/lib/discover.ts`, `web/app/app/page.tsx`).
- Playdate place is free text; one icebreaker asks about dog parks.

### Inferences
- No map view, park directory, events, group meetups or calendar export exist (no map library or such collections found).

## Obvious gaps

### Cited Findings
- **Pet Twin** is referenced in comments (`web/app/app/profile/page.tsx:869`, `api/ai/apology/route.ts`) but has no route or component.
- **Day 1 vs Day N diptych** (`DiptychSection.tsx`, both platforms) is built but mounted nowhere.
- `DogProfileForm.tsx:676` TODO: saved rabies expiry does not seed a Cadence reminder.
- Mobile lacks Handoff Card, Playdate Heads-Up, Today panel, Excuse Note and the no-signup quiz (no such files in `mobile/`).
