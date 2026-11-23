// shared/dogtypeQuiz.ts
// The Dogtype quiz's questions and scoring, shared so the website and any future
// surface agree. 8 base questions, 2 per axis. Two answers on an axis either agree
// (that letter wins) or tie. A tie is settled by ONE extra question for that axis,
// asked after the base 8, so every answer can matter and no axis is decided by
// question order. Fully deterministic: no randomness, no rerolls.

import type { DogtypeAxisKey } from './dogtype';

export interface QuizAnswer {
  letter: string;
  emoji: string;
  line: string;
}

export interface QuizQuestion {
  axis: DogtypeAxisKey;
  prompt: string;
  answers: [QuizAnswer, QuizAnswer];
}

export const AXIS_ORDER: DogtypeAxisKey[] = ['energy', 'play', 'social', 'spirit'];
export const BASE_QUESTION_COUNT = 8;

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    axis: 'energy',
    prompt: "It's 7 a.m. on a Saturday. Where's {name}?",
    answers: [
      { letter: 'E', emoji: '⚡', line: 'Standing on your chest, ready for adventure' },
      { letter: 'Z', emoji: '😴', line: 'A warm lump under the blankets — do not disturb' },
    ],
  },
  {
    axis: 'play',
    prompt: 'A brand-new squeaky toy enters the house…',
    answers: [
      { letter: 'R', emoji: '🤼', line: 'Shaken, wrestled, gloriously de-stuffed by dinner' },
      { letter: 'G', emoji: '🌸', line: 'Carried around gently like precious treasure' },
    ],
  },
  {
    axis: 'social',
    prompt: 'A dog {name} has never met appears at the park…',
    answers: [
      { letter: 'O', emoji: '🎉', line: 'Instant best friend — no questions asked' },
      { letter: 'S', emoji: '🛡️', line: 'Hmm. New friends may apply for approval first' },
    ],
  },
  {
    axis: 'spirit',
    prompt: 'A big, weird, unfamiliar object shows up on your walk.',
    answers: [
      { letter: 'B', emoji: '🚀', line: 'Marches straight up to investigate it' },
      { letter: 'M', emoji: '☁️', line: 'Peeks at it from safely behind your legs' },
    ],
  },
  {
    axis: 'energy',
    prompt: 'How does a game of fetch usually end?',
    answers: [
      { letter: 'E', emoji: '🎾', line: "It doesn't — your throwing arm gives out first" },
      { letter: 'Z', emoji: '🧘', line: 'One dignified retrieve, then a nice lie-down' },
    ],
  },
  {
    axis: 'play',
    prompt: 'Roughhousing with a trusted dog friend looks like…',
    answers: [
      { letter: 'R', emoji: '😤', line: 'Full-contact wrestling, flying paws everywhere' },
      { letter: 'G', emoji: '🐾', line: 'Gentle bitey-face and soft, polite rolls' },
    ],
  },
  {
    axis: 'social',
    prompt: 'You have friends over. {name} spends the evening…',
    answers: [
      { letter: 'O', emoji: '🥳', line: 'Working the entire room for pats and snacks' },
      { letter: 'S', emoji: '🕵️', line: 'Bonding deeply with one hand-picked favorite' },
    ],
  },
  {
    axis: 'spirit',
    prompt: 'A thunderstorm rolls in. {name}…',
    answers: [
      { letter: 'B', emoji: '😎', line: 'Barely looks up from the nap' },
      { letter: 'M', emoji: '🧸', line: 'Relocates immediately to your lap' },
    ],
  },
];

/** One extra question per axis, asked only when that axis's two answers disagreed. */
export const TIEBREAK_QUESTIONS: Record<DogtypeAxisKey, QuizQuestion> = {
  energy: {
    axis: 'energy',
    prompt: 'At the end of a long day, {name} is…',
    answers: [
      { letter: 'E', emoji: '🧸', line: 'Still bringing you a toy' },
      { letter: 'Z', emoji: '😴', line: 'Already asleep at your feet' },
    ],
  },
  play: {
    axis: 'play',
    prompt: 'At the dog park, {name} usually…',
    answers: [
      { letter: 'R', emoji: '🏃', line: 'Starts the chase game' },
      { letter: 'G', emoji: '🌿', line: 'Waits for a gentle sniff-and-stroll' },
    ],
  },
  social: {
    axis: 'social',
    prompt: "In the vet's waiting room, {name}…",
    answers: [
      { letter: 'O', emoji: '👋', line: 'Greets every dog and human' },
      { letter: 'S', emoji: '👀', line: 'Sits close and watches the room' },
    ],
  },
  spirit: {
    axis: 'spirit',
    prompt: 'A new trick is being taught. {name}…',
    answers: [
      { letter: 'B', emoji: '💪', line: 'Tries it boldly, mistakes and all' },
      { letter: 'M', emoji: '🐢', line: 'Wants to be sure first, in tiny steps' },
    ],
  },
};

function axisLetters(letters: string[]): Record<DogtypeAxisKey, string[]> {
  const byAxis: Record<DogtypeAxisKey, string[]> = { energy: [], play: [], social: [], spirit: [] };
  letters.slice(0, BASE_QUESTION_COUNT).forEach((letter, i) => {
    const q = QUIZ_QUESTIONS[i];
    if (q) byAxis[q.axis].push(letter);
  });
  return byAxis;
}

/** Axes whose two base answers disagree, in axis order. Needs all 8 base answers. */
export function tiedAxes(letters: string[]): DogtypeAxisKey[] {
  if (letters.length < BASE_QUESTION_COUNT) return [];
  const byAxis = axisLetters(letters);
  return AXIS_ORDER.filter((axis) => byAxis[axis].length === 2 && byAxis[axis][0] !== byAxis[axis][1]);
}

/** The questions to ask for the answers given so far: the 8 base, then one tie-breaker per tied axis. */
export function quizQuestionsFor(letters: string[]): QuizQuestion[] {
  return [...QUIZ_QUESTIONS, ...tiedAxes(letters).map((axis) => TIEBREAK_QUESTIONS[axis])];
}

/** The 4-letter code. `letters` = 8 base answers, then the tie-breakers in tied-axis order. */
export function computeQuizCode(letters: string[]): string {
  const byAxis = axisLetters(letters);
  const ties = tiedAxes(letters);
  return AXIS_ORDER.map((axis) => {
    const [first, second] = byAxis[axis];
    if (first === second) return first;
    const idx = ties.indexOf(axis);
    return letters[BASE_QUESTION_COUNT + idx] ?? first;
  }).join('');
}
