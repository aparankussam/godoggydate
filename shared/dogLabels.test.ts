import test from 'node:test';
import assert from 'node:assert/strict';

import { dogSizeLabel, dogSummaryLine, showsMeetAgain } from './dogLabels.ts';

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
