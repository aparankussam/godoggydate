import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOUNDING_FREE_SPOTS,
  FOUNDING_PAID_SPOTS,
  FOUNDING_TOTAL,
  foundingPhase,
  foundingSpotsLeft,
  foundingBadgeLabel,
  FOUNDING_MIN_PHOTOS,
  FOUNDING_PRICE_CENTS,
  classifyFoundingCheckout,
  foundingProfileGaps,
  formatUsdCents,
  isFoundingProfileComplete,
  isNonPlaceholderPhoto,
} from './founding.ts';

test('the ladder is 50 free spots, then 100 paid, 150 in total', () => {
  assert.equal(FOUNDING_FREE_SPOTS, 50);
  assert.equal(FOUNDING_PAID_SPOTS, 100);
  assert.equal(FOUNDING_TOTAL, 150);
});

test('free until #50 is taken, paid from then until #150, then closed', () => {
  assert.equal(foundingPhase(0), 'free');
  assert.equal(foundingPhase(49), 'free');
  assert.equal(foundingPhase(50), 'paid');
  assert.equal(foundingPhase(149), 'paid');
  assert.equal(foundingPhase(150), 'closed');
  assert.equal(foundingPhase(173), 'closed');
});

test('spots left counts down within the current phase', () => {
  assert.equal(foundingSpotsLeft(0), 50);
  assert.equal(foundingSpotsLeft(12), 38);
  assert.equal(foundingSpotsLeft(49), 1);
  assert.equal(foundingSpotsLeft(50), 100);
  assert.equal(foundingSpotsLeft(149), 1);
  assert.equal(foundingSpotsLeft(150), 0);
  assert.equal(foundingSpotsLeft(400), 0);
});

test('a bad counter value reads as an empty ladder, never as paid or closed', () => {
  assert.equal(foundingPhase(-3), 'free');
  assert.equal(foundingPhase(Number.NaN), 'free');
  assert.equal(foundingSpotsLeft(Number.NaN), 50);
  assert.equal(foundingPhase(49.9), 'free');
});

test('one badge, with the number when there is one', () => {
  assert.equal(foundingBadgeLabel(7), '⭐ Founding Member #7');
  assert.equal(foundingBadgeLabel(120), '⭐ Founding Member #120');
  assert.equal(foundingBadgeLabel(undefined), '⭐ Founding Member');
  assert.equal(foundingBadgeLabel(null), '⭐ Founding Member');
});

// ── A free number goes to a finished profile only ─────────────────────────────

const PHOTOS = ['https://x/1', 'https://x/2', 'https://x/3'];

function finishedDog(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Waffles',
    breed: 'Corgi Mix',
    age: 'adult',
    sex: 'F',
    size: 'S',
    energyLevel: 60,
    temperament: ['Playful'],
    playStyles: [],
    photos: PHOTOS,
    city: 'Ann Arbor',
    state: 'MI',
    lat: 42.28,
    lng: -83.74,
    ...overrides,
  };
}

test('a hollow dog doc is never complete', () => {
  assert.equal(isFoundingProfileComplete({ name: 'x' }), false);
  assert.equal(isFoundingProfileComplete({}), false);
  assert.equal(isFoundingProfileComplete(null), false);
  assert.equal(isFoundingProfileComplete(undefined), false);
  assert.deepEqual(foundingProfileGaps(null), ['profile']);
  assert.ok(foundingProfileGaps({ name: 'x' }).includes('photos'));
  assert.ok(foundingProfileGaps({ name: 'x' }).includes('location'));
});

test('a finished profile is complete', () => {
  assert.deepEqual(foundingProfileGaps(finishedDog()), []);
  assert.equal(isFoundingProfileComplete(finishedDog()), true);
});

test('it needs at least three REAL photos: placeholders, blanks and non-strings do not count', () => {
  assert.equal(FOUNDING_MIN_PHOTOS, 3);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: PHOTOS.slice(0, 2) })), false);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: ['https://x/1', '_placeholder_', '_placeholder_'] })), false);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: ['https://x/1', 'https://x/2', '', '  '] })), false);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: [1, 2, 3] })), false);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: 'https://x/1' })), false);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: [...PHOTOS, '_placeholder_'] })), true);
  assert.equal(isNonPlaceholderPhoto('_placeholder_'), false);
  assert.equal(isNonPlaceholderPhoto(' _placeholder_ '), false);
  assert.equal(isNonPlaceholderPhoto('https://x/1'), true);
});

test('the caller decides what a real photo is (the server insists on its own Storage URLs)', () => {
  const ownOnly = (photo: unknown) => typeof photo === 'string' && photo.startsWith('https://x/');
  assert.equal(isFoundingProfileComplete(finishedDog(), ownOnly), true);
  assert.equal(isFoundingProfileComplete(finishedDog({ photos: ['https://evil/1', 'https://evil/2', 'https://evil/3'] }), ownOnly), false);
});

