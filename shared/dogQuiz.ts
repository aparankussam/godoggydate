// shared/dogQuiz.ts
// "Who actually knows this dog?" — a pass-the-phone party quiz.
//
// NO AI, NO backend. Ten hand-written, curated multiple-choice questions about
// a dog (sleeping spot, snack hierarchy, fear ranking, and so on). The OWNER
// sets the answer KEY — their true answers for THEIR dog — and then friends and
// family answer the same questions and are scored against that key. The whole
// thing runs client-side on the owner's authenticated device; guests need no
// account and nothing is ever written to a server.
//
// HONESTY: a score here is a REAL measurement — the literal count of how many of
// a guest's picks matched the owner's stated answers. It is never a fabricated
// stat and never a claim about the dog itself; it only ever says "you matched N
// of the owner's 10 answers". The verdict labels are playful and clearly framed
// as such. No question touches weight, body, health/illness, or rescue history —
// they are all light, everyday "how well do you know this goofball" prompts.

export interface DogQuizOption {
  /** Stable id used in the key/guess maps — never renumber existing ones. */
  id: string;
  label: string;
}

export interface DogQuizQuestion {
  /** Stable id used as the map key — never rename existing ones. */
  id: string;
  emoji: string;
  /** Prompt text. May contain the literal token `{name}` for the dog's name. */
  prompt: string;
  options: DogQuizOption[];
}

/** questionId → chosen optionId. Used for both the owner's key and a guess. */
export type DogQuizKey = Record<string, string>;

// ── The ten curated questions ────────────────────────────────────────────────
// Each has a small, concrete set of options so the same dog maps cleanly to one
// answer. Kept deliberately universal (any dog's owner can pick a true answer)
// and deliberately light — everyday habits and quirks, nothing about a dog's
// body, health, or past.

export const DOG_QUIZ_QUESTIONS: DogQuizQuestion[] = [
  {
    id: 'sleep',
    emoji: '🛏️',
    prompt: 'Where does {name} actually sleep at night?',
    options: [
      { id: 'in-bed', label: 'In my bed, ideally on my head' },
      { id: 'foot', label: 'At the foot of the bed' },
      { id: 'own-bed', label: 'Their own dog bed' },
      { id: 'couch', label: 'The couch (not allowed, still there)' },
      { id: 'roams', label: 'A different spot every single night' },
    ],
  },
  {
    id: 'snack',
    emoji: '🍗',
    prompt: 'Top of {name}’s snack hierarchy?',
    options: [
      { id: 'cheese', label: 'Cheese, obviously' },
      { id: 'meat', label: 'Chicken or any meat' },
      { id: 'pb', label: 'Peanut butter' },
      { id: 'human', label: 'Whatever a human is eating' },
      { id: 'crunchy', label: 'Carrots and crunchy veg' },
    ],
  },
  {
    id: 'fear',
    emoji: '😱',
    prompt: 'What sends {name} running for cover?',
    options: [
      { id: 'vacuum', label: 'The vacuum' },
      { id: 'storms', label: 'Thunder and fireworks' },
      { id: 'delivery', label: 'The mail carrier / deliveries' },
      { id: 'bath', label: 'Bath time' },
      { id: 'nails', label: 'Nail trims' },
      { id: 'fearless', label: 'Honestly? Nothing. Fearless.' },
    ],
  },
  {
    id: 'greeting',
    emoji: '🎉',
    prompt: 'How does {name} greet you at the door?',
    options: [
      { id: 'zoomies', label: 'Full-body zoomies' },
      { id: 'gift', label: 'Sprints off to fetch a toy or gift' },
      { id: 'wiggle', label: 'The whole-body wiggle butt' },
      { id: 'scream', label: 'Screams (the happy howl)' },
      { id: 'cool', label: 'Too cool — a slow stroll over' },
    ],
  },
  {
    id: 'walk',
    emoji: '🦮',
    prompt: '{name} on a walk is best described as...',
    options: [
      { id: 'sniff', label: 'Must sniff every single thing' },
      { id: 'pull', label: 'Pulls like a sled dog' },
      { id: 'heel', label: 'A perfect heel (mostly)' },
      { id: 'refuse', label: 'Stops and refuses to move' },
      { id: 'social', label: 'Says hi to every human and dog' },
    ],
  },
  {
    id: 'toy',
    emoji: '🧸',
    prompt: '{name}’s ride-or-die toy?',
    options: [
      { id: 'squeaky', label: 'A squeaky one' },
      { id: 'stuffed', label: 'A ratty, beloved stuffed animal' },
      { id: 'ball', label: 'The ball. Always the ball.' },
      { id: 'rope', label: 'A rope or tug toy' },
      { id: 'stolen', label: 'Whatever they stole and shouldn’t have' },
    ],
  },
  {
    id: 'doorbell',
    emoji: '🔔',
    prompt: 'The doorbell rings. {name}:',
    options: [
      { id: 'bark', label: 'Barks the house down' },
      { id: 'party', label: 'Runs to greet like it’s a party' },
      { id: 'hide', label: 'Vanishes / hides' },
      { id: 'sleep', label: 'Sleeps clean through it' },
      { id: 'boof', label: 'One single "boof," then done' },
    ],
  },
  {
    id: 'water',
    emoji: '💦',
    prompt: 'How does {name} feel about water?',
    options: [
      { id: 'swim', label: 'Will swim anywhere, anytime' },
      { id: 'shallow', label: 'Only if it’s nice and shallow' },
      { id: 'dry', label: 'Hard no — stays dry, thanks' },
      { id: 'hose', label: 'Lives for the hose / sprinkler' },
      { id: 'drink', label: 'Drinks it, refuses to swim in it' },
    ],
  },
  {
    id: 'cuddle',
    emoji: '🫶',
    prompt: '{name}’s cuddle style is...',
    options: [
      { id: 'lap', label: 'Full lap dog — personal space is fake' },
      { id: 'lean', label: 'The lean — all their weight on you' },
      { id: 'nearby', label: 'Nearby, but not touching' },
      { id: 'terms', label: 'Only on their own terms' },
      { id: 'belly', label: 'Belly-up: rub, please' },
    ],
  },
  {
    id: 'mischief',
    emoji: '😈',
    prompt: '{name}’s signature bit of mischief?',
    options: [
      { id: 'counter', label: 'Counter-surfing / swiping food' },
      { id: 'dig', label: 'Digging holes' },
      { id: 'shred', label: 'Shredding paper and tissues' },
      { id: 'trash', label: 'The trash raccoon' },
      { id: 'angel', label: 'None. A perfect, blameless angel.' },
    ],
  },
];

