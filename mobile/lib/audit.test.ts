import test from 'node:test';
import assert from 'node:assert/strict';

import { getOtherDogId, isMatchUnread, makeMatchId, stripUndefined } from './firestoreData.ts';

test('stripUndefined removes undefined values recursively', () => {
  const input = {
    name: 'Kaju',
    breed: undefined,
    nested: {
      city: 'Troy',
      state: undefined,
    },
    photos: ['a', undefined, 'b'],
  };

  assert.deepEqual(stripUndefined(input), {
    name: 'Kaju',
    nested: {
      city: 'Troy',
    },
    photos: ['a', 'b'],
  });
});

test('getOtherDogId resolves the non-current dog for current Firestore match schema', () => {
  assert.equal(
    getOtherDogId(
      {
        dog1Id: 'dog-a',
        dog2Id: 'dog-b',
        dog1UserId: 'user-a',
        dog2UserId: 'user-b',
      },
      'user-a',
    ),
    'dog-b',
  );
});

test('getOtherDogId resolves the non-current dog for legacy seeded match schema', () => {
  assert.equal(
    getOtherDogId(
      {
        dogAId: 'dog-a',
        dogBId: 'dog-b',
        userAId: 'user-a',
        userBId: 'user-b',
      },
      'user-b',
    ),
    'dog-a',
  );
});

test('makeMatchId is deterministic regardless of swipe order', () => {
  assert.equal(makeMatchId('user-b', 'user-a'), 'user-a_user-b');
});

test('isMatchUnread returns true when the other user sent the last message after my last read', () => {
  assert.equal(
    isMatchUnread(
      {
        dog1UserId: 'user-a',
        dog2UserId: 'user-b',
        lastMessageFromUid: 'user-b',
        dog1LastReadAt: 100,
      },
      'user-a',
      200,
    ),
    true,
  );
});
