import Image from 'next/image';

// The owner's logo art, used as supplied (1774x887, blue background).
// The box is shorter than the art's 2:1 ratio, so object-cover trims the
// empty blue above and below on screen; the file itself is never cropped.
export default function BrandLogo({ height }: { height: number }) {
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-lg"
      style={{ height, width: Math.round(height * 3.9) }}
    >
      <Image
        src="/brand/godoggydate-logo.webp"
        alt="GoDoggyDate"
        fill
        sizes={`${Math.round(height * 3.9)}px`}
        className="object-cover object-center"
        priority
      />
    </span>
  );
}
