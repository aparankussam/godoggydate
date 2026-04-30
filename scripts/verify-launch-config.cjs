#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const checks = [];

function readIfExists(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function record(ok, label, detail) {
  checks.push({ ok, label, detail });
}

const envExample = readIfExists('.env.example');
const mobileAppJson = readIfExists('mobile/app.json');
const mobileAppConfigJs = readIfExists('mobile/app.config.js');
const firebaseJson = readIfExists('firebase.json');
const webPackageJson = readIfExists('web/package.json');
const webPackageLock = readIfExists('web/package-lock.json');

record(
  envExample.includes('FIREBASE_CLIENT_EMAIL=') && envExample.includes('FIREBASE_PRIVATE_KEY='),
  'Firebase Admin env vars are documented',
  'Expected FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.example',
);

record(
  envExample.includes('STRIPE_WEBHOOK_SECRET=') && envExample.includes('STRIPE_SECRET_KEY='),
  'Stripe server secrets are documented',
  'Expected STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env.example',
);

record(
  envExample.includes('EXPO_PUBLIC_PAYMENTS_API_URL=') && envExample.includes('EXPO_PUBLIC_WEB_URL='),
  'Mobile payment backend URLs are documented',
  'Expected EXPO_PUBLIC_PAYMENTS_API_URL and EXPO_PUBLIC_WEB_URL in .env.example',
);

const mobileUsesEnvDrivenEasProjectId =
  mobileAppConfigJs.includes('EXPO_PUBLIC_EAS_PROJECT_ID') ||
  mobileAppConfigJs.includes('EAS_PROJECT_ID');

record(
  mobileUsesEnvDrivenEasProjectId ||
    (mobileAppJson !== '' && !mobileAppJson.includes('YOUR_EAS_PROJECT_ID')),
  'Expo EAS project id is configurable for production builds',
  'Use mobile/app.config.js with EXPO_PUBLIC_EAS_PROJECT_ID (or EAS_PROJECT_ID), or set a real project id in your Expo config before production builds',
);

record(
  envExample.includes('EXPO_PUBLIC_EAS_PROJECT_ID='),
  'Expo EAS project id env var is documented',
  'Expected EXPO_PUBLIC_EAS_PROJECT_ID in .env.example',
);

const productionLikeRun =
  process.env.EAS_BUILD === 'true' ||
  process.env.NODE_ENV === 'production' ||
  process.env.GODOGGYDATE_VERIFY_PRODUCTION === 'true';

if (productionLikeRun) {
  const easProjectIdEnv =
    (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || process.env.EAS_PROJECT_ID || '').trim();
  record(
    easProjectIdEnv !== '' && easProjectIdEnv !== 'YOUR_EAS_PROJECT_ID',
    'Expo EAS project id env var is set to a real value (production-like run)',
    'Set EXPO_PUBLIC_EAS_PROJECT_ID (or EAS_PROJECT_ID) to the real Expo project id before production builds',
  );
}

record(
  !firebaseJson.includes('"hosting"'),
  'Legacy Firebase Hosting config is removed',
  'Web must be deployed to a real Next.js SSR host, not classic Firebase Hosting',
);

record(
  webPackageJson.includes('"firebase-admin"'),
  'Web package declares firebase-admin',
  'web/package.json must include firebase-admin for server-auth payment routes',
);

record(
  webPackageLock.includes('"firebase-admin"'),
  'Web lockfile includes firebase-admin',
  'Regenerate web/package-lock.json on a networked machine before final deploy',
);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const prefix = check.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`${prefix}: ${check.label}\n`);
  if (!check.ok) {
    process.stdout.write(`  ${check.detail}\n`);
  }
}

if (failed.length > 0) {
  process.exitCode = 1;
}
