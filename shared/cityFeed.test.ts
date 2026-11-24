// shared/cityFeed.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mergeFeed,
  postEligibility,
  postExpiresAtMs,
  validatePostFields,
  isPostLive,
  type FeedItem,
} from './cityFeed.ts';

const H = 60 * 60 * 1000;
const DAY = 24 * H;

test('walk buddy posts expire in 24h, others per template', () => {
  assert.equal(postExpiresAtMs('walk_buddy', 1000), 1000 + 24 * H);
  assert.equal(postExpiresAtMs('ask', 0), 72 * H);
  assert.equal(isPostLive({ expiresAtMs: 5 }, 5), false);
  assert.equal(isPostLive({ expiresAtMs: 6 }, 5), true);
});

test('new accounts need a complete profile and age or a Pack Day', () => {
  assert.equal(postEligibility({ profileComplete: false, accountAgeMs: 30 * DAY, attendedPackDay: true }).ok, false);
  assert.equal(postEligibility({ profileComplete: true, accountAgeMs: DAY, attendedPackDay: false }).ok, false);
  assert.equal(postEligibility({ profileComplete: true, accountAgeMs: DAY, attendedPackDay: true }).ok, true);
  assert.equal(postEligibility({ profileComplete: true, accountAgeMs: 3 * DAY, attendedPackDay: false }).ok, true);
});

test('post fields: template, text and required place', () => {
  assert.equal(validatePostFields({ template: 'nope', text: 'hi' }).ok, false);
  assert.equal(validatePostFields({ template: 'ask', text: '  ' }).ok, false);
  assert.equal(validatePostFields({ template: 'walk_buddy', text: 'Sat 9am' }).ok, false);
  assert.equal(validatePostFields({ template: 'ask', text: 'x'.repeat(281) }).ok, false);
  const ok = validatePostFields({ template: 'walk_buddy', text: ' Sat  9am ', place: 'Dog park' });
  assert.deepEqual(ok.ok && ok.value, { template: 'walk_buddy', text: 'Sat 9am', place: 'Dog park' });
});

const post = (id: string, sortMs: number, authorUid = 'a'): FeedItem =>
  ({ kind: 'post', id, authorUid, sortMs, template: 'ask', text: id, place: '', claimed: false });
const day = (id: string, sortMs: number): FeedItem => ({ kind: 'packday', id, authorUid: 'h', sortMs });
const lost = (id: string, sortMs: number): FeedItem => ({ kind: 'lost', id, authorUid: 'l', sortMs, data: {} });

test('feed: lost first, a Pack Day leads, then posts with Pack Days woven in', () => {
  const out = mergeFeed(
    [post('p1', 5), post('p2', 4), post('p3', 3), day('d2', 20), day('d1', 10), lost('l1', 1)],
    new Set(),
  );
  assert.deepEqual(out.map((i) => i.id), ['l1', 'd1', 'p1', 'p2', 'd2', 'p3']);
});

test('feed: blocked authors are hidden, and a posts-only feed still renders', () => {
  const out = mergeFeed([post('p1', 2, 'bad'), post('p2', 1)], new Set(['bad']));
  assert.deepEqual(out.map((i) => i.id), ['p2']);
});

test('functions mirror matches shared/cityFeed.ts', () => {
  const body = (p: string) => {
    const s = readFileSync(new URL(p, import.meta.url), 'utf8');
    return s.slice(s.search(/^export type PostTemplate/m));
  };
  assert.equal(body('../firebase/functions/src/cityFeedRules.ts'), body('./cityFeed.ts'));
});
