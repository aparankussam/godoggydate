# GoDoggyDate logo and app icon (design)

Date: 2026-11-25 · Size: small change

## Intent

Replace the placeholder brand marks (white paw on orange, blank cream mobile icon) with the owner's finalized artwork. The artwork stars Kaju, the owner's copper mini dachshund. It should feel fun and dog-friendly and use the website's colours.

## Final artwork (source of truth, use exactly as supplied)

- Logo: `assets/2026-11-25-godoggydate-logo-final.webp` (1774×887). It shows pink "Go", "Doggy" drawn as Kaju's body, and yellow "Date" with dark purple outlines on sky blue.
- App icon: `assets/2026-11-25-godoggydate-app-icon-final.webp` (1254×1254). Kaju peeks over the letters "GDD", drawn inside a rounded blue tile.

- Animated logo: `assets/2026-11-25-godoggydate-logo-animated.gif` (358×267, 16 frames, 2.56 s). Kaju runs in between "Go" and "Date", boops the "Go", and becomes "Doggy"; the last frame is the full logo. The owner wants this used on the website, in video ads and anywhere the brand is shared. The static logo stays the standalone mark (headers, icons, print).

The owner decided that the artwork is not to be edited: no recolouring, no redrawing and no cropping of content.

Brand colours (from the live site): blue `#8FC9F2`, pink `#FF5C8D`, purple `#2A1F4A`, yellow `#F5B731`.

## Goals

- Mobile (Expo): set the app icon, the Android adaptive icon, the splash screen and the web favicon from the app icon artwork (`mobile/app.config.js`, `mobile/assets/*`).
- Web: replace `web/public/icons/*` (icon.svg, icon-192, icon-512, apple-touch-icon), point `web/app/layout.tsx` at the new files, and update the `theme_color` and `background_color` in `web/public/manifest.json`.
- Web header: show the static logo.
- Web hero: play the animated logo, hold on its last frame (the full logo) for about 5 seconds, then replay. It only plays while the hero is on screen. Tapping or hovering the logo replays it straight away (a "boop"). With Reduce Motion on, show the static logo instead and skip the replays. The owner chose this over a single play (loses its charm) and a non-stop loop (distracting next to the headline, and needs a pause control).

## Non-goals

- No redraw, no vector conversion and no animation. These are possible later.
- No other brand or UI colour changes beyond the manifest and splash background colours.

## Approaches considered

1. **Use the artwork as supplied, exported to the sizes each platform needs.** This is the approach the owner chose.
2. Fix the artwork first: full-bleed icon, a Kaju-only icon and a clearer "D". The owner rejected this.
3. Redraw everything as vector: sharp at every size and animatable, but a large job and a change to the art. Rejected.

## Known trade-offs the owner accepted

- The icon has its own white border and rounded corners. iOS and Android add their own rounding, so a thin white edge and doubled corners may show on the home screen.
- At favicon size (16–32px), "GDD" won't be readable.
- The animation is 358×267 at about 6 frames a second. It will look soft above roughly 360px wide on a phone's sharp screen, and it is too small for 1080px video ads; ads need a larger export of the same animation.
- ~~The logo is a raster with a blue background.~~ Superseded: after seeing it live, the owner approved removing the flat sky-blue background from the website logo and animation, so both sit directly on the page's blue gingham like stickers. Only the background is removed; Kaju, the letters and the colours are untouched, and the soft shadow under Kaju stays. The app icons keep their tile, since icons need a solid background. Original note: it would sit as a blue panel in the header rather than as a cut-out.

## Left to the builder

- Exact export sizes per platform, and resampling (no content changes).
- The splash and adaptive-icon background colour: use the icon's blue so any padding matches.
- Where the header logo component lives, and its display size.
