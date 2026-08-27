import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dogtypeMatchScore,
  dogtypeVibe,
  dogtypeRankedMatches,
  dogtypeBestMatches,
} from './dogtype.ts';

test('dogtypeVibe still thresholds the same score it always did', () => {
  // Kaju (EROB) × Lazy Goofball (ZROM) is the canonical 4/great pairing.
  assert.equal(dogtypeMatchScore('EROB', 'ZROM'), 4);
  assert.equal(dogtypeVibe('EROB', 'ZROM'), 'great');
  // A malformed code scores 0 and reads 'good' (unchanged legacy behaviour).
  assert.equal(dogtypeMatchScore('EROB', 'XX'), 0);
  assert.equal(dogtypeVibe('EROB', 'XX'), 'good');
});

test('ranked matches are sorted best-first and only a STRICT top is #1', () => {
  const r = dogtypeRankedMatches('EROB', 5);
  // EROB has exactly three great matches: ZROM(4), ZRSM(3), ZGOM(3).
  assert.deepEqual(r.map((m) => m.type.code), ['ZROM', 'ZRSM', 'ZGOM']);
  assert.deepEqual(r.map((m) => m.score), [4, 3, 3]);
  // Only the strict top (4 > 3) is a clear #1; the two tied 3s are NOT.
  assert.deepEqual(r.map((m) => m.isClearTop), [true, false, false]);
  assert.deepEqual(r.map((m) => m.rank), [1, 2, 3]);
});

test('a lone top match is a clear #1 (nothing to tie with)', () => {
  // Old Soul (ZGSM) has a single great match — trivially the clear top.
  const r = dogtypeRankedMatches('ZGSM', 5);
  assert.equal(r.length, 1);
  assert.equal(r[0].isClearTop, true);
});

test('two matches tied for the top are never labelled #1', () => {
  // Construct/verify: if the top two share a score, neither is clear top.
  const r = dogtypeRankedMatches('EROB', 5);
  const topScore = r[0].score;
  const tiedAtTop = r.filter((m) => m.score === topScore);
  if (tiedAtTop.length > 1) {
    assert.equal(r[0].isClearTop, false);
  } else {
    assert.equal(r[0].isClearTop, true);
  }
});

test('the sort is stable/deterministic — same input, same order', () => {
  const a = dogtypeRankedMatches('EROB', 5).map((m) => m.type.code);
  const b = dogtypeRankedMatches('EROB', 5).map((m) => m.type.code);
  assert.deepEqual(a, b);
});

test('dogtypeBestMatches now returns the ranked types (best first)', () => {
  assert.deepEqual(dogtypeBestMatches('EROB', 5).map((t) => t.code), ['ZROM', 'ZRSM', 'ZGOM']);
});
