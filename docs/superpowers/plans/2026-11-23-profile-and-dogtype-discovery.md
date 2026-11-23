# Profile redesign and Dogtype discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Other Dogtypes are revealed only by mutual match (collection, match-moment reveal, website with no names), and Profile becomes a summary plus About/Dates/Dogtype/Care sections with Playroom as a fifth tab.

**Architecture:** Discoveries are a new `dogtypes` field in the existing `users/{uid}/private/progress` doc (local-first, merged by `shared/progress.ts`). A pure shared function `dogtypeReasons` supplies the "how they get along" lines. iPhone and web both read/write discoveries through their existing progress-sync layers.

**Tech Stack:** Expo/React Native (expo-router), Next.js (web), Firestore, `node --test` on `shared/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-11-23-profile-and-dogtype-discovery-design.md` (mockups: https://claude.ai/artifact/2vCcBVpDfScKDduEzixVyA). Section ids below (A…, B1–B9) refer to it.

## Global Constraints

- Run shared tests with `node --test shared/progress.test.ts shared/dogtype.test.ts` (Node strips types; `shared/progress.ts` must keep **no imports**).
- Before any push touching `shared/` or `web/`: `npm run build` in `web/`, plus typecheck in `web/` and `mobile/` (user CLAUDE.md).
- No screen, page, image or share preview may name, picture or hint at a type the user hasn't met. Exception: "The Zoomie Menace" sample on `mobile/app/welcome.tsx` (~186) and `web/app/page.tsx` (~138).
- Look: "Sticker Book, grown up" tokens in `mobile/constants/theme.ts`; ONE pink action per screen/section; reuse `mobile/components/pack/kit` and `mobile/components/sticker`.
- Compatibility is a vibe tier, never a number or percent.
- Type code regex: `/^[EZ][RG][OS][BM]$/`; max 16 entries.
- Commit after each task. Trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Malformed/duplicate/oversized `dogtypes` input to the normalizer (bad codes, >16, non-numbers) → dropped, never throws.
2. Two devices syncing in any order → identical result (commutative, associative, idempotent).
3. A matched dog with no/unfinished profile → no reveal, no crash, picked up later.
4. First launch with existing matches → all saved `seen: true`, zero pop-ups.
5. Blocked ("READ FIRST") pairing → safety slip and acknowledgement still gate "Say hi"; reveal after them.

---

### Task 1: Shared `dogtypes` progress field

**Files:** Modify `shared/progress.ts`; Test `shared/progress.test.ts`

**Interfaces — Produces:**
```ts
export interface DogtypeDiscovery { at: number; dogId: string | null; dogName: string | null; seen: boolean; own?: boolean }
export type DogtypeLedger = Record<string, DogtypeDiscovery>;
export const DOGTYPE_CODE_RE: RegExp;
export function normalizeDogtypes(raw: unknown): DogtypeLedger | undefined;
export function mergeDogtypes(a?: DogtypeLedger, b?: DogtypeLedger): DogtypeLedger | undefined;
export function addDiscovery(ledger: DogtypeLedger | undefined, code: string, d: Omit<DogtypeDiscovery,'seen'|'own'> & { seen?: boolean; own?: boolean }): DogtypeLedger;
export function setOwnType(ledger: DogtypeLedger | undefined, code: string, at: number): DogtypeLedger; // adds own:true entry; strips own entries for other codes that have no dogId
export function markSeen(ledger: DogtypeLedger | undefined, code: string): DogtypeLedger;
export function discoveredOrder(ledger: DogtypeLedger | undefined): string[]; // codes by `at` asc, own type first on ties
```
`ProgressDoc` gains `dogtypes?: DogtypeLedger`; `progressKeys.dogtypes(uid) = godoggydate.dogtypes.${uid}`.

- [ ] **Step 1: Failing tests** in `shared/progress.test.ts`: `normalizeDogtypes drops bad codes, non-finite at, and caps at 16`; `mergeDogtypes keeps earliest at, dogId/dogName from earliest entry with a dog, seen/own OR'd`; `mergeDogtypes is commutative, associative, idempotent` (3 sample ledgers, all orderings); `setOwnType removes old own entry without dogId but keeps one with dogId`; `discoveredOrder lists by at ascending`; `mergeProgress and normalizeProgress carry dogtypes`.
- [ ] **Step 2:** Run `node --test shared/progress.test.ts` → FAIL (missing exports).
- [ ] **Step 3:** Implement the functions above following the `normalizeAdventures`/`mergeAdventures` pattern (use `toTimestamp`, `toText`, `compact`). Wire `dogtypes` through `ProgressDoc`, `normalizeProgress`, `mergeProgress`, `readLocalProgress` (read `progressKeys.dogtypes(uid)`, local format = the ledger object itself), `mergeIntoLocalProgress` (`mergeFeature` with identity `toLocal`). Update the header comment's merge list.
- [ ] **Step 4:** Run tests → PASS. Run full `node --test shared/*.test.ts`.
- [ ] **Step 5:** Commit `feat(shared): dogtypes discovery ledger in progress doc`.

### Task 2: `dogtypeReasons` and name-free compat copy

**Files:** Modify `shared/dogtype.ts` (near `dogtypeMatchScore`, and `dogtypeCompat` ~line 354); Test `shared/dogtype.test.ts`

**Interfaces — Produces:**
```ts
export interface DogtypeReason { mark: 'good' | 'care'; text: string }
export function dogtypeReasons(aCode: string, bCode: string): DogtypeReason[]; // good first; [] for malformed codes
```
One reason per score component that moved, per spec B3 table (good: energy differs, play same, both outgoing, spirit differs; care: both high energy, both selective, both bold).

- [ ] **Step 1: Failing tests:** `reasons sum to match score for all 256 pairs` (good count − care count === `dogtypeMatchScore`); `EROB × EGOB gives 1 good + 2 care lines` ("Both love meeting new dogs, so the hello is easy." first); `no reason or dogtypeCompat string contains any TYPES name or the words "butterfl"` across all pairs; `malformed → []`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `dogtypeReasons`; reword the "Two social butterflies — …" note in `dogtypeCompat` to e.g. "Two outgoing dogs — friends before the leashes are even off."
- [ ] **Step 4:** Run `node --test shared/dogtype.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(shared): dogtypeReasons, name-free compat copy`.

### Task 3: Temperament relabel (B9)

**Files:** Modify `shared/data/seedDogs.ts`, `mobile/components/ProfileEditor.tsx:71`, `web/components/DogProfileForm.tsx:46`; Create `shared/temperament.ts` + `shared/temperament.test.ts`

**Interfaces — Produces:** `export function temperamentLabel(value: string): string` — maps stored `'Social butterfly 🦋'` to `'Loves every dog 🎉'`, other values unchanged. `export const TEMPERAMENT_LEGACY: Record<string,string>`.

- [ ] **Step 1: Failing test:** legacy value → new label; unrelated values unchanged; new label unchanged.
- [ ] **Step 2:** Run `node --test shared/temperament.test.ts` → FAIL.
- [ ] **Step 3:** Implement. In both forms, show the new label in the option list and treat a stored legacy value as selecting the new option (store the new value on save). Wrap every place that renders temperament chips (grep `temperament` in `mobile/` and `web/`: cards, `ProfileDetailsCard`, matched-dog profile, `seedDogs`) with `temperamentLabel`. No data migration.
- [ ] **Step 4:** Test → PASS; grep confirms no remaining literal `Social butterfly` outside `temperament.ts`/tests.
- [ ] **Step 5:** Commit.

### Task 4: iPhone discovery service

**Files:** Create `mobile/lib/dogtypeDiscovery.ts`; Modify `mobile/lib/progressSync.ts`, `mobile/lib/matches.ts`; Delete `mobile/lib/revealUnlocks.ts`, `mobile/lib/dogtypeCounts.ts` (after Task 6 removes their last users — delete in Task 6)

**Interfaces — Consumes:** Task 1 functions. **Produces:**
```ts
export async function loadDiscoveries(uid: string): Promise<DogtypeLedger>;
export async function discoverOwnType(uid: string, ownCode: string): Promise<void>;
export async function discoverFromMatch(uid: string, d: { code: string; dogId: string; dogName: string; at: number; seen: boolean }): Promise<{ isNew: boolean }>;
export async function discoverFromMatches(uid: string, dogs: { code: string; dogId: string; dogName: string; at: number }[]): Promise<{ added: string[] }>; // first fill (no `dogtypes` key yet) saves all seen:true; later fills seen:false
export async function markDiscoverySeen(uid: string, code: string): Promise<void>;
```
Storage via `readStoredJSON`/`updateStoredJSON` + `markProgressDirty` (as `revealUnlocks.ts` does), key `progressKeys.dogtypes(uid)`; subscribe to the sync listener so screens refresh.

- [ ] **Step 1:** Add `dogtypes` to the sync merge lists in `progressSync.ts` (mirror how `unlocks` is wired; if it only uses `shared/progress.ts` generics, nothing to add — verify).
- [ ] **Step 2:** Implement the service. First-fill rule: the key is absent/undefined ⇒ everything found is `seen: true`.
- [ ] **Step 3:** In `mobile/lib/matches.ts` loading, after matched dogs load, call `discoverFromMatches` using `computeDogtype` on each matched dog doc (skip when it returns null). Own type: call `discoverOwnType` on Profile load (Task 8 uses it; also call from the matches loader if `savedProfile` is available).
- [ ] **Step 4:** `cd mobile && npx tsc --noEmit` → no new errors.
- [ ] **Step 5:** Commit.

### Task 5: iPhone match-moment reveal

**Files:** Create `mobile/components/DogtypeRevealCard.tsx`; Modify `mobile/components/MatchModal.tsx`, `mobile/app/(tabs)/discover.tsx` (~300-420), `mobile/app/(tabs)/matches.tsx`, `mobile/app/dog/[matchId].tsx` (~225)

**Interfaces — Produces:** `<DogtypeRevealCard ownDog={{name, code}} otherDog={{name, code}} discovered={number} variant="new"|"met"|"same" showTease={boolean} />` — spec B4 layout (eyebrow "New Dogtype discovered"/"A Dogtype you've met", "N of 16" chip, sticker, "{Name} is / type name / tagline", description, "How they get along with {own}" with vibe chip from `dogtypeVibe`/`dogtypeCompat` and `dogtypeReasons` lines, tease strip "M Dogtypes still hidden" with 16 segments, no names). Mockup: board "Match moment · Dogtype revealed".

- [ ] **Step 1:** Build `DogtypeRevealCard` with theme tokens; `accessibilityLabel`s on strip and chips.
- [ ] **Step 2:** `discover.tsx`: when a live match is made and both Dogtypes compute, `await discoverFromMatch(... seen: true)` BEFORE setting `matchedDog`; pass `{isNew, variant, discovered}` into `MatchModal`.
- [ ] **Step 3:** `MatchModal`: render the card between the fit sticker and "Before you meet" slip; when `isBlocked`, render it after the slip and the acknowledgement. Absent Dogtype data ⇒ today's screen unchanged. The pink "Say hi" and paper "Keep swiping" stay the only buttons.
- [ ] **Step 4:** `matches.tsx`: row tag "New Dogtype" (instead of "New match") when that match's discovery has `seen: false`. `app/dog/[matchId].tsx` and chat open: if `seen: false`, show the card (no tease on the dog profile; with tease in the sheet) in a bottom sheet once, then `markDiscoverySeen`. On the matched-dog profile, always show the card body under `VibeTypeCard` (spec B6).
- [ ] **Step 5:** Typecheck; manual run in simulator (`mcp__Claude_Code_iOS_Simulator__control`) for a new-type, known-type, same-type, no-type and a blocked pairing. Commit.

### Task 6: iPhone collection replaces CompatExplorer

**Files:** Create `mobile/components/DogtypeCollection.tsx`; Modify `mobile/components/DogtypeSection.tsx`, `mobile/app/(tabs)/profile.tsx` (remove `CompatExplorer` import ~34 and usage ~608); Delete `mobile/components/CompatExplorer.tsx`, `mobile/lib/revealUnlocks.ts`, `mobile/lib/dogtypeCounts.ts`; Modify `ANALYTICS-EVENTS.md`

**Interfaces — Consumes:** `loadDiscoveries`, `discoveredOrder`, `dogtypeReasons`, `markDiscoverySeen`. Mockup: board "Reveal Explorer · 2 of 16 discovered".

- [ ] **Step 1:** Build `DogtypeCollection`: own-type row (sticker, "Mochi is / name / tagline", share icon → existing `dogtype-reveal`); card "N of 16 Dogtypes discovered", progress bar, 4×4 grid (discovered in `discoveredOrder`, then identical "?" tiles with `accessibilityLabel="Hidden Dogtype"` and NO type data in props); tap panels for discovered / own / hidden ("Still hidden… No hints, no peeking."); "Open chat" only if the match still exists; pink "Keep swiping · M to find" → Discover; all-16 celebration state without the pink button.
- [ ] **Step 2:** Mount it in `DogtypeSection`; remove CompatExplorer, its "Browse all 16" and `/compat`/other-type links; keep own-type page links.
- [ ] **Step 3:** Delete retired files; fix imports (grep `revealUnlocks|dogtypeCounts|CompatExplorer` in `mobile/` → none).
- [ ] **Step 4:** Update `ANALYTICS-EVENTS.md`: retire `compat_explorer_*`; add `dogtype_discovered{source}`, `dogtype_reveal_shown{context}`, `dogtype_tile_tap{discovered}` (never send code for hidden tiles); track them with the existing `trackEvent`.
- [ ] **Step 5:** Typecheck; simulator check of 2-of-16 and a hidden tile; commit.

### Task 7: Website Dogtype pages (B7)

**Files:** Modify `web/app/dogtype/page.tsx`, `web/app/dogtype/[code]/page.tsx`, `web/app/dogtype/[code]/opengraph-image.tsx` (keep), `web/app/sitemap.ts`, `web/components/DogtypeQuiz.tsx`, `web/app/quiz/opengraph-image.tsx`, `web/next.config.*` (redirect); Delete `web/app/compat/[code]/page.tsx`, `web/app/compat/[code]/opengraph-image.tsx`, `web/components/DogtypeCompatCard.tsx` (if unused); Test `web/__tests__/dogtypeNoLeak.test.*` (follow the repo's existing web test setup; if none exists, a `node --test` script over rendered HTML in `web/scripts/`)

- [ ] **Step 1: Failing no-leak test:** `/dogtype` HTML contains none of the 16 `TYPES` names/emojis; `/dogtype/EROB` contains EROB's name and none of the other 15; `sitemap()` has no `/dogtype/` or `/compat/` URLs; `/compat/EROB` resolves to a 308 redirect to `/dogtype/EROB`.
- [ ] **Step 2:** Rewrite `/dogtype/page.tsx` per board "Website · Dogtypes page": heading "16 Dogtypes. One of them is your dog.", 16 identical "?" tiles, "How you meet the other 15", pink "Find your dog's Dogtype" → `/quiz?ref=dogtype`, paper "Get the app"; metadata title/description without names; stays indexable.
- [ ] **Step 3:** `/dogtype/[code]/page.tsx`: delete "Plays well with" and "All 16 Dogtypes"; add the "15 more Dogtypes are out there" strip + two buttons; `robots: { index: false }`; keep `generateStaticParams`.
- [ ] **Step 4:** Add permanent redirect `/compat/:code → /dogtype/:code`; empty out compat pages; sitemap drops `DOGTYPE_CODES` URLs; quiz share: remove the "Would our dogs get along?" button, keep type share; quiz OG image emojis → paws (`🐾`).
- [ ] **Step 5:** Run test → PASS. `cd web && npm run build` → success. Commit.

### Task 8: Website collection

**Files:** Create `web/lib/dogtypeDiscovery.ts`, `web/components/DogtypeCollection.tsx`; Modify `web/components/DogtypeSection.tsx` (~153), `web/lib/progressSync.ts`, the web matches loader (`web/lib/matching.ts` / matches page — find where matched dogs load); Delete `web/components/CompatExplorer.tsx`, `web/lib/revealUnlocks.ts`

- [ ] **Step 1:** Port Task 4's service to web storage (`localStorage` via the existing web progress store) with the same signatures; call `discoverFromMatches` when the matches list loads and `discoverOwnType` on profile load.
- [ ] **Step 2:** Port the collection UI (Task 6 Step 1) with Tailwind tokens (`bg-paper`, `border-brown`, `font-display`), mounted in `DogtypeSection` in place of `CompatExplorer`.
- [ ] **Step 3:** Delete retired web files; grep clean; update analytics calls.
- [ ] **Step 4:** Typecheck + `npm run build` in `web/`; browser check via preview of the profile Dogtype section. Commit.

### Task 9: iPhone Playroom tab

**Files:** Modify `mobile/app/(tabs)/_layout.tsx`, `mobile/app/fun/playroom.tsx` → move to `mobile/app/(tabs)/playroom.tsx` (keep `/fun/playroom` as a redirect for existing links); Modify tab icon set

- [ ] **Step 1:** Register a 5th tab "Playroom" between Matches and Profile (same pill style, new glyph in `kit`'s `Glyph` set).
- [ ] **Step 2:** Rebuild the screen per spec A (board "Playroom (new tab)"): Barkle hero with pink "Play today's Barkle"; `DiptychSection` when `shouldShowDiptych`; "More to play" grid (Snoot Boop, Sticker Studio, Wanted Poster, Adventure Passport, Excuse Note, "A letter from {dog}" → `LetterSection`, Trading card → `DogTradingCard`); "Make something" heading with the six inline generators unchanged.
- [ ] **Step 3:** Update routes/`router.push('/fun/playroom')` callers (grep) to the tab. Typecheck; simulator check. Commit.

### Task 10: iPhone Profile sections, Share and Settings

**Files:** Modify `mobile/app/(tabs)/profile.tsx`; Create `mobile/components/profile/ProfileSummary.tsx`, `ProfileSectionMenu.tsx`, `ProfileAbout.tsx`, `ProfileDates.tsx`, `ProfileCare.tsx`, `ShareSheet.tsx`, `mobile/app/settings.tsx`; Modify `mobile/components/ProfileDetailsCard.tsx` (prop `hideIdentity` to drop name/breed/age/neighborhood rows)

- [ ] **Step 1:** Extract the summary card (cover + `CoverPhotoSheet`, name, "Breed · age · sex · neighborhood", Edit → `ProfileEditor`, chips: Dogtype name via `computeDogtype`, Founding #N, "N% would meet again" on today's trust-badge rules, best-friend badge; readiness line).
- [ ] **Step 2:** Build the segmented menu (About · Dates · Dogtype · Care, default About, ink pill active) and the four sections per the spec A tables: About = bio quote, `VibeTypeCard`, `ProfileDetailsCard hideIdentity`, `LifeStageCard`, photos; Dates = unified "Coming up" (reminders, Pack Days, birthday/Gotcha Day, sorted), `MilestonesCard`, `PushPermissionCard` only while off, pink "Add a date"; Dogtype = `DogtypeSection` (Task 6) + `EarnedStickers`; Care = `HandoffCard` (pink "Share the handoff card"), `HouseholdSection`.
- [ ] **Step 3:** Title row Share (→ `ShareSheet`: `DogTradingCard` + public page link) and Settings (→ `settings.tsx`: `ProUpsellCard`, Sign out, Delete account, Privacy/Terms) icon buttons; keep `ModerationNotice`. Remove the old long-scroll layout, the Playroom card, `DiptychSection`, `LetterSection` from Profile.
- [ ] **Step 4:** Verify against the "where every current piece goes" table: nothing lost (grep each old import is used once in its new home). Typecheck; simulator walk-through of all four sections, Share, Settings. Commit.

### Task 11: Verification and handoff

- [ ] **Step 1:** `node --test shared/*.test.ts` → all pass.
- [ ] **Step 2:** `cd mobile && npx tsc --noEmit`; `cd web && npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 3:** Whole-branch review against the spec's anti-goals: grep rendered web output and mobile strings for the 16 names outside `shared/dogtype.ts`, `welcome.tsx`, `web/app/page.tsx` and discovered-gated components.
- [ ] **Step 4:** Report branch status; do NOT push, build for TestFlight or promote on Vercel without the user's go-ahead.
