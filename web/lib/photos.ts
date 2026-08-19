// web/lib/photos.ts
// Shared helpers for filtering non-renderable photo values.

interface HeroSource {
  coverPhotoIndex?: number;
  coverFocusX?: number;
  coverFocusY?: number;
  ai?: { vibeCheck?: { heroPhotoIndex?: number } | null } | null;
}

/** The hero index to use: the owner's manual cover pick wins over the AI pick. */
export function resolveHeroIndex(profile?: HeroSource | null): number | undefined {
  const cover = profile?.coverPhotoIndex;
  if (typeof cover === 'number' && cover >= 0) return cover;
  return profile?.ai?.vibeCheck?.heroPhotoIndex;
}

/** CSS object-position for the cover crop (owner-set focal point; default centre). */
export function getHeroFocus(profile?: HeroSource | null): string {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const x = typeof profile?.coverFocusX === 'number' ? clamp(profile.coverFocusX) : 50;
  const y = typeof profile?.coverFocusY === 'number' ? clamp(profile.coverFocusY) : 50;
  return `${x}% ${y}%`;
}

export function getRenderablePhotos(
  photos?: Array<string | null | undefined>,
): string[] {
  return (photos ?? []).filter((photo): photo is string => {
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

/** Prefers the Vibe Check-picked hero photo (ai.vibeCheck.heroPhotoIndex —
 *  the model's own read of which uploaded photo is the best swipe-card
 *  shot) over the first photo, falling back to it if the index is stale
 *  (photos re-ordered/deleted since generation) or missing (never ran
 *  Vibe Check). */
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
