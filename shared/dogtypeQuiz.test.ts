import test from 'node:test';
import assert from 'node:assert/strict';
import { DOGTYPE_CODES } from './dogtype.ts';
import {
  AXIS_ORDER,
  BASE_QUESTION_COUNT,
  QUIZ_QUESTIONS,
  TIEBREAK_QUESTIONS,
  computeQuizCode,
  quizQuestionsFor,
  tiedAxes,
} from './dogtypeQuiz.ts';

/** Base answers that give each axis the same letter twice. */
function agreeing(code: string): string[] {
  return QUIZ_QUESTIONS.map((q) => code[AXIS_ORDER.indexOf(q.axis)]);
}

test('there are 8 base questions, 2 per axis, and one tie-breaker per axis', () => {
  assert.equal(QUIZ_QUESTIONS.length, BASE_QUESTION_COUNT);
  for (const axis of AXIS_ORDER) {
    assert.equal(QUIZ_QUESTIONS.filter((q) => q.axis === axis).length, 2);
    assert.equal(TIEBREAK_QUESTIONS[axis].axis, axis);
  }
});

test('all 16 codes are reachable, and agreeing answers ask no extra questions', () => {
  for (const code of DOGTYPE_CODES) {
    const letters = agreeing(code);
    assert.deepEqual(tiedAxes(letters), []);
    assert.equal(quizQuestionsFor(letters).length, BASE_QUESTION_COUNT);
    assert.equal(computeQuizCode(letters), code);
  }
});

test('a disagreeing axis asks its tie-breaker and the tie-breaker decides', () => {
  // Energy answers disagree (E then Z); everything else agrees on EROB-like letters.
  const base = agreeing('EROB');
  base[4] = 'Z'; // the second energy question
  assert.deepEqual(tiedAxes(base), ['energy']);
  assert.equal(quizQuestionsFor(base).length, BASE_QUESTION_COUNT + 1);
  assert.equal(computeQuizCode([...base, 'E']), 'EROB');
  assert.equal(computeQuizCode([...base, 'Z']), 'ZROB');
});

test('answers 5-8 can now change the result (the old bug)', () => {
  const first = [0, 0, 0, 0].map((_, i) => QUIZ_QUESTIONS[i].answers[0].letter);
  const other = QUIZ_QUESTIONS.slice(4).map((q) => q.answers[1].letter);
  const letters = [...first, ...other]; // opposite choices on every axis -> all four tie
  assert.deepEqual(tiedAxes(letters), AXIS_ORDER);
  const toFirst = AXIS_ORDER.map((a) => TIEBREAK_QUESTIONS[a].answers[0].letter);
  const toSecond = AXIS_ORDER.map((a) => TIEBREAK_QUESTIONS[a].answers[1].letter);
  assert.equal(computeQuizCode([...letters, ...toFirst]), 'ERO' + 'B');
  assert.equal(computeQuizCode([...letters, ...toSecond]), 'ZGSM');
});
