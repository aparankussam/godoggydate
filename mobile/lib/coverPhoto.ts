// mobile/lib/coverPhoto.ts
// The owner's cover-photo pick — which photo leads on the profile hero and the
// swipe deck (instead of always photos[0]) — and the focal point that decides
// which part of it shows when a card crops it. An owner preference, so a plain
// client write to their own dog doc is correct (mirrors bestFriend.ts).
//
// The focal point uses the same fields and scale as web: coverFocusX and
// coverFocusY, 0–100, where web feeds them to CSS object-position. Core RN
// <Image> has no object-position, so coverCropLayout() below does the same
// arithmetic and the CoverImage component (components/CoverPhotoEditor.tsx)
// positions a cover-sized image inside a clipped box with it.

import { doc, updateDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';

interface HeroSource {
  coverPhotoIndex?: number | null;
  coverFocusX?: number | null;
  coverFocusY?: number | null;
  ai?: { vibeCheck?: { heroPhotoIndex?: number } | null } | null;
}

/** Centre of the photo — what an unset focal point means everywhere. */
export const DEFAULT_COVER_FOCUS = 50;

export interface CoverFocus {
  /** 0 = left edge, 100 = right edge. */
  x: number;
  /** 0 = top edge, 100 = bottom edge. */
  y: number;
}

/** Which photo index should lead: the owner's cover pick, else the AI hero,
 *  else undefined (caller falls back to 0). Mirrors web/lib/photos resolveHeroIndex. */
export function resolveHeroIndex(src: HeroSource | null | undefined): number | undefined {
  const cover = src?.coverPhotoIndex;
  if (typeof cover === 'number' && cover >= 0) return cover;
  const hero = src?.ai?.vibeCheck?.heroPhotoIndex;
  if (typeof hero === 'number' && hero >= 0) return hero;
  return undefined;
}

/** Clamps a stored focus value to 0–100, with the centre for anything unset. */
export function clampCoverFocus(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_COVER_FOCUS;
  return Math.max(0, Math.min(100, value));
}

/** The cover's focal point. Mirrors web/lib/photos getHeroFocus. */
export function resolveHeroFocus(src: HeroSource | null | undefined): CoverFocus {
  return { x: clampCoverFocus(src?.coverFocusX), y: clampCoverFocus(src?.coverFocusY) };
}

/** True when the owner moved the focal point off the centre. Web's swipe card
 *  only applies a focus in that case; a centred focus is a plain centre crop. */
export function hasCustomCoverFocus(src: HeroSource | null | undefined): boolean {
  return typeof src?.coverFocusX === 'number' || typeof src?.coverFocusY === 'number';
}

/** The focus to crop `photoIndex` with: the owner's focal point when that photo
 *  is the cover, else undefined (a plain centre crop). The focal point belongs
 *  to the cover photo only, so another photo in the gallery never borrows it. */
export function focusForPhoto(src: HeroSource | null | undefined, photoIndex: number, heroIndex: number): CoverFocus | undefined {
  if (photoIndex !== heroIndex || !hasCustomCoverFocus(src)) return undefined;
  return resolveHeroFocus(src);
}

/** The Pupfile hero's shape: the photo's own, kept between 4:5 and 16:9 so a
 *  very tall or wide photo doesn't take over the screen. */
export function heroAspect(natural: { width: number; height: number } | null): number {
  if (!natural || !(natural.width > 0 && natural.height > 0)) return 4 / 3;
  return Math.max(4 / 5, Math.min(16 / 9, natural.width / natural.height));
}

export interface CoverCropLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where to draw an image so it fills a box like CSS `object-fit: cover` with
 * `object-position: focusX% focusY%`. The image is scaled to cover the box,
 * then the leftover is split so that the point focusX% across the image sits
 * focusX% across the box (and the same for y). Returns null until both sizes
 * are known.
 */
export function coverCropLayout(
  boxWidth: number,
  boxHeight: number,
  imageWidth: number,
  imageHeight: number,
  focusX: number,
  focusY: number,
): CoverCropLayout | null {
  if (!(boxWidth > 0 && boxHeight > 0 && imageWidth > 0 && imageHeight > 0)) return null;
  const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    left: (boxWidth - width) * (clampCoverFocus(focusX) / 100),
    top: (boxHeight - height) * (clampCoverFocus(focusY) / 100),
    width,
    height,
  };
}

/**
 * Persist the owner's cover-photo choice (index into the real photos array).
 * A new cover starts centred: the old focal point described a different photo,
 * so keeping it would crop the new one somewhere arbitrary.
 */
export async function setCoverPhoto(uid: string, coverPhotoIndex: number): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), {
    coverPhotoIndex,
    coverFocusX: DEFAULT_COVER_FOCUS,
    coverFocusY: DEFAULT_COVER_FOCUS,
  });
}

/** Persist the cover pick together with its focal point (0–100 each). */
export async function setCoverPhotoWithFocus(uid: string, coverPhotoIndex: number, focus: CoverFocus): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, 'dogs', uid), {
    coverPhotoIndex,
    coverFocusX: Math.round(clampCoverFocus(focus.x)),
    coverFocusY: Math.round(clampCoverFocus(focus.y)),
  });
}
