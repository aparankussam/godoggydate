// shared/contentFilterMirror.test.ts
// Cloud Functions can't import shared/ at runtime, so the server keeps its own
// copy of the content filter in firebase/functions/src/contentFilter.ts. This
// fails if that copy drifts from shared/contentFilter.ts, so the server never
// filters with a different word list than web and the iPhone app.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Everything from this line down must match; the header comments differ.
const BODY_START = /^export type ContentFilterReason\b/m;

function filterBody(relativePath: string): string {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const start = source.search(BODY_START);
  assert.ok(start >= 0, `${relativePath} has no "export type ContentFilterReason" line`);
  return source.slice(start);
}

test('the Cloud Functions copy of the content filter matches shared/contentFilter.ts', () => {
  assert.equal(
    filterBody('../firebase/functions/src/contentFilter.ts'),
    filterBody('./contentFilter.ts'),
    'Copy shared/contentFilter.ts (from the ContentFilterReason line down) into firebase/functions/src/contentFilter.ts',
  );
});