test('each profile requirement is checked: name, breed, age, sex, size, energy, personality', () => {
  for (const [field, gap] of [
    ['name', 'name'], ['breed', 'breed'], ['age', 'age'], ['sex', 'sex'], ['size', 'size'],
  ] as const) {
    assert.deepEqual(foundingProfileGaps(finishedDog({ [field]: '' })), [gap], field);
    assert.deepEqual(foundingProfileGaps(finishedDog({ [field]: '   ' })), [gap], field);
    assert.deepEqual(foundingProfileGaps(finishedDog({ [field]: undefined })), [gap], field);
  }
  assert.deepEqual(foundingProfileGaps(finishedDog({ energyLevel: undefined })), ['energyLevel']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ energyLevel: 'high' })), ['energyLevel']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ energyLevel: 0 })), []);
  assert.deepEqual(foundingProfileGaps(finishedDog({ temperament: [], playStyles: [] })), ['personality']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ temperament: [], playStyles: ['wrestling'] })), []);
});

test('a location is coordinates, city and state, or a place name; a ZIP alone is not public', () => {
  const noLocation = { city: undefined, state: undefined, location: undefined, lat: undefined, lng: undefined };
  assert.deepEqual(foundingProfileGaps(finishedDog(noLocation)), ['location']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, lat: 42.28, lng: -83.74 })), []);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, city: 'Ann Arbor', state: 'MI' })), []);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, city: 'Ann Arbor' })), ['location']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, location: 'Ann Arbor, MI' })), []);
  // ZIP-shaped text is the private ZIP leaking into a public field: it doesn't count.
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, location: '48104' })), ['location']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, city: '48104-1234', state: 'MI' })), ['location']);
  // Coordinates must be real numbers on Earth.
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, lat: 'x', lng: 5 })), ['location']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, lat: 91, lng: 0 })), ['location']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, lat: 0, lng: 181 })), ['location']);
  assert.deepEqual(foundingProfileGaps(finishedDog({ ...noLocation, lat: Number.NaN, lng: 0 })), ['location']);
});

// ── Which Stripe checkouts earn a number ──────────────────────────────────────

test('one $39 payment grants one membership', () => {
  assert.equal(FOUNDING_PRICE_CENTS, 3900);
  assert.deepEqual(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 3900, amountTotal: 3900, currency: 'usd' }),
    { grants: true, reason: 'ok', quantity: 1 },
  );
});

test('a quantity-2 checkout ($78) still grants, and says it paid for two', () => {
  assert.deepEqual(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 7800, amountTotal: 7800, currency: 'usd' }),
    { grants: true, reason: 'ok', quantity: 2 },
  );
  assert.equal(classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 11700, amountTotal: 11700, currency: 'usd' }).quantity, 3);
  // A discount on two memberships still paid for two.
  assert.equal(classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 7800, amountTotal: 3900, currency: 'usd' }).quantity, 2);
});

test('a promo code the owner handed out (partly off) still grants what the buyer was promised', () => {
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 3900, amountTotal: 1950, currency: 'usd' }).grants,
    true,
  );
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 3900, amountTotal: 1, currency: 'usd' }).grants,
    true,
  );
});

test('a 100%-off or zero-amount session never spends a number', () => {
  const free = classifyFoundingCheckout({ paymentStatus: 'no_payment_required', amountSubtotal: 3900, amountTotal: 0, currency: 'usd' });
  assert.deepEqual(free, { grants: false, reason: 'zero_amount', quantity: 1 });
  // Even if Stripe calls it paid, nothing was charged.
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 3900, amountTotal: 0, currency: 'usd' }).reason,
    'zero_amount',
  );
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 0, amountTotal: 0, currency: 'usd' }).grants,
    false,
  );
});

test('unpaid, cheaper or non-USD checkouts do not grant', () => {
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'unpaid', amountSubtotal: 3900, amountTotal: 3900, currency: 'usd' }).reason,
    'unpaid',
  );
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 3899, amountTotal: 3899, currency: 'usd' }).reason,
    'below_price',
  );
  assert.equal(
    classifyFoundingCheckout({ paymentStatus: 'paid', amountSubtotal: 3900, amountTotal: 3900, currency: 'eur' }).reason,
    'wrong_currency',
  );
  assert.equal(classifyFoundingCheckout({}).grants, false);
  assert.equal(classifyFoundingCheckout({ paymentStatus: 'paid' }).reason, 'below_price');
});

test('alert amounts read as dollars', () => {
  assert.equal(formatUsdCents(7800), '$78.00');
  assert.equal(formatUsdCents(3900), '$39.00');
  assert.equal(formatUsdCents(5), '$0.05');
  assert.equal(formatUsdCents(null), 'an unknown amount');
});
