#!/usr/bin/env node

const path = require('node:path');
const { auditRuntimeConfig, buildFirebaseSignals } = require('./launch-config-lib.cjs');

const repoRoot = path.resolve(__dirname, '..');
const signals = buildFirebaseSignals(repoRoot);
const issues = auditRuntimeConfig(repoRoot);

process.stdout.write('Runtime config signals:\n');
for (const signal of signals) {
  process.stdout.write(`- ${signal.label} (${signal.file}): ${signal.value}\n`);
}

if (issues.length === 0) {
  process.stdout.write('\nPASS: runtime config artifacts are internally consistent.\n');
  process.exit(0);
}

process.stdout.write('\nFAIL: runtime config audit found issues.\n');
for (const issue of issues) {
  process.stdout.write(`\n${issue.message}\n${issue.detail}\n`);
}

process.exit(1);
