import test from 'node:test';
import assert from 'node:assert/strict';

import { dogAboutText, dogSizeLabel, dogSummaryLine, showsMeetAgain } from './dogLabels.ts';

test('size and sex are spelled out, so M never reads as a size', () => {
  assert.equal(dogSummaryLine({ breed: 'Dachshund', age: 'puppy', size: 'S', sex: 'M' }), 'Dachshund · puppy · Small · Male');
  assert.equal(dogSummaryLine({ breed: 'Lab', size: 'M', sex: 'F' }), 'Lab · Medium · Female');
  assert.equal(dogSizeLabel('XL'), 'XL');
  assert.equal(dogSizeLabel(undefined), undefined);
});

test('the meet-again rate waits for 3 ratings', () => {
  assert.equal(showsMeetAgain({}), false);
  assert.equal(showsMeetAgain({ ratingCount: 1 }), false);
  assert.equal(showsMeetAgain({ ratingCount: 2 }), false);
  assert.equal(showsMeetAgain({ ratingCount: 3 }), true);
});

test('About text: the owner words win, the AI line fills in, blank stays blank', () => {
  assert.equal(dogAboutText({ bio: ' Loves the creek. ', ai: { vibeCheck: { bio: 'AI line' } } }), 'Loves the creek.');
  assert.equal(dogAboutText({ bio: '  ', ai: { vibeCheck: { bio: 'AI line' } } }), 'AI line');
  assert.equal(dogAboutText({ bio: null }), '');
});
