const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  auditRuntimeConfig,
  parseDotEnv,
  parseFirebaseRcProjectId,
  parseGoogleServiceInfoProjectId,
} = require('./launch-config-lib.cjs');

test('parseDotEnv handles comments and quoted values', () => {
  const parsed = parseDotEnv(`
# comment
NEXT_PUBLIC_FIREBASE_PROJECT_ID=godoggydate
NEXT_PUBLIC_APP_URL="https://godoggydate.com"
NEXT_PUBLIC_BASE_URL=http://localhost:3001 # deprecated
`);

  assert.equal(parsed.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'godoggydate');
  assert.equal(parsed.NEXT_PUBLIC_APP_URL, 'https://godoggydate.com');
  assert.equal(parsed.NEXT_PUBLIC_BASE_URL, 'http://localhost:3001');
});

test('parseFirebaseRcProjectId returns the default project id', () => {
  const projectId = parseFirebaseRcProjectId(JSON.stringify({
    projects: { default: 'godoggydate' },
  }));

  assert.equal(projectId, 'godoggydate');
});

test('parseGoogleServiceInfoProjectId returns PROJECT_ID from plist xml', () => {
  const projectId = parseGoogleServiceInfoProjectId(`
<plist version="1.0">
  <dict>
    <key>PROJECT_ID</key>
    <string>godoggydate</string>
  </dict>
</plist>
`);

  assert.equal(projectId, 'godoggydate');
});

test('auditRuntimeConfig detects project drift and deprecated base url usage', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'godoggydate-config-test-'));

  fs.writeFileSync(
    path.join(repoRoot, '.firebaserc'),
    JSON.stringify({ projects: { default: 'godoggydate' } }),
  );
  fs.mkdirSync(path.join(repoRoot, 'web'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'mobile/ios/GoDoggyDate'), { recursive: true });

  fs.writeFileSync(
    path.join(repoRoot, '.env.local'),
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID=godoggydate-c6c92\nNEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=godoggydate-c6c92.firebaseapp.com\nNEXT_PUBLIC_BASE_URL=https://yourdomain.com\n',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'web/.env.local'),
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID=godoggydate\nNEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=godoggydate.firebaseapp.com\n',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'mobile/.env'),
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID=godoggydate\nEXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=godoggydate.firebaseapp.com\n',
  );

  const plist = `
<plist version="1.0"><dict><key>PROJECT_ID</key><string>godoggydate</string></dict></plist>
`;
  fs.writeFileSync(path.join(repoRoot, 'mobile/GoogleService-Info.plist'), plist);
  fs.writeFileSync(path.join(repoRoot, 'mobile/ios/GoDoggyDate/GoogleService-Info.plist'), plist);

  const issues = auditRuntimeConfig(repoRoot);

  assert.equal(issues.length, 3);
  assert.ok(issues.some((issue) => issue.kind === 'projectId'));
  assert.ok(issues.some((issue) => issue.kind === 'authDomain'));
  assert.ok(issues.some((issue) => issue.kind === 'deprecatedEnv'));
});
