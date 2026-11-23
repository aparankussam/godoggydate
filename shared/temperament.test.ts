import test from 'node:test';
import assert from 'node:assert/strict';
import { temperamentLabel } from './temperament.ts';

test('legacy butterfly value shows the new label', () => {
  assert.equal(temperamentLabel('Social butterfly 🦋'), 'Loves every dog 🎉');
});
test('other values, including the new label, are unchanged', () => {
  assert.equal(temperamentLabel('Playful 🎮'), 'Playful 🎮');
  assert.equal(temperamentLabel('Loves every dog 🎉'), 'Loves every dog 🎉');
});
