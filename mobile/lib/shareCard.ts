// mobile/lib/shareCard.ts
// One place for "capture this view and open the native share sheet". The viral
// loop is the IMAGE: every shareable card (Dogtype, Pet Twin, Milestones) bakes
// the brand + a godoggydate.com URL into the artifact itself, so a repost to
// TikTok / IG Stories / Snap / Messages carries the link even though social
// apps strip any pre-filled caption. This mirrors the existing DogTradingCard
// share on the profile screen, centralised so every card behaves identically.
//
// Callers can also pass a caption and a link (the dog's public page, a Dogtype
// page). On iOS those go through React Native's Share API, which hands the
// image file AND the caption text to the system share sheet together, so
// Messages, Mail, WhatsApp and Notes receive the image with a tappable link
// under it. expo-sharing can only share the file, so it stays the path when
// there is no caption, and on Android, where Share can't attach a file.

import { type RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';

export type ShareResult = 'shared' | 'unavailable' | 'error';

export interface ShareCaption {
  /** Text that travels with the image to apps that keep it (Messages, Mail, WhatsApp). */
  caption?: string;
  /** A public link added to the end of the caption, so the person receiving it can tap through. */
  url?: string;
}

/** The caption with the link on the end, or null when there's nothing to add. */
export function shareMessage(extras?: ShareCaption): string | null {
  const caption = extras?.caption?.trim() ?? '';
  const url = extras?.url?.trim() ?? '';
  if (!caption && !url) return null;
  if (!url || caption.includes(url)) return caption;
  return caption ? `${caption} ${url}` : url;
}

function asFileUrl(uri: string): string {
  // react-native-view-shot returns a bare path on iOS. Share reads `url` as a
  // URL, so give it an explicit file:// scheme rather than relying on the
  // native side to guess.
  return /^[a-z][a-z0-9+.-]*:/i.test(uri) ? uri : `file://${uri}`;
}

/** Shares an already-captured image file, with an optional caption and link. */
export async function shareImageFile(
  uri: string,
  dialogTitle: string,
  extras?: ShareCaption,
): Promise<ShareResult> {
  const message = shareMessage(extras);
  if (message && Platform.OS === 'ios') {
    await Share.share({ url: asFileUrl(uri), message }, { subject: dialogTitle });
    return 'shared';
  }
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return 'unavailable';
  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle,
    // UTI helps iOS route the PNG to photo-aware targets (Instagram, Messages).
    UTI: Platform.OS === 'ios' ? 'public.png' : undefined,
  });
  return 'shared';
}

export async function captureAndShare(
  ref: RefObject<View | null>,
  filename: string,
  dialogTitle: string,
  extras?: ShareCaption,
): Promise<ShareResult> {
  if (!ref.current) return 'error';
  try {
    // A confirming tap the instant the render starts — premium apps make the
    // share moment feel physical. Never let a haptics failure break the share.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    return await shareImageFile(uri, dialogTitle, extras);
  } catch (error) {
    console.warn('captureAndShare failed', error);
    return 'error';
  }
}
