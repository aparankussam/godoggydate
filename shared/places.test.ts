import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearbyLine, packDayParks, placeCityKey, placeIdFor, PLACE_MIN_OWNERS } from './places.ts';

test('the Cloud Functions copy matches shared/places.ts', () => {
  const body = (p: string) => {
    const s = readFileSync(new URL(p, import.meta.url), 'utf8');
    return s.slice(s.search(/^export type PlaceCategory\b/m));
  };
  assert.equal(body('../firebase/functions/src/placeKeys.ts'), body('./places.ts'));
});

test('the same place typed two ways gets one id, in a city-scoped key', () => {
  const city = placeCityKey('Austin', 'TX');
  assert.equal(city, 'austin-tx');
  assert.equal(placeIdFor(city, 'vet', 'Dr. Patel'), placeIdFor(city, 'vet', ' dr  PATEL '));
  assert.equal(placeIdFor(city, 'groomer', 'Paws & Claws'), 'austin-tx__groomer__paws-and-claws');
  assert.notEqual(placeIdFor(city, 'vet', 'Dr. Patel'), placeIdFor(city, 'groomer', 'Dr. Patel'));
  assert.equal(placeCityKey('São Paulo', 'sp'), 'sao-paulo-sp');
});

test('a count shows only at the privacy threshold', () => {
  assert.equal(nearbyLine(PLACE_MIN_OWNERS - 1, 'Dr. Patel'), null);
  assert.equal(nearbyLine(undefined, 'Dr. Patel'), null);
  assert.equal(nearbyLine(12, 'Dr. Patel'), '12 dogs nearby use Dr. Patel');
});

test('Pack Day locations become parks: held counts, upcoming list, cancelled ignored', () => {
  const e = (id: string, placeName: string, startsAtMs: number, status = 'open') => ({ id, placeName, startsAtMs, status });
  const parks = packDayParks(
    [e('a', 'Zilker Park', 10), e('b', 'zilker  park', 20), e('c', 'Zilker Park', 300), e('d', 'Zilker Park', 200),
     e('x', 'Zilker Park', 5, 'cancelled'), e('f', 'Pease Park', 400), e('g', '  ', 400)],
    100,
  );
  assert.equal(parks.length, 2);
  assert.equal(parks[0].name, 'Zilker Park');
  assert.equal(parks[0].held, 2);
  assert.deepEqual(parks[0].upcoming.map((u) => u.id), ['d', 'c']);
  assert.equal(parks[1].held, 0);
});