export const DOG_QUIZ_LENGTH = DOG_QUIZ_QUESTIONS.length;

/** Replace the `{name}` token in a prompt with the dog's name. */
export function quizPrompt(prompt: string, dogName: string): string {
  const name = dogName.trim() || 'your dog';
  return prompt.replace(/\{name\}/g, name);
}

/** Look up an option's label within a question, or null if not present. */
export function optionLabel(question: DogQuizQuestion, optionId: string | null | undefined): string | null {
  if (!optionId) return null;
  return question.options.find((o) => o.id === optionId)?.label ?? null;
}

/** True once the owner's key has a valid answer for every question. */
export function isKeyComplete(key: DogQuizKey | null | undefined): boolean {
  if (!key) return false;
  return DOG_QUIZ_QUESTIONS.every((q) => {
    const chosen = key[q.id];
    return typeof chosen === 'string' && q.options.some((o) => o.id === chosen);
  });
}

export interface DogQuizPerQuestion {
  questionId: string;
  keyOptionId: string | null;
  guessOptionId: string | null;
  /** Only true when a real key answer exists AND the guess matches it. */
  correct: boolean;
}

export interface DogQuizScore {
  /** Number of guesses that matched the owner's key. */
  correct: number;
  /** Total questions the key answers (the honest denominator). */
  total: number;
  /** How many the guest actually answered (may be < total if they bailed). */
  answered: number;
  perQuestion: DogQuizPerQuestion[];
}

/**
 * Score a guest's guesses against the owner's key. Deterministic and honest:
 * `correct` is the literal count of matches, `total` is the number of questions
 * the key actually answers. A question the key never answered can never be
 * "correct" and is excluded from `total`, so the denominator is never inflated.
 */
export function scoreDogQuiz(key: DogQuizKey, guesses: DogQuizKey): DogQuizScore {
  let correct = 0;
  let total = 0;
  let answered = 0;
  const perQuestion: DogQuizPerQuestion[] = [];

  for (const q of DOG_QUIZ_QUESTIONS) {
    const keyOptionId = q.options.some((o) => o.id === key[q.id]) ? key[q.id] : null;
    const guessOptionId = q.options.some((o) => o.id === guesses[q.id]) ? guesses[q.id] : null;
    if (keyOptionId) total += 1;
    if (guessOptionId) answered += 1;
    const isCorrect = keyOptionId !== null && guessOptionId === keyOptionId;
    if (isCorrect) correct += 1;
    perQuestion.push({ questionId: q.id, keyOptionId, guessOptionId, correct: isCorrect });
  }

  return { correct, total, answered, perQuestion };
}

export interface DogQuizVerdict {
  emoji: string;
  /** Short, playful label for the score — never presented as a real metric. */
  label: string;
}

/**
 * A playful verdict for a score. Purely a fun label on the real fraction
 * (correct / total) — clearly framed as playful in the UI, never a rating of
 * the person or the dog.
 */
export function scoreVerdict(score: DogQuizScore): DogQuizVerdict {
  const total = score.total || DOG_QUIZ_LENGTH;
  const pct = score.correct / total;
  if (score.correct === total) return { emoji: '🏆', label: 'Certified soulmate' };
  if (pct >= 0.8) return { emoji: '🥇', label: 'Basically family' };
  if (pct >= 0.6) return { emoji: '🐶', label: 'Knows the good boy well' };
  if (pct >= 0.4) return { emoji: '🤔', label: 'A casual acquaintance' };
  if (pct >= 0.2) return { emoji: '👋', label: 'You two should hang out more' };
  return { emoji: '🫥', label: 'Have you met this dog?' };
}

export interface DogQuizScoreboardEntry {
  /** Stable id for React keys / removal — assign in the UI layer. */
  id: string;
  name: string;
  correct: number;
  total: number;
}

/** Sort scoreboard entries best-first (ties keep insertion order, stable). */
export function rankScoreboard(entries: DogQuizScoreboardEntry[]): DogQuizScoreboardEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.correct - a.e.correct) || (a.i - b.i))
    .map(({ e }) => e);
}

/** Compact one-line scoreboard summary, e.g. "Mom 9/10 · Dad 3/10". */
export function scoreboardSummary(entries: DogQuizScoreboardEntry[], limit = 4): string {
  return rankScoreboard(entries)
    .slice(0, limit)
    .map((e) => `${e.name} ${e.correct}/${e.total}`)
    .join(' · ');
}
