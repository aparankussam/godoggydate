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

export async function shareOrDownloadCard(node: HTMLElement, fileName: string): Promise<'shared' | 'downloaded'> {
  const blob = await exportCardImage(node);
  const file = new File([blob], fileName, { type: 'image/png' });

  if (
    typeof navigator !== 'undefined' &&
    navigator.share &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: 'My dog on GoDoggyDate',
        text: 'My dog needs friends and honestly so do I.',
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
