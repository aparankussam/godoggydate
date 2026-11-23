# Profile redesign and Dogtype discovery

Date: 2026-11-23 · Status: design, awaiting approval

Mockups (the visual source of truth, private until shared):
https://claude.ai/artifact/2vCcBVpDfScKDduEzixVyA

| Board | What it shows |
|---|---|
| Profile · About / Dates / Dogtype / Care | The new Profile tab, one board per section |
| Playroom (new tab) | The fifth tab |
| Match moment · Dogtype revealed | The match screen when the other dog's type is new to you |
| Reveal Explorer · 2 of 16 discovered | The Dogtype section, clickable (tap tiles) |
| Website · Dogtypes page, names hidden | godoggydate.com/dogtype |
| Website · shared Dogtype page | godoggydate.com/dogtype/EROB, the page a shared link opens |

The example dog is Mochi (The Zoomie Menace, EROB). Mochi matched with Biscuit
(The Social Butterfly, EGOB).

## Why

**Profile.** This comes from testing TestFlight build 38. The Profile tab is one long
scroll. National Dog Day sits right under the photo, the name, breed, age and
neighborhood appear twice, and games, care tools and account settings are mixed together.
The owner asked for a summary at the top, a horizontal menu of sections under it, and
Playroom as its own tab next to Discover, Pack Day and Matches.

**Dogtype.** Today the Reveal Explorer names your dog's best-match types up front and
unlocks more with Snoot Boops or invites. The website lists all 16 types by name. The
owner wants the 16 types to be a mystery you uncover by matching:

- You always know your own dog's type.
- Any other type shows up only when your dog and a dog of that type mutually match. At
  that moment you see who that dog is and how it gets along with yours.
- The app teases that more types are hidden, and gives no clue to which ones.

The goal is to make swiping and matching feel like collecting, and to make each match
reveal something.

## Goals

1. Profile: one summary (nothing repeated), a section menu (About, Dates, Dogtype,
   Care), Share and Settings buttons up top, and one pink action per section.
2. A fifth tab, Playroom, holding every game and keepsake that used to live on Profile.
3. A Dogtype collection: "N of 16 discovered", where only types you have met show a
   name.
4. A reveal on the match screen: the other dog's type, how the two get along, and a
   tease of how many are still hidden.
5. No other type's name anywhere in the app or on the website until you've met it.

## Non-goals

- Changing how a Dogtype is computed, or the 16 types themselves.
- Changing matching, ranking or Discover. Swipe cards and the details sheet still show
  no Dogtype.
- Redesigning the website's own profile page layout. It only swaps its explorer (see B7).
- The reveal card on the website's match screen (a follow-up). Website users still
  collect types (B2) and see them in the collection.
- Android-specific work.
- A shareable "our two dogs" card after a match.

## Anti-goals (a failure even if everything technically works)

- Any screen, page, image or share preview that names, pictures or hints at a type you
  haven't met. That includes emoji, icons, initials, per-type dog counts, a tile's
  position that maps to a fixed type, "plays well with" lists, and copy that uses a
  type's name as a phrase (today's "Two social butterflies" line in `dogtypeCompat`).
  The one exception, the owner's decision, is The Zoomie Menace as the sample on the
  app's welcome screen and the website homepage (B9).
- A type disappearing from your collection once you've seen it.
- A wave of reveal pop-ups on the first launch for matches people already have.
- Compatibility shown as a number or percentage. It stays a playful vibe, not a verdict.

## Constraints and facts the design rests on

- iPhone app: Expo / React Native in `mobile/`, expo-router tabs in
  `mobile/app/(tabs)/_layout.tsx`. Website: Next.js in `web/`. Backend: Firestore plus
  Cloud Functions in `firebase/functions`. Logic shared by both apps lives in `shared/`.
- The look is "Sticker Book, grown up", with tokens in `mobile/constants/theme.ts`.
  There is one pink action per screen or section.
- A Dogtype is computed on the device from the dog's profile fields
  (`computeDogtype` in `shared/dogtype.ts`). Any signed-in user can read any dog doc.
- The 16 names ship inside both apps' code. Hiding them is a promise about what screens
  show, not a secret, and that is fine for a game.
