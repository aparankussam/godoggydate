// mobile/lib/vibeCheck.ts
// Mirrors web/lib/vibeCheck.ts — small display helpers shared by every
// surface that renders Vibe Check data.

/** archetype.code has no fixed per-letter meaning — the model "chooses" a
 *  letter per axis per dog (see web/app/api/ai/vibe-check/route.ts's schema
 *  description, the only place this is generated). Never claim what a
 *  specific letter means; only name the four axes it spans. */
export const VIBE_CODE_AXES = 'energy · sociability · boldness · focus';

export function breedConfidencePhrase(confidence: 'low' | 'medium' | 'high'): string {
  if (confidence === 'high') return 'would bet on it';
  if (confidence === 'medium') return 'pretty sure';
  return 'a wild guess';
}
