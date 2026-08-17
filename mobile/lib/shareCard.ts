// mobile/lib/shareCard.ts
// One place for "capture this view and open the native share sheet". The viral
// loop is the IMAGE: every shareable card (Dogtype, Pet Twin, Milestones) bakes
// the brand + a godoggydate.com URL into the artifact itself, so a repost to
// TikTok / IG Stories / Snap / Messages carries the link even though social
// apps strip any pre-filled caption. This mirrors the existing DogTradingCard
// share on the profile screen, centralised so every card behaves identically.

import { type RefObject } from 'react';
import { Platform, type View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';

export type ShareResult = 'shared' | 'unavailable' | 'error';

export async function captureAndShare(
  ref: RefObject<View | null>,
  filename: string,
  dialogTitle: string,
): Promise<ShareResult> {
  if (!ref.current) return 'error';
  try {
    // A confirming tap the instant the render starts — premium apps make the
    // share moment feel physical. Never let a haptics failure break the share.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return 'unavailable';
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle,
      // UTI helps iOS route the PNG to photo-aware targets (Instagram, Messages).
      UTI: Platform.OS === 'ios' ? 'public.png' : undefined,
    });
    return 'shared';
  } catch (error) {
    console.warn('captureAndShare failed', error);
    return 'error';
  }
}
