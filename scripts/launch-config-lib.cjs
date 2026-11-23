const fs = require('node:fs');
const path = require('node:path');

function readIfExists(fullPath) {
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function parseDotEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const hashIndex = rawValue.search(/\s+#/);
    const value = (hashIndex >= 0 ? rawValue.slice(0, hashIndex) : rawValue).trim();
    values[key] = value.replace(/^"(.*)"$/, '$1');
  }
  return values;
}

function parseFirebaseRcProjectId(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed?.projects?.default || '';
  } catch {
    return '';
  }
}

function parseGoogleServiceInfoProjectId(content) {
  const match = content.match(/<key>\s*PROJECT_ID\s*<\/key>\s*<string>\s*([^<]+)\s*<\/string>/);
  return match ? match[1].trim() : '';
}

function normalizeAuthDomain(value) {
  return value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function buildFirebaseSignals(repoRoot) {
  const sources = [
    {
      kind: 'projectId',
      label: '.firebaserc default project',
      file: '.firebaserc',
      value: parseFirebaseRcProjectId(readIfExists(path.join(repoRoot, '.firebaserc'))),
    },
    {
      kind: 'projectId',
      label: 'root .env.local Firebase project',
      file: '.env.local',
      value: parseDotEnv(readIfExists(path.join(repoRoot, '.env.local'))).NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    },
    {
      kind: 'projectId',
      label: 'web/.env.local Firebase project',
      file: 'web/.env.local',
      value: parseDotEnv(readIfExists(path.join(repoRoot, 'web/.env.local'))).NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    },
    {
      kind: 'projectId',
      label: 'mobile/.env Firebase project',
      file: 'mobile/.env',
      value: parseDotEnv(readIfExists(path.join(repoRoot, 'mobile/.env'))).EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    },
    {
      kind: 'projectId',
      label: 'mobile GoogleService-Info project',
      file: 'mobile/GoogleService-Info.plist',
      value: parseGoogleServiceInfoProjectId(readIfExists(path.join(repoRoot, 'mobile/GoogleService-Info.plist'))),
    },
    {
      kind: 'projectId',
      label: 'iOS bundled GoogleService-Info project',
      file: 'mobile/ios/GoDoggyDate/GoogleService-Info.plist',
      value: parseGoogleServiceInfoProjectId(readIfExists(path.join(repoRoot, 'mobile/ios/GoDoggyDate/GoogleService-Info.plist'))),
    },
    {
      kind: 'authDomain',
      label: 'root .env.local Firebase auth domain',
      file: '.env.local',
      value: normalizeAuthDomain(parseDotEnv(readIfExists(path.join(repoRoot, '.env.local'))).NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ''),
    },
    {
      kind: 'authDomain',
      label: 'web/.env.local Firebase auth domain',
      file: 'web/.env.local',
      value: normalizeAuthDomain(parseDotEnv(readIfExists(path.join(repoRoot, 'web/.env.local'))).NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ''),
    },
    {
      kind: 'authDomain',
      label: 'mobile/.env Firebase auth domain',
      file: 'mobile/.env',
      value: normalizeAuthDomain(parseDotEnv(readIfExists(path.join(repoRoot, 'mobile/.env'))).EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || ''),
    },
  ];

  return sources.filter((source) => source.value);
}

function findUniqueValueIssues(signals, kind) {
  const grouped = signals.filter((signal) => signal.kind === kind);
  const uniqueValues = [...new Set(grouped.map((signal) => signal.value))];
  if (uniqueValues.length <= 1) return [];

  const lines = grouped.map((signal) => `- ${signal.label} (${signal.file}): ${signal.value}`);
  return [
    {
      kind,
      message:
        kind === 'projectId'
          ? 'Multiple Firebase project ids are configured across local runtime files.'
          : 'Multiple Firebase auth domains are configured across local runtime files.',
      detail: lines.join('\n'),
    },
  ];
}

function findDeprecatedEnvKeyUsage(repoRoot) {
  const envFiles = ['.env.local', 'web/.env.local', 'mobile/.env'];
  const deprecatedKeys = ['NEXT_PUBLIC_BASE_URL'];
  const issues = [];

  for (const file of envFiles) {
    const fullPath = path.join(repoRoot, file);
    const values = parseDotEnv(readIfExists(fullPath));
    for (const key of deprecatedKeys) {
      if (values[key]) {
        issues.push({
          kind: 'deprecatedEnv',
          message: `Deprecated env key ${key} is still present.`,
          detail: `- ${file}: ${key}=${values[key]}\n  Use NEXT_PUBLIC_APP_URL for web metadata and EXPO_PUBLIC_PAYMENTS_API_URL / EXPO_PUBLIC_WEB_URL for mobile runtime calls.`,
        });
      }
    }
  }

  return issues;
}

function auditRuntimeConfig(repoRoot) {
  const signals = buildFirebaseSignals(repoRoot);
  return [
    ...findUniqueValueIssues(signals, 'projectId'),
    ...findUniqueValueIssues(signals, 'authDomain'),
    ...findDeprecatedEnvKeyUsage(repoRoot),
  ];
}

// ── Env vars the code reads vs. what .env.example documents ────────────────────
// verify:launch-config used to check a hand-picked list of names, so a variable
// added to the code (GEMINI_API_KEY, the Pro price ids, ...) never made it into
// .env.example and nothing noticed. This scans the source for every env var it
// reads and reports any that .env.example does not mention.

const ENV_SCAN_DIRS = [
  'web/app',
  'web/lib',
  'web/components',
  'web/shared',
  'shared',
  'mobile/app',
  'mobile/lib',
  'mobile/components',
  'mobile/hooks',
  'firebase/functions/src',
  'scripts',
];
const ENV_SCAN_FILES = ['web/next.config.js', 'mobile/app.config.js'];
const ENV_SCAN_SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'ios', 'android', 'dist', 'build']);
const ENV_SCAN_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

