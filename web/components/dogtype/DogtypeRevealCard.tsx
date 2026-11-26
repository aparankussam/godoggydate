'use client';
// web/components/dogtype/DogtypeRevealCard.tsx
// The reveal: "{Name} is The Social Butterfly", how that type gets along with your
// dog, and a count-only tease of the Dogtypes still hidden. Twin of the iPhone
// card. It only ever receives a type you've just met (or your own), never a hidden
// one. `compact` is the short version for the match screen.

import { useEffect } from 'react';
import { dogtypeByCode, dogtypeCompat, dogtypeReasons } from '../../../shared/dogtype';
import { trackEvent } from '../../lib/analytics';

export type RevealVariant = 'new' | 'met' | 'same';

interface Props {
  ownName: string;
  ownCode: string;
  otherName: string;
  otherCode: string;
  /** Types discovered so far, including this one. */
  discovered: number;
  variant: RevealVariant;
  showTease?: boolean;
  compact?: boolean;
  onOpenMore?: () => void;
  /** Same type as yours, but you haven't watched your own reveal yet: name nothing. */
  sealed?: boolean;
}

const EYEBROW: Record<RevealVariant, string> = {
  new: 'New Dogtype discovered',
  met: 'A Dogtype you’ve met',
  same: 'Same Dogtype as yours',
};

export default function DogtypeRevealCard({ ownName, ownCode, otherName, otherCode, discovered, variant, showTease = true, compact = false, onOpenMore, sealed = false }: Props) {
  useEffect(() => {
    trackEvent('dogtype_reveal_shown', { context: compact ? 'modal' : showTease ? 'profile_new' : 'profile', variant });
  }, [compact, showTease, variant]);

  const type = dogtypeByCode(otherCode);
  const compat = dogtypeCompat(ownCode, otherCode);
  if (!type || !compat) return null;
  const maskName = sealed;
  const reasons = dogtypeReasons(ownCode, otherCode);
  const hidden = Math.max(0, 16 - discovered);
  const vibeLabel = `Personality vibe · ${compat.vibe === 'great' ? 'Great' : compat.vibe === 'spicy' ? 'Spicy, take it slow' : 'Good potential'}`;
  const headline = sealed ? `Same Dogtype as ${ownName}` : variant === 'same' ? `${otherName} is a ${type.name.replace(/^The /, '')} too` : type.name;

  return (
    <section className="rounded-3xl border-2 border-brown bg-paper p-4 shadow-[0_6px_0_rgba(42,31,74,0.14)]">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs font-extrabold uppercase tracking-[0.08em] text-rose">{maskName ? `Same Dogtype as ${ownName}` : EYEBROW[variant]}</p>
        {variant === 'new' && (
          <span className="rounded-full bg-brown px-2.5 py-0.5 text-xs font-black text-paper" aria-label={`${discovered} of 16 discovered`}>
            {discovered} of 16
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3.5">
        <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[3px] border-brown bg-note text-4xl" aria-hidden="true">
          {maskName ? '?' : type.emoji}
        </div>
        <div className="min-w-0">
          {variant !== 'same' && <p className="text-sm font-extrabold text-brown-mid">{otherName} is</p>}
          <h3 className="font-display text-[28px] leading-tight text-brown">{maskName ? `${otherName} is just like ${ownName}` : headline}</h3>
          <p className="font-hand text-[21px] leading-tight text-brown">{maskName ? `Watch ${ownName}'s reveal in Pupfile to see which.` : type.tagline}</p>
        </div>
      </div>
      {!compact && !maskName && <p className="mt-3 text-sm font-semibold leading-relaxed text-brown-mid">{type.blurb}</p>}

      <div className="mt-3 border-t-2 border-border pt-3">
        {!compact && <h4 className="font-display text-xl text-brown">How they get along with {ownName}</h4>}
        <p className={`mt-1 inline-block rounded-full border-2 border-brown px-3 py-1 text-[13px] font-black text-brown ${compat.vibe === 'great' ? 'bg-fit' : 'bg-kraft'}`}>
          {vibeLabel}
        </p>
        <ul className="mt-2 space-y-2">
          {(compact ? reasons.slice(0, 1) : reasons).map((r) => (
            <li key={r.text} className="flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brown text-[13px] font-black text-brown ${r.mark === 'good' ? 'bg-fit' : 'bg-amber'}`} aria-hidden="true">
                {r.mark === 'good' ? '✓' : '!'}
              </span>
              <span className="text-sm font-bold text-brown">{r.text}</span>
            </li>
          ))}
        </ul>
        {compact && onOpenMore && !maskName && (
          <button type="button" onClick={onOpenMore} className="mt-1 min-h-[44px] text-sm font-black text-rose underline underline-offset-2">
            See how they get along with {ownName} ›
          </button>
        )}
      </div>

      {showTease && hidden > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-brown bg-note p-3.5" aria-label={`${hidden} Dogtypes still hidden. Each new match could uncover the next one.`}>
          <div className="flex items-baseline">
            <p className="flex-1 font-display text-lg text-brown">{hidden} Dogtype{hidden === 1 ? '' : 's'} still hidden</p>
            <span className="text-[13px] font-extrabold text-brown">{discovered} / 16</span>
          </div>
          <div className="mt-2 flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className={`h-3.5 flex-1 rounded ${i < discovered ? 'bg-brown' : 'border-2 border-dashed border-brown-mid'}`} />
            ))}
          </div>
          <p className="mt-2 text-[13px] font-semibold text-brown">Each new match could uncover the next one.</p>
        </div>
      )}
    </section>
  );
}
