'use client';
// web/lib/shareCard.ts
// Renders a DogTradingCard DOM node to a PNG and shares/downloads it.

export async function exportCardImage(node: HTMLElement): Promise<Blob> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(node, {
    backgroundColor: null,
    scale: 2, // crisp on retina + when re-shared to social
    useCORS: true,
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not render card image'));
    }, 'image/png');
  });
}

export interface ShareCardOptions {
  /** Public /d/[slug] URL for this dog — poster-centric share copy needs a
   *  real link, since screenshots strip metadata and most re-shares strip
   *  the original share-sheet URL. Without this the card was a dead end:
   *  no opengraph-image existed anywhere, so past shares just unfurled as
   *  bare links with nothing to tap through to. */
  publicUrl?: string;
  dogName?: string;
  /** Overrides the default share caption. Used by feature-specific cards
   *  (Dogtype, milestones, Pet Twin) that want their own hook copy while
   *  still sharing the same image + public URL. */
  shareText?: string;
  /** Overrides the share-sheet title. */
  shareTitle?: string;
}

export async function shareOrDownloadCard(
  node: HTMLElement,
  fileName: string,
  options: ShareCardOptions = {},
): Promise<'shared' | 'downloaded'> {
  const blob = await exportCardImage(node);
  const file = new File([blob], fileName, { type: 'image/png' });
  const { publicUrl, dogName } = options;
  const shareText =
    options.shareText ??
    (publicUrl
      ? `That's ${dogName ?? 'my dog'} on GoDoggyDate — see her page: ${publicUrl}`
      : 'My dog needs friends and honestly so do I.');

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: options.shareTitle ?? 'My dog on GoDoggyDate',
        text: shareText,
        url: publicUrl,
      });
      return 'shared';
    } catch {
      // User cancelled the share sheet — fall through to download.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
