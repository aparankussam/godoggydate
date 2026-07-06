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

module.exports = {
  auditRuntimeConfig,
  buildFirebaseSignals,
  findDeprecatedEnvKeyUsage,
  parseDotEnv,
  parseFirebaseRcProjectId,
  parseGoogleServiceInfoProjectId,
};
