import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// matchingEngine.ts imports its siblings the way the bundlers want (no extension);
// Node's own resolver needs one. Teach it, so the engine is tested exactly as shipped.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(specifier)) {
      for (const suffix of ['.ts', '/index.ts']) {
        try { return await nextResolve(specifier + suffix, context); } catch {}
      }
    }
    throw err;
  }
}`),
);

const {
  analyzeLimits,
  calculateCompatibility,
  cautionCountOf,
  describeLimits,
  detectUnsafePairings,
  formatDistanceMiles,
  sortFeed,
} = await import('./utils/matchingEngine.ts');

// The chips the profile form offers (web/components/DogProfileForm.tsx, mobile ProfileEditor).
const FORM_NOT_GOOD_WITH = ['small dogs', 'large dogs', 'puppies', 'high-energy dogs', 'rough play', 'off-leash dogs'];
const FORM_BEHAVIOR_FLAGS = [
  'needs slow introduction', 'easily overstimulated', 'resource guarding',
  'anxious with dogs', 'prefers calm dogs', 'not comfortable with kids', 'reactive on leash only',
];

type TestDog = ReturnType<typeof dog>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dog(over: Record<string, any> = {}): any {
  return {
    id: over.id ?? over.name ?? 'd',
    ownerId: over.id ?? over.name ?? 'd',
    name: 'Dog',
    breed: 'Labrador Retriever',
    purebred: false,
    size: 'M',
    age: 'adult',
    sex: 'F',
    fixed: false,
    energyLevel: 50,
    photos: [],
    goodWith: ['all dogs'],
    notGoodWith: [],
    playStyles: [],
    boundaries: [],
    allergies: [],
    vaccinated: true,
    vetChecked: false,
    specialNeeds: [],
    behaviorFlags: [],
    mode: 'playdate',
    totalMeetups: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

// A mellow adult medium dog who trips nothing.
const calmAdult = () => dog({ name: 'Waffles', energyLevel: 30, playStyles: ['gentle play 🐾'] });
// A dog who trips every conditional limit at once.
const worstCase = () =>
  dog({
    name: 'Rocket',
    size: 'S',
    age: 'puppy',
    energyLevel: 95,
    playStyles: ['wrestling 🤼', 'high-energy runner ⚡', 'loves fetch 🎾'],
    behaviorFlags: ['resource guarding'],
  });

/** How a dog whose owner declared one chip reads that chip against `target`. */
function severityOf(chip: string, kind: 'notGoodWith' | 'behaviorFlags', target: TestDog, holder: TestDog = dog()) {
  const h = dog({ ...holder, name: 'Moose', [kind]: [chip] });
  return analyzeLimits(target, h).items.find((i) => i.chip === chip && i.side === 'theirs')?.severity;
}

test('every one of the 13 form chips is read by the engine and produces something to show', () => {
  // Two viewers between them trip every conditional chip: a small, rowdy puppy and a big dog.
  const viewers = [worstCase(), dog({ name: 'Titan', size: 'XL' })];
  const surfaces = (field: 'notGoodWith' | 'behaviorFlags', chip: string) =>
    viewers.some((viewer) => {
      const result = calculateCompatibility(viewer, dog({ name: 'Moose', [field]: [chip] }), 1);
      return (
        result.limits!.items.some((i) => i.chip === chip) &&
        result.warnings.some((w) => w.includes("Moose's owner"))
      );
    });
  for (const chip of FORM_NOT_GOOD_WITH) assert.ok(surfaces('notGoodWith', chip), `notGoodWith "${chip}" never surfaces`);
  for (const chip of FORM_BEHAVIOR_FLAGS) assert.ok(surfaces('behaviorFlags', chip), `behavior flag "${chip}" never surfaces`);
});

test("notGoodWith chips trip against the other dog's size, age, energy and play style", () => {
  const t = (chip: string, target: TestDog) => severityOf(chip, 'notGoodWith', target);
  assert.equal(t('small dogs', dog({ size: 'S' })), 'caution');
  assert.equal(t('small dogs', dog({ size: 'M' })), 'declared');
  assert.equal(t('large dogs', dog({ size: 'L' })), 'caution');
  assert.equal(t('large dogs', dog({ size: 'XL' })), 'caution');
  assert.equal(t('large dogs', dog({ size: 'S' })), 'declared');
  assert.equal(t('puppies', dog({ age: 'puppy' })), 'caution');
  assert.equal(t('puppies', dog({ age: 'adult' })), 'declared');
  assert.equal(t('high-energy dogs', dog({ energyLevel: 80 })), 'caution');
  assert.equal(t('high-energy dogs', dog({ energyLevel: 40, playStyles: ['high-energy runner ⚡'] })), 'caution');
  assert.equal(t('high-energy dogs', dog({ energyLevel: 40 })), 'declared');
  assert.equal(t('rough play', dog({ playStyles: ['wrestling 🤼'] })), 'caution');
  assert.equal(t('rough play', dog({ playStyles: ['gentle play 🐾'] })), 'declared');
  // We cannot know who is off leash: informational only, never a penalty.
  assert.equal(t('off-leash dogs', dog()), 'note');
  assert.equal(t('off-leash dogs', worstCase()), 'note');
  // Values the type allows but the form does not offer.
  assert.equal(t('overstimulated', dog({ playStyles: ['wrestling 🤼'] })), 'caution');
  assert.equal(t('resource guarding dogs', dog({ behaviorFlags: ['resource guarding'] })), 'caution');
  assert.equal(t('resource guarding dogs', dog()), 'declared');
});

test("behavior flags trip against the other dog's energy, play style and size", () => {
  const t = (chip: string, target: TestDog, holder: TestDog = dog()) => severityOf(chip, 'behaviorFlags', target, holder);
  assert.equal(t('needs slow introduction', dog({ energyLevel: 85 })), 'caution');
  assert.equal(t('needs slow introduction', dog({ energyLevel: 30 })), 'note'); // relevant to any first meeting
  assert.equal(t('easily overstimulated', dog({ playStyles: ['wrestling 🤼'] })), 'caution');
  assert.equal(t('easily overstimulated', dog({ energyLevel: 90 })), 'caution');
  assert.equal(t('easily overstimulated', dog({ energyLevel: 30, playStyles: ['calm 🧘'] })), 'declared');
  assert.equal(t('resource guarding', dog({ playStyles: ['loves fetch 🎾'] })), 'caution');
  assert.equal(t('resource guarding', dog({ playStyles: ['gentle play 🐾'] })), 'note');
  assert.equal(t('anxious with dogs', dog({ playStyles: ['high-energy runner ⚡'] })), 'caution');
  assert.equal(t('anxious with dogs', dog({ size: 'XL', energyLevel: 30 }), dog({ size: 'S' })), 'caution');
  assert.equal(t('anxious with dogs', dog({ size: 'M', energyLevel: 30 }), dog({ size: 'S' })), 'declared');
  assert.equal(t('prefers calm dogs', dog({ energyLevel: 70 })), 'caution');
  assert.equal(t('prefers calm dogs', dog({ energyLevel: 30 })), 'declared');
  assert.equal(t('prefers calm dogs', dog({ energyLevel: 30, playStyles: ['wrestling 🤼'] })), 'caution');
  // Informational whatever the other dog is.
  for (const chip of ['not comfortable with kids', 'not comfortable with strangers', 'reactive on leash only']) {
    assert.equal(t(chip, dog()), 'note', chip);
    assert.equal(t(chip, worstCase()), 'note', chip);
  }
});

test("limits are worded in the owner's name, never as a statement about the viewed dog", () => {
  const moose = dog({ name: 'Moose', notGoodWith: ['puppies'], behaviorFlags: ['easily overstimulated'] });
  assert.deepEqual(describeLimits(moose), [
    "Moose's owner prefers no puppies",
    "Moose's owner says Moose gets overstimulated easily",
  ]);
  assert.deepEqual(describeLimits(dog({ name: 'Waffles', notGoodWith: ['puppies'] }), { voice: 'you' }), ['You prefer no puppies']);

  const puppy = dog({ name: 'Juno', age: 'puppy' });
  const result = calculateCompatibility(puppy, moose, 1);
  assert.ok(result.warnings.includes("Moose's owner prefers no puppies (Juno is a puppy)"), JSON.stringify(result.warnings));
  assert.ok(!result.warnings.some((w) => /^Not ideal with/.test(w)), 'no ambiguous legacy wording');
  const item = result.limits!.items.find((i) => i.chip === 'puppies')!;
  assert.equal(item.side, 'theirs');
  assert.equal(item.text, "Moose's owner prefers no puppies");
  assert.equal(item.detail, 'Juno is a puppy');

  // A nameless dog never renders "undefined".
  assert.equal(describeLimits(dog({ name: '', notGoodWith: ['puppies'] }))[0], "their dog's owner prefers no puppies");
});

test("the viewer's own limits are worded \"You ...\" and only count when the other dog trips them", () => {
  const me = dog({ name: 'Waffles', notGoodWith: ['large dogs', 'puppies'] });
  const big = dog({ name: 'Moose', size: 'XL' });
  const analysis = analyzeLimits(me, big);
  assert.deepEqual(analysis.items.map((i) => [i.side, i.chip, i.severity, i.text]), [
    ['yours', 'large dogs', 'caution', 'You prefer no large dogs'],
  ]);
  assert.equal(analysis.total, 1);
  // Everything is shown for the pre-meetup Heads-Up.
  const all = analyzeLimits(me, big, { viewerAll: true });
  assert.equal(all.total, 2);
  assert.equal(all.cautionCount, 1);
  assert.equal(all.declaredCount, 1);
});

test('each declared chip is counted exactly once (no crossings + flags double count)', () => {
  const mine = dog({ name: 'Waffles', notGoodWith: ['high-energy dogs'], behaviorFlags: ['prefers calm dogs', 'easily overstimulated'] });
  const rowdy = dog({
    name: 'Rocket',
    energyLevel: 95,
    playStyles: ['wrestling 🤼'],
    notGoodWith: ['small dogs', 'puppies'],
    behaviorFlags: ['needs slow introduction', 'not comfortable with kids'],
  });
  const analysis = analyzeLimits(mine, rowdy, { viewerAll: true });
  const ids = analysis.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  // 3 of mine + 4 of theirs, each once.
  assert.equal(analysis.total, 7);
  assert.equal(analysis.cautionCount + analysis.noteCount + analysis.declaredCount, analysis.total);
  // Three of mine all trip against Rocket. Of Rocket's: "needs slow introduction" and
  // kids are notes (Waffles is not high-energy), small dogs / puppies are declared only.
  assert.equal(analysis.cautionCount, 3);
  assert.equal(analysis.noteCount, 2);
  assert.equal(analysis.declaredCount, 2);

  const result = calculateCompatibility(mine, rowdy, 1);
  // Three chips from MY owner, one underlying worry (a rowdy dog): ONE penalty, not 15 + 6 + 6.
  assert.equal(result.breakdown.penalty, 15);
  assert.equal(new Set(result.warnings).size, result.warnings.length, 'warnings are unique');
  assert.equal(result.limits!.cautionCount, 3);
  assert.equal(cautionCountOf(result), 3);
  // Their two notes show as warnings; my three tripped limits do too: 5, each once.
  assert.equal(result.warnings.length, 5);
});

test('notes are shown but never cost score or block a strong fit', () => {
  const plain = dog({ name: 'Moose', energyLevel: 30, playStyles: ['gentle play 🐾'] });
  const withNotes = dog({
    name: 'Moose', energyLevel: 30, playStyles: ['gentle play 🐾'],
    notGoodWith: ['off-leash dogs'], behaviorFlags: ['not comfortable with kids', 'reactive on leash only'],
  });
  const base = calculateCompatibility(calmAdult(), plain, 1);
  const noted = calculateCompatibility(calmAdult(), withNotes, 1);
  assert.equal(noted.score, base.score);
  assert.equal(noted.breakdown.penalty, 0);
  assert.equal(noted.quality, base.quality);
  assert.equal(noted.limits!.cautionCount, 0);
  assert.equal(noted.limits!.noteCount, 3);
  assert.equal(noted.warnings.length, 3, 'informational notes still show as warnings');
});

test('tripped limits lower the score and sink in the feed, but nobody is dropped', () => {
  const viewer = dog({ name: 'Juno', age: 'puppy', energyLevel: 60 });
  const picky = dog({ id: 'picky', name: 'Moose', age: 'adult', energyLevel: 60, notGoodWith: ['puppies'] });
  const easy = dog({ id: 'easy', name: 'Biscuit', age: 'adult', energyLevel: 60 });
  const both = calculateCompatibility(viewer, picky, 1);
  const none = calculateCompatibility(viewer, easy, 1);
  assert.ok(both.score < none.score);

  const fed = sortFeed(viewer, [
    { ...picky, distanceMiles: 0.2 },
    { ...easy, distanceMiles: 3 },
  ]);
  assert.deepEqual(fed.map((d) => d.id), ['easy', 'picky']);
});

test('legacy detectUnsafePairings wording is unchanged for the original six limits', () => {
  const b = dog({
    notGoodWith: ['small dogs', 'large dogs', 'high-energy dogs', 'puppies'],
    behaviorFlags: ['needs slow introduction', 'resource guarding'],
  });
  const a = dog({ size: 'S', age: 'puppy', energyLevel: 90, playStyles: ['loves fetch 🎾'] });
  assert.deepEqual(detectUnsafePairings(a, b), [
    'Not ideal with small dogs',
    'Prefers calmer dogs',
    'Not ideal with puppies',
    'Needs a slow introduction',
    'May have resource guarding – no toy sharing',
  ]);
  assert.deepEqual(detectUnsafePairings(calmAdult(), b), []);
});

test('labels are honest: no safety guarantee, and a mid score is not "worth a closer look"', () => {
  const grid: TestDog[] = [];
  for (const size of ['S', 'M', 'L', 'XL']) {
    for (const energy of [10, 40, 60, 90]) {
      for (const breed of ['Labrador Retriever', 'Chihuahua', 'Border Collie', 'Mixed Breed']) {
        grid.push(dog({ size, energyLevel: energy, breed }));
      }
    }
  }
  const seen = new Set<string>();
  for (const a of grid) {
    for (const b of grid) {
      const r = calculateCompatibility(a, b, 5);
      seen.add(`${r.quality}|${r.label}`);
      const text = `${r.label} ${r.microcopy}`.toLowerCase();
      assert.ok(!/\bsafe\b|perfect|worth a closer look/.test(text), text);
      if (r.quality === 'good' && r.score < 65) {
        assert.equal(r.label, 'Some overlap', `${r.score}: ${r.label}`);
      }
    }
  }
  assert.ok(seen.size >= 3, 'the grid should reach several bands');

  const top = calculateCompatibility(calmAdult(), dog({ name: 'Twin', energyLevel: 30, playStyles: ['gentle play 🐾'], vaccinated: true }), 0.2);
  assert.equal(top.quality, 'perfect');
  assert.equal(top.label, 'Strong fit');
  assert.equal(top.microcopy, 'Compatible on what owners shared 🐾');
});

test('a dog the owner marked not vaccinated is flagged as such, never as a safety verdict', () => {
  const r = calculateCompatibility(calmAdult(), dog({ name: 'Moose', vaccinated: false, energyLevel: 30, playStyles: ['gentle play 🐾'] }), 1);
  assert.equal(r.quality, 'blocked');
  assert.equal(r.label, 'Vaccination flagged');
  assert.equal(r.warnings[0], 'Owner marked: not vaccinated');
});

test('an unknown chip from a newer app is quoted, owner-named, and never throws', () => {
  const odd = dog({ name: 'Moose', notGoodWith: ['unicycles'], behaviorFlags: ['hates hats'] });
  const r = calculateCompatibility(calmAdult(), odd, 1);
  assert.ok(r.warnings.some((w) => w.includes('"unicycles"')));
  assert.ok(r.warnings.some((w) => w.includes('"hates hats"')));
  assert.equal(r.limits!.cautionCount, 0);
});

test('missing arrays and odd numbers do not throw', () => {
  const sparse = { ...dog(), notGoodWith: undefined, behaviorFlags: undefined, playStyles: undefined, energyLevel: undefined };
  assert.doesNotThrow(() => calculateCompatibility(sparse, dog({ notGoodWith: ['puppies'] }), -1));
  assert.doesNotThrow(() => analyzeLimits(sparse, sparse));
});

test('formatDistanceMiles never prints 0.0 mi and says nothing when unknown', () => {
  assert.equal(formatDistanceMiles(0), 'Under 1 mi');
  assert.equal(formatDistanceMiles(0.7), 'Under 1 mi');
  assert.equal(formatDistanceMiles(1.2), '1 mi');
  assert.equal(formatDistanceMiles(12.6), '13 mi');
  assert.equal(formatDistanceMiles(-1), null);
  assert.equal(formatDistanceMiles(undefined), null);
});
