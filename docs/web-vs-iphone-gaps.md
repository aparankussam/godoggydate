# Web vs iPhone app: feature gaps

Audit of 17 Nov 2026, against commit b99411a (TestFlight build 30).

## Status (branch `claude/iphone-parity`)

**Lists A and B are built.** They have not yet been tested on a device. Known leftovers:

- **A3.**
  - The server-side filter needs a functions deploy.
  - Profile owners aren't told when the server clears a field; only ops is alerted.
- **A11.** Revoking Apple tokens needs the Apple provider's OAuth code flow set up in the Firebase console. Until then the app logs the failure and deletes the account anyway.
- **A12 and push in general:**
  - The `aps-environment` entitlement was missing, and has been added.
  - Push also needs an APNs key in the EAS credentials.
  - Check on TestFlight that a push token is issued.
- **B1.**
  - The Pack Day start-time chips cover 6 AM to 9:45 PM.
  - After signing in, people aren't taken back to the event they came from.
- **B4.** The Today panel's nudges open the Profile tab, not the editor's exact section.
- **B9.**
  - Links were added to the trading card, Dogtype, letter and milestone shares.
  - The other Playroom shares still send only the image, though the URL is printed on the card.
- **B10.** Universal links need the website deployed (it serves `/.well-known/apple-app-site-association`) and a new native build.

Lists C, D and E are untouched, apart from E1's report evidence, which is done.

**Method.** Each feature was compared on both sides by reading what the user can actually do, not by file names. The most serious findings were then spot-checked by hand:
- the 200-message chat limit
- report/block missing from Discover and the dog page
- no 18+ checkbox
- the 1-mile distance default

**Already intentional, and not counted as a gap:** iPhone hides every purchase button.

**Size key:**
- **S:** under about 100 lines
- **M:** about one screen
- **L:** several screens

Server work is called out where it's needed. Everything else is app-only.

## A. Fix before launch (iPhone safety, App Store review, bugs)

| # | Problem | Size |
|---|---|---|
| A1 | You can report or block someone only from inside a chat. Discover cards and the matched dog's page have no report/block button. Apple guideline 1.2 expects both. | S |
| A2 | There's no 18+ / Terms checkbox at iPhone sign-in, and no acceptance record is saved. Web saves `ageConfirmed18`, `termsAcceptedAt` and `termsVersion`. | S |
| A3 | Nothing filters objectionable text in chat, profiles or Pack Day, on **either** platform. Apple 1.2 asks for a filter. | M (server) |
| A4 | The chat loads the *oldest* 200 messages (`orderBy asc` + `limit(200)`). After 200 messages, new ones never appear on iPhone. | S |
| A5 | The match pop-up always celebrates. It has no "safety mismatch" version and doesn't put warnings first. It also has no vaccination line, no "owners typed this" note, and no link to the first-meeting safety guide. | M |
| A6 | Swipe cards show only the first 2 safety warnings, and have no vaccination pill. | S |
| A7 | A dog with no location is scored as if it were 1 mile away, which inflates the fit score. The "dogs near you" line also counts these dogs as nearby. Web fixed both. | S |
| A8 | The "How did it go?" rating appears as soon as a playdate is confirmed, before it happens. The rating feeds the other dog's trust score. | S |
| A9 | Playdate date and time are typed as free text on iPhone (for example "Sat, July 12"), and web misreads them as always upcoming or always past. Fixing this needs a date picker, which is a new native package, so a new build. | S–M |
| A10 | A failed swipe save can leave the deck stuck. | S |
| A11 | Two account-deletion issues:<br>• iPhone says purchases aren't refunded, which contradicts the Terms (14-day refunds).<br>• Sign in with Apple tokens aren't revoked when an account is deleted. Apple asks apps to do this. Revoking them needs the Apple private key and server work. | S + M (server) |
| A12 | iPhone asks for push permission right after sign-in, with no explanation. iOS allows only one ask, and if the user says no, nothing later shows how to turn notifications back on. | S |
| A13 | Tapping a reminder or Pack Day notification only opens the app; it doesn't go to the right screen. | S |
| A14 | Small bugs:<br>• The Wanted poster alias differs between web and iPhone.<br>• The Adventure count can go past the total.<br>• The matched dog page spins forever when signed out.<br>• The chat report button silently does nothing until the match loads. | S |
| A15 | Latent: the iPhone chat paywall has an "Unlock on godoggydate.com" link that the iPhone purchase rule doesn't hide. It can't appear while chat is free. | S |

