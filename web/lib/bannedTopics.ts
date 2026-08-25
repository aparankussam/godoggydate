// web/lib/bannedTopics.ts
// The honesty backstop for the AI routes — a post-generation reject list that
// guarantees a slip never ships on the non-negotiable topics (weight/body,
// rescue/trauma, illness/mortality), no matter what the model emits.
//
// TWO TIERS, because one regex shape can't do both jobs:
//   • STEMS match as a PREFIX (leading \b only) so every inflected form is
//     caught: 'euthan' → euthanized/euthanasia, 'abandon' → abandoned,
//     'surrender' → surrendered, 'neglect' → neglected, 'trauma' → traumatic.
//     A trailing \b (the old bug) made these match nothing, silently gutting
//     the backstop on exactly the topics that matter most.
//   • WORDS match as WHOLE words (\b…\b) so short/ambiguous tokens don't
//     false-positive: 'fat' ≠ father, 'ill' ≠ chill, 'vet' ≠ velvet,
//     'hip' ≠ chip, 'die' ≠ diet. (That false-positive storm is what surfaced
//     "Could not write it" for nearly every clean generation.)
//
// Prefix stems are chosen to be long/unambiguous enough that no benign word
// collides (verified: 'shelter' ∌ sheltie, 'stray' ∌ straight, 'cancer' ∌
// cancel, 'obes' ∌ obey).

/** Rescue/trauma + illness/mortality stems — matched as a prefix (any form). */
export const DOG_TOPIC_STEMS = [
  // rescue / trauma / past
  'abandon', 'surrender', 'neglect', 'trauma', 'abus', 'euthan',
  'shelter', 'rescue', 'foster', 'kennel', 'stray',
  // health / illness / body function
  'sick', 'illness', 'disease', 'cancer', 'tumor', 'arthriti', 'seizure',
  'allerg', 'surger', 'injur', 'suffer', 'diagnos', 'symptom', 'medicat',
  'obes',
];

/** Whole-word entries — short/ambiguous, so they must be bounded both sides. */
export const DOG_TOPIC_WORDS = [
  // weight / body / appearance
  'fat', 'fatty', 'chubby', 'chonk', 'chonky', 'overweight', 'underweight',
  'skinny', 'weight', 'pounds', 'pound', 'heavy', 'thicc', 'thick', 'ugly',
  'gross', 'smelly', 'stink', 'flabby', 'tubby', 'porky', 'diet',
  // rescue / past (multi-word phrases stay exact)
  'previous owner', 'past owner', 'former owner',
  // health / mortality / body
  'ill', 'vet', 'meds', 'medicine', 'dying', 'die', 'died', 'death',
  'hip', 'joint', 'limp', 'blind', 'deaf', 'pain', 'painful',
];

/** Extra stems for routes about a PERSON (My Human review): mental-health and
 *  relationship mockery on top of the shared body/health set. Deliberately does
 *  NOT include poverty/relationship-status commons (poor/single/broke/lazy) —
 *  those over-block innocent nitpicks and are already handled by the prompt. */
export const PERSON_TOPIC_STEMS = ['divorc', 'depress', 'bankrupt'];

/**
 * Build a case-insensitive regex where STEMS match as a prefix and WORDS match
 * as whole words: \b( stem1 | stem2 | … | (word1|word2|…)\b ).
 */
export function buildBannedTopicRegex(stems: string[], words: string[]): RegExp {
  const s = stems.map((w) => w.trim()).filter(Boolean).join('|');
  const w = words.map((x) => x.trim()).filter(Boolean).join('|');
  return new RegExp(`\\b(?:${s}|(?:${w})\\b)`, 'i');
}