// Provided by the platform (Node, Vercel, Expo/EAS, Cloud Functions, the emulators)
// or by CI, never set by hand in a .env file, so .env.example has nothing to say
// about them.
const PLATFORM_ENV = new Set([
  'NODE_ENV',
  'CI',
  'VERCEL_GIT_COMMIT_SHA',
  'EAS_BUILD',
  'EXPO_OS',
  'FUNCTIONS_EMULATOR',
  'FUNCTION_TARGET',
  'K_SERVICE',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_CONFIG',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
  'NEXT_RUNTIME',
  'NEXT_PHASE',
  'PORT',
]);

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\\\w])\/\/.*$/, '$1'))
    .join('\n');
}

function walkSourceFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ENV_SCAN_SKIP_DIRS.has(entry.name)) walkSourceFiles(path.join(dir, entry.name), out);
    } else if (ENV_SCAN_EXTENSIONS.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
}

function envNamesIn(source) {
  const names = new Set();
  const code = stripComments(source);
  for (const match of code.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(match[1]);
  for (const match of code.matchAll(/process\.env\[\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\]/g)) names.add(match[1]);
  // firebase-functions params: defineSecret('STRIPE_SECRET_KEY') etc.
  for (const match of code.matchAll(/define(?:Secret|String|Int|Boolean|Float|List)\(\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g)) {
    names.add(match[1]);
  }
  // const { A, B: renamed } = process.env
  for (const match of code.matchAll(/\{([^}]*)\}\s*=\s*process\.env\b/g)) {
    for (const part of match[1].split(',')) {
      const name = part.split(':')[0].split('=')[0].trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** Map of env var name -> repo-relative files that read it. */
function collectEnvReferences(repoRoot) {
  const files = [];
  for (const dir of ENV_SCAN_DIRS) walkSourceFiles(path.join(repoRoot, dir), files);
  for (const file of ENV_SCAN_FILES) {
    const full = path.join(repoRoot, file);
    if (fs.existsSync(full)) files.push(full);
  }
  const references = new Map();
  for (const file of files) {
    for (const name of envNamesIn(fs.readFileSync(file, 'utf8'))) {
      if (!references.has(name)) references.set(name, []);
      references.get(name).push(path.relative(repoRoot, file));
    }
  }
  return references;
}

/** Names .env.example documents, including optional ones left commented out (`# NAME=value`). */
function parseDocumentedEnvNames(envExampleContent) {
  const names = new Set();
  for (const line of envExampleContent.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:#\s*)?([A-Z][A-Z0-9_]*)\s*=/);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Env vars the source reads that .env.example does not document. [{ name, files }] */
function findUndocumentedEnvVars(repoRoot) {
  const documented = parseDocumentedEnvNames(readIfExists(path.join(repoRoot, '.env.example')));
  const missing = [];
  for (const [name, files] of collectEnvReferences(repoRoot)) {
    if (PLATFORM_ENV.has(name) || documented.has(name)) continue;
    missing.push({ name, files });
  }
  return missing.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  PLATFORM_ENV,
  auditRuntimeConfig,
  buildFirebaseSignals,
  collectEnvReferences,
  findDeprecatedEnvKeyUsage,
  findUndocumentedEnvVars,
  parseDocumentedEnvNames,
  parseDotEnv,
  parseFirebaseRcProjectId,
  parseGoogleServiceInfoProjectId,
};
