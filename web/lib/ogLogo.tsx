// The logo for link-preview images (next/og). satori can't read WebP and needs
// the bytes inline, so this embeds the trimmed PNG (900x234) as a data URI.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let src: string | null = null;

export function ogLogoImg(height: number) {
  src ??= `data:image/png;base64,${readFileSync(join(process.cwd(), 'public/brand/godoggydate-logo-share.png')).toString('base64')}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="GoDoggyDate" width={Math.round((height * 900) / 234)} height={height} />;
}