## B. Missing on iPhone: core features

| # | Feature | Size |
|---|---|---|
| B1 | Pack Day: the list, create and event screens, a tab, and push routing. The backend is ready. | L |
| B2 | Vibe Check ("Fill this in from the photos") in the profile editor. The API route already accepts iPhone calls. | M |
| B3 | Profile editor: temperament and the 3 prompts can't be edited. The progress checklist, energy slider and breed suggestions are also missing. | S each |
| B4 | Today panel: reminders due, safety-notes nudge, Founding number, safety guide link. | M |
| B5 | Playdate Heads-Up card in chat (the two dogs' risks, vaccination, the "what they see about you" mirror), plus a link to the safety guide. | M |
| B6 | Swipe details sheet: photo gallery, vaccination, distance, temperament, prompts, breed guess. | M |
| B7 | Unread counts on the tab bar. | S |
| B8 | Chat and match list polish:<br>• timestamps on messages<br>• photo and breed in the chat header<br>• starter prompts<br>• who sent the last message<br>• a "New match" pill<br>• sorting by latest activity | S |
| B9 | Shares carry no link, and there's no "View public page". The dog-page link helper (`dogSlug`) needs porting. | S |
| B10 | Household:<br>• A person invited who has no dog of their own can't use the iPhone app.<br>• Invite links open the website instead of the app. Fixing that needs universal links: a file on the website plus a new build. | M |
| B11 | The Discover deck doesn't refresh when you return to the tab. | S |

## C. Missing on iPhone: extras

| # | Feature | Size |
|---|---|---|
| C1 | Excuse Note | M |
| C2 | Handoff care sheet for a sitter or walker | M |
| C3 | Dogtype "Share as Story" (9:16) | M |
| C4 | Cover photo focal-point crop | M |
| C5 | Earned stickers on the profile, and picking from the dog's own photos in Sticker Studio | S |
| C6 | Compatibility bars in the match pop-up | S |
| C7 | Profile details card and account email | S |
| C8 | Snoot sound, which needs an audio package (so a new build) | S |

## D. Missing on web (the iPhone has it)

| # | Feature | Size |
|---|---|---|
| D1 | Sign in with Apple. Also needs you to set up the Apple provider in the Firebase console. | S |
| D2 | Like a dog from the details sheet | S |
| D3 | Wanted poster: upload a new mugshot | S |
| D4 | Barkle result image | S–M |
| D5 | Share button on the Dogtype reveal | S |
| D6 | Unread dot on each thread in the messages list | S |
| D7 | Reporting shows "submitted" even when the save failed | S |

Guest mode (try the app without an account) stays iPhone-only on purpose.

## E. Both platforms

| # | Issue | Size |
|---|---|---|
| E1 | Pack Day reports don't record which event, so a moderator can't see it. There's also no moderator take-down. | S + M (server) |
| E2 | Boops, stickers, adventures, Barkle and unlocks are saved per device, so they don't sync between web and iPhone. | M–L (server) |
| E3 | The Day 1 vs Day N card is built on both but shown on neither. | S |
| E4 | The Excuse Note isn't linked from either Playroom. | S |

## Needs a new iPhone build because of native changes

A9 (date picker), C8 (audio), B10 (universal links). Everything else is JavaScript, but it still ships in the next EAS build.
