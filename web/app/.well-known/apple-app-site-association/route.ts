// web/app/.well-known/apple-app-site-association/route.ts
// Universal links for the iPhone app. iOS fetches this (through Apple's CDN)
// when the app is installed, and from then on opens the listed paths in the
// app instead of Safari:
//   /app/household/join?code=…  household invites -> app/household/join.tsx
//   /pack/<id>                  Pack Day events   -> app/pack/[id].tsx
// mobile/app/+native-intent.tsx maps these to the app's own routes.
//
// Apple requires this exact path, served as application/json over HTTPS with
// no redirect and no file extension. A route handler (rather than a file in
// public/) is what sets the content type; Next.js serves it statically.

export const dynamic = 'force-static';

const APP_ID = 'NM98GGH89V.com.godoggydate.app';

const association = {
  applinks: {
    apps: [],
    details: [
      {
        // iOS 13+ reads appIDs/components.
        appIDs: [APP_ID],
        components: [
          { '/': '/app/household/join*', comment: 'Household invite links' },
          { '/': '/pack/*', comment: 'Pack Day event pages' },
        ],
        // Older iOS reads appID/paths.
        appID: APP_ID,
        paths: ['/app/household/join*', '/pack/*'],
      },
    ],
  },
};

export function GET() {
  return new Response(JSON.stringify(association), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
