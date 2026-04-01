// web/lib/photos.ts
// Shared helpers for filtering non-renderable photo values.

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
