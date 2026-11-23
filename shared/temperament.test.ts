import test from 'node:test';
import assert from 'node:assert/strict';
import { temperamentLabel, uniqueTemperament } from './temperament.ts';

test('legacy butterfly value shows the new label', () => {
  assert.equal(temperamentLabel('Social butterfly 🦋'), 'Loves every dog 🎉');
});
test('other values, including the new label, are unchanged', () => {
  assert.equal(temperamentLabel('Playful 🎮'), 'Playful 🎮');
  assert.equal(temperamentLabel('Loves every dog 🎉'), 'Loves every dog 🎉');
});

test('uniqueTemperament maps legacy values and drops duplicates', () => {
  assert.deepEqual(uniqueTemperament(['Social butterfly 🦋', 'Loves every dog 🎉', 'Calm 🧘']), ['Loves every dog 🎉', 'Calm 🧘']);
});
