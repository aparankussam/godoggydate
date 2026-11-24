/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// ── Content-Security-Policy (REPORT-ONLY) ─────────────────────────────────────
// Shipped as Content-Security-Policy-Report-Only: the browser reports what the
// policy WOULD block to /api/csp-report but blocks nothing, so it cannot break
// sign-in, payments or analytics. It lists what the app actually loads today:
//   Google Identity (GSI) + gapi + Firebase Auth iframe, Firebase (Auth,
//   Firestore, Storage, Functions, FCM), Stripe, Google Analytics / GTM,
//   Firebase Storage photos, data:/blob: images (previews, html2canvas), the
//   same-origin next/og routes, and next/font (self-hosted at build time).
// Why not tighter yet: Next.js inlines its bootstrap scripts, so script-src needs
// 'unsafe-inline' until a nonce is wired through; and the Google/Firebase hosts
// are listed by family (*.googleapis.com) rather than one by one. The enforcement
// plan is in ANALYTICS-EVENTS.md ("CSP rollout").
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST?.trim();

function cspHeaderValue() {
  const dev = !isProd;
  const devHosts = dev
    ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
    : [];
  const emulator = dev && emulatorHost ? [`http://${emulatorHost}:*`] : [];
  const authHost = authDomain && authDomain !== 'localhost' ? [`https://${authDomain}`] : [];

  const directives = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []), // React Refresh in `next dev` only
      'https://accounts.google.com',
      'https://apis.google.com',
      'https://js.stripe.com',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://www.gstatic.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://firebasestorage.googleapis.com',
      'https://www.google-analytics.com',
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.g.doubleclick.net',
      'https://*.stripe.com',
      ...emulator,
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.googleapis.com',
      'https://*.cloudfunctions.net',
      'https://accounts.google.com',
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.g.doubleclick.net',
      'https://api.stripe.com',
      'https://m.stripe.network',
      'https://r.stripe.com',
      ...authHost,
      ...devHosts,
    ],
    'frame-src': [
      'https://accounts.google.com',
      'https://*.firebaseapp.com',
      'https://js.stripe.com',
      'https://hooks.stripe.com',
      'https://checkout.stripe.com',
      'https://m.stripe.network', // Stripe.js' hidden fraud-signal frame
      'https://www.googletagmanager.com',
      ...authHost,
      ...(dev ? ['http://localhost:*', 'http://127.0.0.1:*'] : []),
    ],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", 'blob:', 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", 'https://accounts.google.com', 'https://checkout.stripe.com'],
    // report-uri, not report-to: every browser honors it and it is delivered at
    // once. In a Chromium test, adding report-to (Reporting API) delayed or
    // dropped the reports entirely.
    'report-uri': ['/api/csp-report'],
  };
  // frame-ancestors is deliberately absent: browsers ignore it in a report-only
  // policy. Clickjacking protection is the X-Frame-Options header below.
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // SAMEORIGIN: nothing embeds us, and the Firebase auth iframe/popup are
  // hosted by Google/Firebase, not framed by us in reverse.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // geolocation for the local-matching feature; payment delegated to Stripe's
  // frames for wallet buttons; camera and microphone are never used.
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com")',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // No Cross-Origin-Opener-Policy on purpose: same-origin would sever the
  // window.opener link the Google / Apple sign-in popups use to hand the result
  // back to the page.
  { key: 'Content-Security-Policy-Report-Only', value: cspHeaderValue() },
];

module.exports = {
  // The app doesn't use next/image, so this keeps the optimizer endpoint, the
  // subject of several Next.js advisories, out of use.
  images: { unoptimized: true },
  // Don't advertise the framework on every response.
  poweredByHeader: false,
  // Inlined into the browser bundle so error reports say which release they came
  // from (lib/errorReporting.ts). Vercel provides the commit SHA at build time.
  env: {
    NEXT_PUBLIC_RELEASE:
      process.env.NEXT_PUBLIC_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
  },
  // The per-type compatibility pages named every type, so they now send visitors
  // to that type's page (which names only itself).
  async redirects() {
    return [
      { source: '/compat/:code', destination: '/dogtype/:code', permanent: true },
      // The Messages list duplicated Matches and the iPhone has no such tab. Old
      // bookmarks and the push fallback link land on Matches; chats themselves stay
      // at /app/messages/:matchId. Temporary, so the tab can come back.
      { source: '/app/messages', destination: '/app/matches', permanent: false },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
