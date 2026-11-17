import test from 'node:test';
import assert from 'node:assert/strict';

import { checkContent, checkContentFields, contentFilterWords } from './contentFilter.ts';

function blocked(text: string) {
  const result = checkContent(text);
  return result.ok ? null : result.reason;
}

test('ordinary dog talk is allowed, including words that look rude out of context', () => {
  for (const text of [
    'Kaju is a sweet little bitch, spayed last year',
    'Our stud is retired, no more breeding',
    'He keeps humping the couch cushion',
    'Cocker spaniel and a coonhound mix',
    'Vet says his anal glands are fine now',
    'We moved here from Niger last spring',
    'Visiting Scunthorpe this weekend',
    'She loves pumpkin spice treats',
    'This hike will kill you, bring water',
    'Sex: female. Size: medium',
    'Playdate at 10:30? Bring $5 for the coffee',
    'Ugh, the damn squirrel again',
    '',
  ]) {
    assert.equal(blocked(text), null, text);
  }
});

test('slurs are blocked, also with l33tspeak, stretched or spaced-out letters', () => {
  assert.equal(blocked('you are a faggot'), 'slur');
  assert.equal(blocked('f4gg0t'), 'slur');
  assert.equal(blocked('niiiggger'), 'slur');
  assert.equal(blocked('f a g g o t'), 'slur');
  assert.equal(blocked('what a retard'), 'slur');
  assert.equal(blocked('FAGS'), 'slur');
});

test('sexual solicitation is blocked', () => {
  assert.equal(blocked('send nudes'), 'sexual');
  assert.equal(blocked('check my onlyfans'), 'sexual');
  assert.equal(blocked('feeling horny'), 'sexual');
  assert.equal(blocked('wanna fuck after the walk?'), 'sexual');
});

test('threats and self-harm taunts are blocked', () => {
  assert.equal(blocked('kys'), 'threat');
  assert.equal(blocked('just kill yourself'), 'threat');
  assert.equal(blocked("I'm going to kill you"), 'threat');
  assert.equal(blocked('I know where you live'), 'threat');
});

test('normalising strips accents, apostrophes and l33tspeak', () => {
  assert.deepEqual(contentFilterWords("Café! I'm h0me"), ['cafe', 'im', 'home']);
});

test('checking several fields stops at the first problem', () => {
  assert.deepEqual(checkContentFields(['Kaju', null, 'loves balls']), { ok: true });
  assert.deepEqual(checkContentFields(['Kaju', 'send nudes']), { ok: false, reason: 'sexual' });
});
