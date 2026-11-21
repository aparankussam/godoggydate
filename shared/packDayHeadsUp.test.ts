import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// The engine imports its siblings without an extension (what the bundlers want);
// Node's own resolver needs one. Same shim as shared/matchingEngine.test.ts.
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

const { packDayHeadsUps } = await import('./packDayHeadsUp.ts');

function dog(uid: string, over: Record<string, unknown> = {}) {
  return {
    uid,
    profile: {
      id: uid, ownerId: uid, name: uid, breed: 'Mixed', size: 'M', age: 'adult', sex: 'M',
      energyLevel: 50, photos: [], notGoodWith: [], behaviorFlags: [], playStyles: [],
      ...over,
    } as never,
  };
}

test('a senior who prefers no puppies, with a puppy going: one modest note, counted', () => {
  const notes = packDayHeadsUps([
    dog('Moose', { size: 'XL', age: 'senior', notGoodWith: ['puppies'] }),
    dog('Juno', { size: 'L', age: 'puppy' }),
    dog('Waffles', { size: 'S' }),
  ]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, "Moose's owner prefers no puppies — 1 puppy is going");
  assert.equal(notes[0].holderUid, 'Moose');
});

test('counts, plurals, and the viewer reading their own limit', () => {
  const dogs = [
    dog('Waffles', { size: 'S', notGoodWith: ['large dogs'] }),
    dog('Juno', { size: 'L' }),
    dog('Moose', { size: 'XL' }),
    dog('Pip', { size: 'S' }),
  ];
  assert.deepEqual(packDayHeadsUps(dogs).map((n) => n.text), [
    "Waffles's owner prefers no large dogs — 2 large dogs are going",
  ]);
  assert.deepEqual(packDayHeadsUps(dogs, { viewerUid: 'Waffles' }).map((n) => n.text), [
    'You prefer no large dogs — 2 large dogs are going',
  ]);
});

test('no conflict, no note: limits nobody trips stay quiet', () => {
  assert.deepEqual(packDayHeadsUps([
    dog('A', { notGoodWith: ['puppies', 'small dogs'] }),
    dog('B', { size: 'L', age: 'adult' }),
  ]), []);
  assert.deepEqual(packDayHeadsUps([]), []);
  assert.deepEqual(packDayHeadsUps([dog('Solo', { notGoodWith: ['puppies'] })]), []); // alone is not a conflict
});

test('a dog never trips its own limit', () => {
  assert.deepEqual(packDayHeadsUps([dog('Pup', { age: 'puppy', notGoodWith: ['puppies'] })]), []);
});

test('limits without a count noun name the dogs', () => {
  const notes = packDayHeadsUps([
    dog('Calm', { behaviorFlags: ['prefers calm dogs'], energyLevel: 20 }),
    dog('Zoom', { energyLevel: 95, playStyles: ['high-energy runner ⚡'] }),
    dog('Zip', { energyLevel: 90 }),
    dog('Zap', { energyLevel: 92 }),
  ]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, "Calm's owner prefers calm dogs — Zoom, Zip and 1 more are going");
});

test('hostile and missing data does not throw', () => {
  const odd = dog('Odd', { name: '   ', notGoodWith: ['puppies', '<script>alert(1)</script>', 42 as never], behaviorFlags: undefined, playStyles: undefined, energyLevel: undefined, size: undefined, age: undefined });
  const pup = dog('Pup', { name: 'Pup', age: 'puppy' });
  const notes = packDayHeadsUps([odd, pup]);
  assert.equal(notes.length, 1);
  assert.ok(notes[0].text.endsWith('— 1 puppy is going'));
  assert.ok(!notes[0].text.includes('<'));
});
