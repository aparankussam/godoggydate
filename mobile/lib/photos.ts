// mobile/lib/photos.ts
// Mirrors web/lib/photos.ts — shared helpers for filtering non-renderable
// photo values and picking the Vibe Check hero photo.

export function getRenderablePhotos(
  photos?: Array<string | null | undefined>,
): string[] {
  // Array.isArray, not `?? []` — callers pass values straight off a Firestore
  // document, where a malformed/legacy field can be a non-array. `??` only
  // substitutes for null/undefined, so a string or object would reach .filter
  // and throw.
  if (!Array.isArray(photos)) return [];
  return photos.filter((photo): photo is string => {
    if (typeof photo !== 'string') return false;
    const trimmed = photo.trim();
    return trimmed !== '' && trimmed !== '_placeholder_';
  });
}

export function getPrimaryRenderablePhoto(
  photos?: Array<string | null | undefined>,
): string | null {
  return getRenderablePhotos(photos)[0] ?? null;
}

/** Prefers the Vibe Check-picked hero photo (ai.vibeCheck.heroPhotoIndex)
 *  over the first photo, falling back if the index is stale or missing. */
export function getHeroPhoto(
  photos?: Array<string | null | undefined>,
  heroIndex?: number,
): string | null {
  const raw = photos ?? [];
  if (typeof heroIndex === 'number' && heroIndex >= 0 && heroIndex < raw.length) {
    const candidate = raw[heroIndex];
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed !== '' && trimmed !== '_placeholder_') return candidate;
    }
  }
  return getPrimaryRenderablePhoto(photos);
}
