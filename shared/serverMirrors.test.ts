// shared/serverMirrors.test.ts
// Cloud Functions can't import shared/ at runtime, so firebase/functions/src
// keeps byte-identical copies of the pure modules the server needs. This fails
// if a copy drifts, so the server never decides with different rules than the
// web and iPhone apps. (The content filter has its own test:
// contentFilterMirror.test.ts.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Everything from the first line matching this down must be identical; the
// header comments differ.
const BODY_START = /^export (const|type|function|interface) /m;

function body(relativePath: string): string {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const start = source.search(BODY_START);
  assert.ok(start >= 0, `${relativePath} has no export line`);
  return source.slice(start);
}

for (const name of ['founding', 'photoUrl']) {
  test(`firebase/functions/src/${name}.ts matches shared/${name}.ts`, () => {
    assert.equal(
      body(`../firebase/functions/src/${name}.ts`),
      body(`./${name}.ts`),
      `Copy shared/${name}.ts (from its first export line down) into firebase/functions/src/${name}.ts`,
    );
  });
}

// Different file name on the server side, so it can't share the loop above.
test('firebase/functions/src/packDayChatRules.ts matches shared/packDayChat.ts', () => {
  assert.equal(
    body('../firebase/functions/src/packDayChatRules.ts'),
    body('./packDayChat.ts'),
    'Copy shared/packDayChat.ts (from its first export line down) into firebase/functions/src/packDayChatRules.ts',
  );
});
