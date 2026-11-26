import Image from 'next/image';

// The owner's logo art, used as supplied (1774x887, blue background).
// The box is wider than the art's 2:1, so object-cover trims empty blue above
// and below on screen; the file itself is never cropped. The art sits above
// centre (content rows 176..616), so the frame is shifted up to keep it whole.
const RATIO = 3.6;
const POS_Y = 38;

export default function BrandLogo({ height }: { height: number }) {
  const width = Math.round(height * RATIO);
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-lg" style={{ height, width }}>
      <Image
        src="/brand/godoggydate-logo-cutout.webp"
        alt="GoDoggyDate"
        fill
        sizes={`${width}px`}
        className="object-cover"
        style={{ objectPosition: `50% ${POS_Y}%` }}
        priority
      />
    </span>
  );
}
