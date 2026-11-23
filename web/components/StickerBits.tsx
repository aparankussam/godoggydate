// web/components/StickerBits.tsx
// Small "Sticker Book, grown up" pieces shared by the public landing page and
// the Dogtype quiz/result: the paw coin, kraft tape, the drawn sticker dog and
// a few icons. Pure presentational, no state.

import type { CSSProperties } from 'react';

export function PawCoin({ size = 34, className = '' }: { size?: number; className?: string }) {
  const icon = Math.round(size * 0.6);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-brown bg-paper shadow-[0_3px_0_rgba(42,31,74,0.28)] -rotate-[8deg] ${className}`}
      style={{ width: size, height: size }}
    >
      <PawIcon size={icon} />
    </span>
  );
}

export function PawIcon({ size = 20, color = '#2A1F4A' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={color} className="block shrink-0">
      <ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" />
      <ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" />
      <ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" />
      <ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" />
      <path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" />
    </svg>
  );
}

const TAPE_BG =
  'repeating-linear-gradient(115deg, rgba(217,188,140,0.94) 0 7px, rgba(230,207,166,0.94) 7px 14px)';
const TAPE_CLIP =
  'polygon(0 0, 3% 17%, 0 33%, 3% 50%, 0 67%, 3% 83%, 0 100%, 100% 100%, 97% 83%, 100% 67%, 97% 50%, 100% 33%, 97% 17%, 100% 0)';

export function Tape({ style }: { style?: CSSProperties }) {
  return (
    <span
      aria-hidden="true"
      className="absolute z-[3] block"
      style={{ background: TAPE_BG, clipPath: TAPE_CLIP, ...style }}
    />
  );
}

/** The drawn sticker dog standing in for "your dog". */
export function StickerDog({ size = 80, label = 'A drawn sticker dog standing in for your dog' }: { size?: number; label?: string }) {
  const earL = 'M17 12.5C11.5 10.8 6 14 6 20.2c0 4.6 1.5 7.8 4 9.3 3-1.8 5-5.3 5.8-9.5z';
  const earR = 'M31 12.5c5.5-1.7 11 1.5 11 7.7 0 4.6-1.5 7.8-4 9.3-3-1.8-5-5.3-5.8-9.5z';
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 48 48" className="block shrink-0">
      <g fill="#2A1F4A" stroke="#2A1F4A" strokeWidth="7.2" strokeLinejoin="round">
        <path d={earL} />
        <path d={earR} />
        <ellipse cx="24" cy="26" rx="13.5" ry="12.5" />
      </g>
      <g fill="#FFF9EC" stroke="#FFF9EC" strokeWidth="4.2" strokeLinejoin="round">
        <path d={earL} />
        <path d={earR} />
        <ellipse cx="24" cy="26" rx="13.5" ry="12.5" />
      </g>
      <ellipse cx="24" cy="26" rx="13.5" ry="12.5" fill="#FFF1D6" />
      <path d="M27 16.5c4-1 8.5 1.5 9.5 6 .7 3.5-1.5 7-5 7.3-3.5.2-6-2.3-6.2-5.8-.2-3 .3-6 1.7-7.5z" fill="#E7B987" />
      <path d={earL} fill="#C98A4E" />
      <path d={earR} fill="#C98A4E" />
      <ellipse cx="24" cy="32" rx="7.6" ry="6" fill="#FFFFFF" />
      <circle cx="18.3" cy="24.6" r="2.1" fill="#2A1F4A" />
      <circle cx="29.7" cy="24.6" r="2.1" fill="#2A1F4A" />
      <ellipse cx="24" cy="29" rx="3.1" ry="2.3" fill="#2A1F4A" />
      <path
        d="M24 31.2v2.3m0 0c-1.3 1.7-3.6 1.5-4.2-.2m4.2.2c1.3 1.7 3.6 1.5 4.2-.2"
        fill="none"
        stroke="#2A1F4A"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Chevron({ w = 13, h = 20 }: { w?: number; h?: number }) {
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox="0 0 13 20" className="shrink-0">
      <path d="M3.5 3.5L9.5 10l-6 6.5" fill="none" stroke="#2A1F4A" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShareIcon({ size = 24 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="block shrink-0">
      <path
        d="M12 15.2V3.8M7 8.2l5-4.6 5 4.6M4.6 12.8v5.4a2 2 0 0 0 2 2h10.8a2 2 0 0 0 2-2v-5.4"
        fill="none"
        stroke="#2A1F4A"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Trait-chip icons, keyed by the Dogtype pole letter. Falls back to a paw. */
export function PoleIcon({ letter, size = 15 }: { letter: string; size?: number }) {
  const ink = '#2A1F4A';
  const paper = '#FFF9EC';
  const common = { 'aria-hidden': true, width: size, height: size, viewBox: '0 0 24 24', className: 'shrink-0' } as const;
  switch (letter) {
    case 'E': // Spark: bolt
      return (
        <svg {...common}>
          <path d="M13.8 2L4.8 13.6h5.4l-1.5 8.2 9.3-12.2h-5.7z" fill={ink} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'Z': // Zen: crescent
      return (
        <svg {...common}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" fill={ink} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'R': // Rowdy: burst
      return (
        <svg {...common}>
          <path d="M22 12l-4.8 2.1 1.9 5-5-1.9L12 22l-2.1-4.8-5 1.9 1.9-5L2 12l4.8-2.1-1.9-5 5 1.9L12 2l2.1 4.8 5-1.9-1.9 5z" fill={ink} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'O': // Outgoing: smile
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill={ink} />
          <circle cx="8.6" cy="9.8" r="1.6" fill={paper} />
          <circle cx="15.4" cy="9.8" r="1.6" fill={paper} />
          <path d="M7.4 13.8c1 2.3 2.6 3.5 4.6 3.5s3.6-1.2 4.6-3.5" fill="none" stroke={paper} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'B': // Bold: flag
      return (
        <svg {...common}>
          <path d="M5.6 3v18.5" fill="none" stroke={ink} strokeWidth="2.8" strokeLinecap="round" />
          <path d="M7.6 3.8h12l-3.4 4.5 3.4 4.5h-12z" fill={ink} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'G': // Gentle: heart
      return (
        <svg {...common}>
          <path d="M12 20.5C5 15.5 3 12 3 8.8 3 6.2 5 4.5 7.3 4.5c1.9 0 3.5 1.1 4.7 3 1.2-1.9 2.8-3 4.7-3C19 4.5 21 6.2 21 8.8c0 3.2-2 6.7-9 11.7z" fill={ink} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case 'S': // Selective: shield-ish circle ring
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke={ink} strokeWidth="3" />
          <circle cx="12" cy="12" r="2.6" fill={ink} />
        </svg>
      );
    case 'M': // Mindful/Mellow: cloud
      return (
        <svg {...common}>
          <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 17.8 10 4.3 4.3 0 0 1 17 18.5z" fill={ink} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    default:
      return <PawIcon size={size} />;
  }
}
