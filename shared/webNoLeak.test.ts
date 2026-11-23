// Guards the "no other Dogtype names before you've matched" rule on the public
// website. Source-level on purpose (no web test runner): these files must not
// even import the catalogue lookups that would let them print a type name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('/dogtype index prints no type names', () => {
  const src = read('web/app/dogtype/page.tsx');
  assert.ok(!/dogtypeByCode|DOGTYPE_CODES|dogtypeCodeDecode/.test(src));
});

test('/dogtype/[code] shows one type, no "plays well with", no list of all 16, and is noindex', () => {
  const src = read('web/app/dogtype/[code]/page.tsx');
  assert.ok(!/dogtypeBestMatches|Plays well with|All 16 Dogtypes/.test(src));
  assert.ok(!/DOGTYPE_CODES\.map\(\(code\) => \{/.test(src), 'no grid of all codes');
  assert.ok(/index:\s*false/.test(src));
});

test('compat pages are gone and redirect', () => {
  assert.ok(!existsSync(new URL('../web/app/compat', import.meta.url)));
  const cfg = read('web/next.config.js');
  assert.ok(cfg.includes('/compat/:code') && cfg.includes('/dogtype/:code') && cfg.includes('permanent: true'));
});

test('sitemap lists no per-type URLs', () => {
  const src = read('web/app/sitemap.ts');
  assert.ok(!/DOGTYPE_CODES/.test(src));
});

test('quiz result has no compat share and its preview image names no types', () => {
  assert.ok(!/get along|quiz_share_compat/.test(read('web/components/DogtypeQuiz.tsx')));
  assert.ok(!/dogtypeByCode/.test(read('web/app/quiz/opengraph-image.tsx')));
});
