// web/components/DogtypeResultCard.tsx
// The on-screen Dogtype result: a taped polaroid of the dog (or the drawn dog
// when there is no photo) with the type name tag, blurb and trait chips.
// Presentational only. The shareable PNG is still DogtypeCard.

import type { Dogtype } from '../../shared/dogtype';
import { PawIcon, PoleIcon, StickerDog, Tape } from './StickerBits';

interface Props {
  dogtype: Dogtype;
  /** Empty when the visitor did not name the dog. */
  dogName?: string;
  photoUrl?: string;
  photoFocus?: string;
}

const CHIP_TILT = ['-rotate-[1.2deg]', 'rotate-1', '-rotate-[0.8deg]', 'rotate-[1.2deg]'];

export default function DogtypeResultCard({ dogtype, dogName, photoUrl, photoFocus }: Props) {
  const name = dogName?.trim();
  const owner = name ? `${name}'s Dogtype` : 'Your dog’s Dogtype';
  return (
    <article
      aria-label={`${owner}: ${dogtype.name}`}
      className="relative mx-auto -rotate-[1.2deg] rounded-md bg-paper px-[9px] pb-2 pt-[7px] shadow-[0_0_0_1.5px_#2A1F4A,0_12px_20px_rgba(42,31,74,0.26)]"
    >
      <Tape style={{ top: -8, left: 30, width: 92, height: 24, transform: 'rotate(-4deg)' }} />

      <div className="relative flex h-[300px] items-center justify-center overflow-hidden rounded-[3px] border-[1.5px] border-brown bg-note sm:h-[340px]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name ? `${name}` : 'Your dog'}
            className="h-full w-full object-cover"
            style={photoFocus ? { objectPosition: photoFocus } : undefined}
          />
        ) : (
          <StickerDog size={190} label="A drawn sticker dog standing in for your dog" />
        )}
      </div>

      <div className="relative z-[4] mx-auto -mt-[26px] w-[92%] rotate-2 overflow-hidden rounded-[9px] border-2 border-brown bg-paper text-center shadow-[0_3px_0_rgba(42,31,74,0.28)]">
        <p className="bg-brown pb-1 pt-[3px] text-[13px] font-black leading-[1.2] tracking-[0.3px] text-paper">{owner}</p>
        <h2 className="px-1 pt-1.5 font-display text-[32px] font-normal leading-[1.05] tracking-[0.3px] sm:text-[38px]">{dogtype.name}</h2>
        <p className="px-1.5 pb-1.5 text-[15px] font-black leading-[1.2] text-brown-mid">{dogtype.tagline}</p>
      </div>

      <p className="mx-2 mt-3 text-balance text-center text-[15px] font-extrabold leading-5 text-brown">{dogtype.blurb}</p>

      <ul aria-label={`${owner} traits`} className="m-0 mt-2.5 flex list-none flex-wrap justify-center gap-1.5 p-0">
        {dogtype.axes.map((a, i) => (
          <li
            key={a.key}
            className={`flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full border-2 border-brown bg-paper pl-1.5 pr-[9px] text-xs font-black shadow-[0_2px_0_rgba(42,31,74,0.2)] ${CHIP_TILT[i % 4]}`}
          >
            <PoleIcon letter={a.pole.letter} />
            {a.pole.label}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-center text-[13px] font-extrabold leading-[18px] text-brown-mid">Dogtype is a playful read, not a score.</p>

      <p className="mt-2 flex h-[34px] items-center justify-center gap-[7px] whitespace-nowrap rounded-[3px] bg-brown pb-px text-paper">
        <PawIcon size={17} color="#FFF9EC" />
        <span className="font-display text-[19px] leading-none tracking-[0.3px]">GoDoggyDate</span>
        <span className="text-[13px] font-black leading-none">· godoggydate.com</span>
      </p>
    </article>
  );
}
