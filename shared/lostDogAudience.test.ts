import test from 'node:test';
import assert from 'node:assert/strict';
// The Cloud Functions' pure audience rules (the functions package can't import shared/).
import { CITY_AUDIENCE_CAP, helpersToThank, planAudience } from '../firebase/functions/src/lostDogLogic.ts';

test('matches and Pack Day attendees are told first, the rest of the city after, nobody twice', () => {
  const a = planAudience({
    ownerId: 'owner',
    matchPartners: ['m1', 'm2', 'both'],
    packDayAttendees: ['p1', 'both', 'owner'],
    cityMembers: ['owner', 'm1', 'p1', 'c1', 'c2', 'c1'],
    broadcast: true,
  });
  assert.deepEqual(a.first, ['m1', 'm2', 'both', 'p1']);
  assert.deepEqual(a.rest, ['c1', 'c2']);
});

test('a repeat alert within a day reaches only the owner\'s own people', () => {
  const a = planAudience({ ownerId: 'o', matchPartners: ['m'], packDayAttendees: [], cityMembers: ['c1'], broadcast: false });
  assert.deepEqual(a, { first: ['m'], rest: [] });
});

test('the city audience is capped', () => {
  const cityMembers = Array.from({ length: CITY_AUDIENCE_CAP + 50 }, (_, i) => `u${i}`);
  assert.equal(planAudience({ ownerId: 'o', matchPartners: [], packDayAttendees: [], cityMembers, broadcast: true }).rest.length, CITY_AUDIENCE_CAP);
});

test('only signed-in reporters are thanked, once each, never the owner', () => {
  assert.deepEqual(
    helpersToThank([{ reporterUid: 'h1' }, { reporterUid: 'h1' }, {}, { reporterUid: 'owner' }, { reporterUid: 7 }, { reporterUid: 'h2' }], 'owner'),
    ['h1', 'h2'],
  );
});

test('members near where the dog was lost are told first, nearest first, whatever their city', async () => {
  const { nearbyMembers, milesBetween } = await import('../firebase/functions/src/lostDogLogic.ts');
  const pin = { lat: 42.6, lng: -83.15 };
  const near = nearbyMembers([
    { id: 'far', lat: 42.9, lng: -83.15 },     // ~21 mi
    { id: 'two', lat: 42.63, lng: -83.15 },    // ~2 mi
    { id: 'one', lat: 42.61, lng: -83.15 },    // ~0.7 mi
    { id: 'nocoords' },
  ], pin);
  assert.deepEqual(near, ['one', 'two']);
  assert.ok(Math.abs(milesBetween(pin, { lat: 42.63, lng: -83.15 }) - 2.07) < 0.05);
  const a = planAudience({ ownerId: 'o', matchPartners: ['m'], packDayAttendees: [], cityMembers: ['c', 'one'], nearbyMembers: near, broadcast: true });
  assert.deepEqual(a.first, ['one', 'two', 'm']);
  assert.deepEqual(a.rest, ['c']);
});
