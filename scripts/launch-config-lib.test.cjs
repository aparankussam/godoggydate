const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  auditRuntimeConfig,
  collectEnvReferences,
  findUndocumentedEnvVars,
  parseDocumentedEnvNames,
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

function makeRepo(files) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'godoggydate-env-test-'));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(repoRoot, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return repoRoot;
}

test('parseDocumentedEnvNames counts set and commented-out (optional) variables, not prose', () => {
  const names = parseDocumentedEnvNames(`
# Firebase console -> Project settings = where to look (prose, not a variable)
FIREBASE_PROJECT_ID=demo
# OPTIONAL_THING=value
  # INDENTED_OPTIONAL=1
export_not_a_var = 1
`);
  assert.ok(names.has('FIREBASE_PROJECT_ID'));
  assert.ok(names.has('OPTIONAL_THING'));
  assert.ok(names.has('INDENTED_OPTIONAL'));
  assert.equal(names.size, 3);
});

test('collectEnvReferences finds dot, bracket, destructured and defineSecret reads, and skips comments and tests', () => {
  const repoRoot = makeRepo({
    'web/lib/a.ts': "const a = process.env.DOT_VAR; const b = process.env['BRACKET_VAR'];",
    'web/app/api/x/route.ts': "const { DESTRUCTURED_VAR, RENAMED: alias = 'x' } = process.env;",
    'firebase/functions/src/index.ts': "const s = defineSecret('FUNCTION_SECRET');",
    'web/lib/commented.ts': "// process.env.ONLY_IN_COMMENT\n/* process.env.ONLY_IN_BLOCK */\nconst u = 'https://example.com'; // process.env.TRAILING_COMMENT",
    'web/lib/a.test.ts': 'process.env.ONLY_IN_TEST',
    'web/node_modules/pkg/index.js': 'process.env.IN_NODE_MODULES',
  });
  const found = [...collectEnvReferences(repoRoot).keys()].sort();
  assert.deepEqual(found, ['BRACKET_VAR', 'DESTRUCTURED_VAR', 'DOT_VAR', 'FUNCTION_SECRET', 'RENAMED']);
});

test('findUndocumentedEnvVars flags code-read variables missing from .env.example and ignores platform ones', () => {
  const repoRoot = makeRepo({
    '.env.example': 'DOCUMENTED=1\n# OPTIONAL_DOCUMENTED=\n',
    'web/lib/a.ts': 'process.env.DOCUMENTED; process.env.OPTIONAL_DOCUMENTED; process.env.NODE_ENV; process.env.VERCEL_GIT_COMMIT_SHA; process.env.FORGOTTEN_KEY;',
    'scripts/tool.cjs': 'process.env.FORGOTTEN_KEY; process.env.ALSO_FORGOTTEN;',
  });
  const missing = findUndocumentedEnvVars(repoRoot);
  assert.deepEqual(missing.map((entry) => entry.name), ['ALSO_FORGOTTEN', 'FORGOTTEN_KEY']);
  assert.deepEqual(missing.find((entry) => entry.name === 'FORGOTTEN_KEY').files.sort(), ['scripts/tool.cjs', 'web/lib/a.ts']);
});

test('every env var the real source reads is documented in the real .env.example', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const missing = findUndocumentedEnvVars(repoRoot);
  assert.deepEqual(missing, [], `Undocumented in .env.example: ${missing.map((entry) => entry.name).join(', ')}`);
});
