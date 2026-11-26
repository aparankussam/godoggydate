// shared/dogLabels.ts
// Words people read about a dog, the same on web and app.

// One-letter codes read wrong next to a breed and age: "M" is Male to the
// data but Medium to a person. Spell size and sex out wherever people read them.
const SIZE_WORDS: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large', XL: 'XL' };
const SEX_WORDS: Record<string, string> = { M: 'Male', F: 'Female' };

export function dogSizeLabel(size?: string | null): string | undefined {
  return size ? SIZE_WORDS[size] ?? size : undefined;
}

/** "Dachshund · puppy · Small · Male": the Pupfile header line, same on web and app. */
export function dogSummaryLine(p: { breed?: string; age?: string; size?: string; sex?: string }): string {
  return [p.breed, p.age, dogSizeLabel(p.size), p.sex ? SEX_WORDS[p.sex] ?? p.sex : undefined].filter(Boolean).join(' · ');
}

// One rating is one owner's one afternoon: "0% would meet again" off a single
// playdate is harsh and says little. Show the rate once a few owners agree.
export const MEET_AGAIN_MIN_RATINGS = 3;

export function showsMeetAgain(p: { ratingCount?: number }): boolean {
  return (p.ratingCount ?? 0) >= MEET_AGAIN_MIN_RATINGS;
}