- Matches are created by the client on a mutual like. The doc id is `uidA_uidB`, and one
  dog per user (dog id = uid). `cleanupStaleMatches` deletes match docs older than 180
  days that never had a message, so matches can't be the record of what you've
  discovered.
- `users/{uid}/private/progress` already syncs playful progress between iPhone and web.
  Merges there are commutative, associative and idempotent (`shared/progress.ts`,
  `mobile/lib/progressSync.ts`, and its web twin). Discoveries reuse this.
- From the owner's CLAUDE.md: any push that touches shared or web code runs
  `npm run build` first. Vercel production is promoted by hand.

## Approaches

**Profile layout.** Option one: a single scroll with a sticky menu that jumps to each
section. Option two: a menu that swaps what's shown below it. The owner reviewed the
swap version in the mockups and approved it ("This looks good"). It keeps the screen
short and makes the summary the only thing that's always there.

**Where discovered types are saved.** The owner left this choice to me.

1. *Work it out from current matches every time.* This needs no new data. But matches
   get deleted after 180 days with no chat, blocking hides them, and if a matched dog
   edits its profile its type changes. Your collection would shrink or reshuffle, which
   is an anti-goal. Rejected.
2. *A saved list in the existing progress doc.* **Picked.** It adds one field, merges the
   same way boops and the Adventure Passport already do, works offline, and syncs iPhone
   and web. Each user's own app writes it, so someone could edit their own data to see
   names on their own screen. That's acceptable because the names are already in the
   code.
3. *A Cloud Function that writes both dogs' discoveries when a match is created.* This
   can't be tampered with and covers the side that wasn't in the app. It costs a deploy,
   a backfill job and a copy of the Dogtype logic in functions, with no difference users
   would see. It's possible later.

## Part A: Profile and the Playroom tab

### Profile, top to bottom (boards "Profile · …")

1. Title row: "Profile", then two icon buttons.
   - **Share** opens a sheet with the trading card (`DogTradingCard`) and a link to the
     dog's public page.
   - **Settings** opens a screen with Pro (`ProUpsellCard`), Sign out, Delete account,
     and the Privacy and Terms links.
2. `ModerationNotice`, only when there is one.
3. **Summary card**:
   - The cover photo; tapping it opens the existing `CoverPhotoSheet`.
   - Name, and one line: "Breed · age · sex · neighborhood".
   - An Edit button that opens `ProfileEditor`.
   - Chips: the dog's own Dogtype name, Founding #N (if any), "N% would meet again"
     (shown on the same terms as today's trust badge), and the best-friend badge if
     earned.
   - The readiness line ("Showing in Discover", or what's missing).
4. **Section menu**: About · Dates · Dogtype · Care. It opens on About. My call: it
   doesn't remember the last section; deep links can open a given section.

| Section | Contents, in order | Pink action |
|---|---|---|
| About | AI bio as a handwritten quote; `VibeTypeCard`; the basics (size, energy, vaccines, temperament, play style), which is `ProfileDetailsCard` without the name, breed, age and neighborhood rows; `LifeStageCard`; photos | none |
| Dates | "Coming up": reminders (`RemindersSection`), Pack Days you said yes to, and birthday or Gotcha Day, sorted by date; `MilestonesCard`; `PushPermissionCard` only while notifications are off | "Add a date" (new reminder) |
| Dogtype | Part B, section B5 | "Keep swiping · N to find" |
| Care | `HandoffCard`; `HouseholdSection` | "Share the handoff card" |

My calls: `VibeTypeCard` and `LifeStageCard` go under About (neither appears in the
mockup).

### Playroom tab (board "Playroom (new tab)")

A fifth tab between Matches and Profile. It starts from the existing
`mobile/app/fun/playroom.tsx`. Today that screen has quick-link tiles (Barkle among
them) plus six generators shown inline: `RoastSection`, `ApologySection`,
`TextsSection`, `HumanReviewSection`, `DogQuizSection` and `PlaqueCard`. The tab
rearranges it:

1. **Today's Barkle** moves out of the tiles into a hero at the top, with the pink "Play
   today's Barkle".
2. **National Dog Day "Day 1 vs Day N"** (`DiptychSection`) moves here from Profile,
   only when `shouldShowDiptych` says so.
3. **"More to play" grid**: the remaining quick-link tiles (Snoot Boop, Sticker Studio,
   Wanted Poster, Adventure Passport, Excuse Note), plus two new tiles that move here
   from Profile:
   - **A letter from {dog}** shows `LetterSection`. When there's no occasion coming up,
     it says when the next letter will be ready.
   - **Trading card** shows `DogTradingCard`.
4. **The six generators stay inline below the grid**, as today, under a "Make something"
   heading. My call: nothing is dropped and no new screens are needed. The mockup's grid
   showed only Roast, which was a simplification.

Earned stickers stay on Profile (Dogtype section).

### Where every current Profile piece goes

| Today | New home |
|---|---|
| Hero card: photo, cover button, name, meta, readiness, founding/trust/best-friend badges | Summary card |
| AI bio | About |
| `VibeTypeCard` | About |
| `DiptychSection` (National Dog Day) | Playroom |
| `ProfileDetailsCard` | About, without the repeated rows |
| Reveal Dogtype button and `DogtypeSection` | Dogtype section (own type row, B5) |
| `EarnedStickers` | Dogtype section |
| `CompatExplorer` | Replaced by the collection (B5) |
| `LifeStageCard` | About |
| `MilestonesCard` | Dates |
| `LetterSection` | Playroom |
| Playroom card | Removed (it's a tab now) |
| `PushPermissionCard`, `RemindersSection` | Dates |
| `HandoffCard`, `HouseholdSection` | Care |
| `ProUpsellCard` | Settings |
| `DogTradingCard` | Share sheet and Playroom grid |
| Edit profile button | Summary card |
| Sign out, Delete, legal links | Settings |

## Part B: Dogtype discovery

### B1. Rules

1. **Your own type** is always known and counts as discovered. Only your dog's current
   type counts. If a profile edit changes it, the old one goes back to "?" unless you've
   also met it through a match. My call: this stops anyone filling the collection by
   editing their profile over and over. It is the one exception to "a type never
   disappears", because you never met that type.
2. **Another type** is discovered when your dog and a dog of that type mutually match.
   Before that, its name, sticker, tagline and description never appear for you.
3. **Discoveries are permanent.** Each remembers the first dog it came through and the
   date. Unmatching, blocking or the 180-day cleanup doesn't remove it.
4. **Matches people already have count.** They are added quietly on first launch of the
   new version, with no pop-ups.
5. **Undiscovered types appear only as identical blank slots.** The count still hidden
   (16 minus discovered) may be shown. Nothing else about them may be.
6. **A matched dog with no Dogtype yet** (an unfinished profile) gives no reveal at the
   match. Its type is added the next time your matches load after its profile is
   finished. It then behaves like any discovery you weren't there for (B4): a "New
   Dogtype" tag on the Matches row, and the reveal sheet the next time you open that
   match.
7. **The quiz never counts.** Website quiz results don't add to anyone's collection.
   Retaking the quiz shows other type names, which the owner has already accepted.
8. **Types the old explorer named don't carry over.** The old explorer showed best-match
   recommendations, not dogs you met, so on first launch everyone starts from their own
   type plus the matches they already have. My call: today's users are TestFlight
   testers.

### B2. Data: `dogtypes` in the progress doc

Add a field to `users/{uid}/private/progress`, in `shared/progress.ts`:

```ts
dogtypes: {
  [code: string]: {          // 4-letter code, /^[EZ][RG][OS][BM]$/
    at: number;              // ms epoch of discovery (match createdAt when known)
    dogId: string | null;    // the dog it came through; null for your own type
    dogName: string | null;
    seen: boolean;           // the reveal has been shown
    own?: boolean;           // this is (or was) your own dog's type
  }
}
```

- **Merge, per code:** the earliest `at` wins. `dogId` and `dogName` come from the
  earliest entry that has a dog (ties broken by `dogId`). `seen` and `own` are true if
  either side is. Unknown codes are dropped, and there are at most 16
  entries. Validate with the regex, because `shared/progress.ts` deliberately imports
  nothing.
- **Written by each user's own app**, at three moments:
  1. On a live match in Discover, before the match screen shows.
  2. When the Matches list loads, compute each matched dog's type from the dog data
     already loaded and add any that are missing. This also covers matches the other
     person completed while you were away.
  3. On Profile load, for your own type. Mark this entry `own: true`. When your type
     changes, the old own entry is removed unless it also has a `dogId`. The merge keeps
     `dogId` from whichever side has one.
- **First launch:** if the progress doc has no `dogtypes` field yet, everything found in
  that first fill is saved with `seen: true`, so no pop-ups appear.
- **Retire** `mobile/lib/revealUnlocks.ts` and its web twin; the `unlocks` field stays in
  the doc but nothing reads it. Also retire `lib/dogtypeCounts` usage in the explorer.

### B3. How they get along

Add a shared function, `dogtypeReasons(aCode, bCode)`, next to `dogtypeMatchScore`. It
returns one line for each part of the score that moved: ✓ for +1, ! for −1, ✓ lines
first. The vibe tier and headline still come from `dogtypeVibe` and `dogtypeCompat`.

| Part of the score | When | Mark | Example line (the builder writes final copy) |
|---|---|---|---|
| Energy | different | ✓ | "One brings the zoomies, the other the calm." |
| Energy | both high | ! | "Two high-octane engines. Supervise the zoomies and take breaks." |
| Play | same | ✓ | "They play the same way, so the game just works." |
| Social | both outgoing | ✓ | "Both love meeting new dogs, so the hello is easy." |
| Social | both selective | ! | "Both are picky about friends. Go slow with the intro." |
| Spirit | different | ✓ | "A bold one and a softie round each other out." |
| Spirit | both bold | ! | "Two bold personalities. Give them room to sort out who leads." |

Copy never uses a type's name, so also reword "Two social butterflies" in
`dogtypeCompat`.

### B4. Match moment (board "Match moment · Dogtype revealed")

Shown in `MatchModal` (`mobile/components/MatchModal.tsx`). The mockup's "It's a match!"
heading stands in for what's really there. Everything already on that screen stays as
it is:

- the "MUTUAL WOOF" or "READ FIRST" stamp and "You both said WOOF.";
- the two photos;
- the numeric fit sticker and its reasons (a real dog-to-dog score, separate from the
  Dogtype vibe);
- the "Before you meet" or "Why this pairing needs care" slip;
- the acknowledgement that a blocked pairing needs before "Say hi".

Placement, my call:

- **A normal pairing:** the reveal card goes between the fit sticker and the "Before you
  meet" slip.
- **A blocked pairing (READ FIRST):** the reveal card goes after the slip and the
  acknowledgement, so the safety content is read first. Its vibe chip and reason lines
  still show, because they come from the Dogtypes, not the safety read.

The card itself:

- **The other dog's type is new to you:**
  - Eyebrow "New Dogtype discovered" and an "N of 16" chip.
  - The type's sticker, then "Biscuit is / The Social Butterfly / tagline", then the
    description.
  - "How they get along with Mochi": the vibe chip, then the B3 lines.
  - The tease strip: "M Dogtypes still hidden", 16 segments (discovered filled, the rest
    dashed), "Each new match could uncover the next one."
  - Buttons: pink "Say hi to Biscuit", paper "Keep swiping".
- **A type you've already met:** same card, eyebrow "A Dogtype you've met", with no
  "new" chip. The tease strip stays.
- **The same type as your dog:** "Biscuit is a Zoomie Menace too", plus how they get
  along.
- **No Dogtype:** today's match screen, unchanged.
- **The person who wasn't there for the live match** (the other side, or a match found
  in step 2 of B2): the Matches row says "New Dogtype" instead of "New match". The first
  time they open that match's profile or chat, the same card opens as a sheet. After
  that, `seen` is set. The sheet holds only the reveal card. Safety content stays where
  it is today for that person.
- **Which discoveries get a sheet:** any discovery with `seen: false`. The first-launch
  fill is saved as seen, so it never produces sheets.

### B5. Dogtype section (board "Reveal Explorer · 2 of 16 discovered")

1. **Own type row:** sticker, "Mochi is / The Zoomie Menace / tagline", and a share icon
   that opens the existing `dogtype-reveal` card.
2. **Collection card:**
   - "Reveal explorer", "N of 16 Dogtypes discovered", "Match with a dog to see their
     Dogtype. The other M stay a mystery until then.", and a progress bar.
   - A 4×4 grid. Discovered tiles come first in the order they were discovered (your own
     type first), then identical "?" tiles. Tapping a tile opens a panel under the grid:
     - Discovered: "Discovered through Biscuit · Nov 23", the vibe with your dog, one B3
       line, and a paper "Open chat with Biscuit" only if that match still exists.
     - Your own: "That's Mochi" and the description.
     - Hidden: "Still hidden. Match with a dog of this type and it's yours to see. No
       hints, no peeking."
3. **Pink "Keep swiping · M to find"** opens Discover. Once all 16 are found, the heading
   becomes a celebration and the pink button goes away. The builder chooses the
   celebration.
4. **Earned stickers** below.

### B6. Matched dog's profile

On `mobile/app/dog/[matchId].tsx`, under `VibeTypeCard`, show their Dogtype and how they
get along with yours. Reuse the B4 card body without the tease strip. This screen only
opens for dogs you've matched, so it can't leak.

### B7. Website

| Page | Change |
|---|---|
| `/dogtype` (`web/app/dogtype/page.tsx`) | Becomes the teaser on the "Website · Dogtypes page" board: 16 identical blanks with no names or emoji, "How you meet the other 15", pink "Find your dog's Dogtype" (quiz), and "Get the app". It stays in Google, with title and description rewritten without names. |
| `/dogtype/[code]` | Keeps that one type: hero, the four traits, "What makes a …". Removes "Plays well with" and "All 16 Dogtypes", and adds the "15 more Dogtypes are out there" strip with the quiz and app buttons. Marked noindex and removed from the sitemap. The page and its link-preview image stay, because shared links need them. |
| `/compat/[code]` and its image | Permanent redirect to `/dogtype/[code]`. Removed from the sitemap. |
| Quiz result (`web/components/DogtypeQuiz.tsx`) | Remove the "Would our dogs get along?" share button; keep sharing your own type. |
| Quiz link-preview image (`web/app/quiz/opengraph-image.tsx`) | Swap the 8 type emojis for paws. |
| Website profile (`web/components/DogtypeSection.tsx`) | Swap `web/components/CompatExplorer.tsx` for the B5 collection, reading the same progress doc. The website also adds discoveries when its matches list loads (B2 step 2). |
| `web/app/sitemap.ts` | Drop the 32 `/dogtype/*` and `/compat/*` URLs. |

In the iPhone app, also remove the explorer's "Browse all 16 Dogtypes" link and its links
to `/compat` and other types' pages. Links to your own type's page stay.

### B8. Analytics

Update `ANALYTICS-EVENTS.md`. Retire the `compat_explorer_*` unlock and browse events.
Add events for:

- a discovery, with `source`: live, matches or first_fill;
- the reveal shown, with `context`: modal or sheet;
- a collection tile tap, with whether it was discovered.

Never send the type code in an event for an undiscovered tile. The builder chooses the
event names.

### B9. Names that show before any match

- **The sample stays (owner's decision):** the welcome screen's sample card
  (`mobile/app/welcome.tsx`, around line 186) and the website homepage hero
  (`web/app/page.tsx`, around line 138) keep "The Zoomie Menace". It's the one public
  example of what a Dogtype looks like.
- **The "Social butterfly 🦋" temperament option is relabeled:** it shows as "Loves every
  dog 🎉" (the builder can pick the final wording, but it must not echo a type name or
  emoji). It appears in `mobile/components/ProfileEditor.tsx:71`,
  `web/components/DogProfileForm.tsx:46` and `shared/data/seedDogs.ts`, and on any card
  that lists temperament.
  - Dog docs that already store the old value aren't changed.
  - A shared display helper shows both the old and new values as the new label, and the
    form shows the old value as selected under the new label.

## Build order (recommended)

Each step can ship on its own (a TestFlight build, or a website deploy and promote).

1. **Shared logic:** `dogtypes` merge in `shared/progress.ts` and `dogtypeReasons`, with
   tests.
2. **iPhone Part B:** discovery writes, match moment, Dogtype collection (dropped into the
   current Profile in place of `CompatExplorer` until Part A lands), and the matched-dog
   profile.
3. **Website Part B:** the pages, redirects, sitemap, website collection. Run
   `npm run build`, deploy, then promote on Vercel.
4. **iPhone Part A:** Profile sections, Share and Settings, and the Playroom tab.

## Testing

- **Unit, `node --test` on `shared/progress.ts`:** `dogtypes` merges are commutative,
  associative and idempotent; the earliest `at` wins with its dog; `seen` is true if
  either side is; bad codes are dropped; the 16-entry cap holds.
- **Unit, `dogtypeReasons`:** for all 256 pairs, the ✓ and ! lines add up to
  `dogtypeMatchScore`. No reason or compat string contains any type name.
- **No-leak checks on the website:** render `/dogtype` and assert none of the 16 names or
  emojis appear. Render `/dogtype/EROB` and assert only EROB's name appears. Assert
  `/compat/EROB` redirects and the sitemap has no type URLs.
- **On a phone (TestFlight):**
  - A live match with a new type, a known type, the same type as yours, and no type.
  - The other side opening the match later.
  - First launch with existing matches (no pop-ups, collection filled).
  - A discovered type survives a block.
  - Changing your own dog's type hides the old one unless you've met it.
  - A blocked (READ FIRST) pairing still shows the safety slip and its acknowledgement
    before the reveal.
  - Tile order stays as discovered.

## Left to the builder

- Final copy for the reason lines, the hidden-tile message and the all-16 celebration.
- Sticker art per type (the current emoji in a sticker circle is fine), and the reveal
  animation.
- The Playroom tab icon.
- Analytics event names.
- How the Share sheet and Settings screen are built: a native sheet or pushed screens.

## Addendum 2026-11-23 (after build 39 testing): decisions, not yet built

Owner feedback from TestFlight and walking the mockups. Nothing below is built; the owner said not to build until told.

### A1. Photo thumbnails (built on branch `claude/thumbnails-under-cover`)
The photo thumbnail strip and the cover-photo controls ("Make this the cover photo", "Adjust the crop") sit directly under the cover photo in the Profile summary card, as in build 38. They are not in About.

### A2. Dogtype section: collapsed card, compact collection, type panel
1. **Collapsed Dogtype card first.** Sticker, type name, tagline, and the four trait chips as the glimpse, plus a "See {name}'s full Dogtype" row. Tapping expands in place: full description, shareable card, Share, Share as Story, Replay reveal, "How we read this". It is collapsed on every new visit (no remembered state). The separate "Reveal {name}'s Dogtype" button is removed; the first tap still plays the reveal animation.
2. **Compact collection.** Two rows of four tiles (8) by default, smaller tiles. Discovered types first, then identical "?" tiles. "Show all 16" / "Show fewer" toggles the other 8. Progress bar and "N of 16" stay on top.
3. **Tapping a discovered tile (own type included) opens a bottom sheet:** sticker, name, tagline, full description, four trait chips; "How they get along with {name}" (vibe chip and ALL reason lines); "Your matches of this type (N)" listing every currently matched dog of that type (photo, name, breed; tap opens their profile). The list is computed from current matches each time the sheet opens, because the ledger keeps only the first dog per type. Blocked, unmatched or cleaned-up matches drop off the list; the type stays discovered. A hidden tile still says "Still hidden. No hints, no peeking."
4. Section order: collapsed Dogtype card, compact collection, earned stickers.

### A3. Playroom (decided with the owner)
1. **Today's Barkle** stays alone at the top (pink "Play today's Barkle").
2. **"Zoomies"** (games and keepsakes), one row each with a small preview or a real number from the owner's own data, never made up. Tapping a row opens that game or card. Rows: Snoot Boop (boop count and next sticker), Sticker Studio (stickers earned), Wanted Poster (tiny poster), Adventure Passport (stamps of total), Excuse Note (a sample line), A letter from {name} (next occasion, or when it will be ready), Trading card (tiny card), and last, National Dog Day "Day 1 vs Day N" as a collapsed row that expands in place when `shouldShowDiptych` is true.
3. **"Treat Lab"** (the generators): Roast, Notes-App Apology, Texts, My Human Review, the dog quiz and the Plaque, one line each with a short glimpse. Tapping expands that generator in place, one at a time (accordion). All collapsed on every visit. Generators still call their AI routes only on an explicit tap inside the expanded view.
4. The earlier inline "letter" and "trading card" panels in the grid are replaced by these rows.

### Open for the builder
Preview art per Zoomies row, the exact glimpse copy per Treat Lab row, and the Playroom row icons.
