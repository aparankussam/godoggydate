// web/components/DiscoverBits.tsx
// Small "Sticker Book" pieces shared by the Discover card, its Details view and the
// empty state: the paw, washi tape, the fit sticker, the place ticket and the
// owner-attributed trust slip. Presentational only: every word comes from the data
// the caller passes in (compat.*, the owner's own fields).

import type { CompatibilityResult } from '../../shared/types';
import { getVaccinationStatus } from '../../shared/profile';

/** Owner-typed chips carry trailing emoji; the calm design shows words only. */
export function plain(t: string): string {
  return t.replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
}

export function PawIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${className}`}>
      <ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" />
      <ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" />
      <ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" />
      <ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" />
      <path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" />
    </svg>
  );
}

/** Striped kraft washi tape. Position it with `className` (absolute + offsets). */
export function Tape({ className = '', width = 44, height = 13, rotate = 0 }: { className?: string; width?: number; height?: number; rotate?: number }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-[3] ${className}`}
      style={{
        width,
        height,
        transform: `rotate(${rotate}deg)`,
        background:
          'repeating-linear-gradient(115deg, rgba(217,188,140,0.94) 0 7px, rgba(230,207,166,0.94) 7px 14px)',
        clipPath:
          'polygon(0 0, 3% 17%, 0 33%, 3% 50%, 0 67%, 3% 83%, 0 100%, 100% 100%, 97% 83%, 100% 67%, 97% 50%, 100% 33%, 97% 17%, 100% 0)',
      }}
    />
  );
}

// ── Fit tiers ────────────────────────────────────────────────────────────────
export type FitTone = 'green' | 'amber' | 'red';

/** Sticker colour from the engine's own tier: blocked = red, "Some overlap" = amber,
 *  everything else (Strong fit, Good fit) = green. */
export function fitTone(compat: CompatibilityResult): FitTone {
  if (compat.quality === 'blocked') return 'red';
  if (/^some overlap/i.test(compat.label)) return 'amber';
  return 'green';
}

const TONE_BG: Record<FitTone, string> = { green: '#6FDB9C', amber: '#FFC56B', red: '#F26D6D' };

/** "Good fit, with care" -> "Good fit": the care is said by the amber slip, not the sticker. */
export function fitShortLabel(compat: CompatibilityResult): string {
  return compat.label.replace(/,\s*with care$/i, '');
}

export function FitSticker({
  compat,
  size = 'lg',
  className = '',
  style,
}: {
  compat: CompatibilityResult;
  size?: 'lg' | 'md';
  className?: string;
  style?: React.CSSProperties;
}) {
  const tone = fitTone(compat);
  const label = fitShortLabel(compat);
  const dim = size === 'lg' ? 'h-[84px] w-[84px]' : 'h-[72px] w-[72px]';
  const num = size === 'lg' ? 'text-[30px]' : 'text-[26px]';
  return (
    <span
      role="img"
      aria-label={`Fit ${compat.score} out of 100, ${compat.label}`}
      className={`flex ${dim} shrink-0 flex-col items-center justify-center rounded-full border-[2.5px] border-brown px-1 text-center shadow-[0_3px_7px_rgba(42,31,74,0.28)] ${className}`}
      style={{ background: TONE_BG[tone], ...style }}
    >
      <span className={`font-display ${num} leading-[0.9]`}>{compat.score}</span>
      <span className="mt-0.5 text-xs font-black leading-[1.05]">{label}</span>
    </span>
  );
}

/** Notched kraft ticket: "Neighborhood · distance". */
export function PlaceTicket({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      className={`flex max-w-full items-center gap-2 rounded-md border-2 border-brown bg-kraft py-1.5 pl-2.5 pr-3.5 text-[13.5px] font-black leading-none shadow-[0_2px_5px_rgba(42,31,74,0.25)] ${className}`}
    >
      <svg aria-hidden="true" width="13" height="16" viewBox="0 0 16 20" fill="#2A1F4A" className="shrink-0">
        <path d="M8 0C3.6 0 0 3.5 0 7.9 0 13.2 8 20 8 20s8-6.8 8-12.1C16 3.5 12.4 0 8 0z" />
        <circle cx="8" cy="7.7" r="3" fill="#E6CFA6" />
      </svg>
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}

// ── Owner's word: vaccination + limits ───────────────────────────────────────
interface VaccFields { rabiesExpiry?: string | null; vaccinated?: boolean | null }

/** The vaccination line, always the owner's claim ("Owner marked vaccinated"), never a tick. */
export function vaccinationLine(dog: VaccFields): string {
  const v = getVaccinationStatus(dog);
  switch (v.tone) {
    case 'dated': return v.label.replace(/^Rabies: valid through/, 'Owner listed rabies valid through');
    case 'expired': return v.label.replace(/^Rabies: expired/, 'Owner listed rabies expired');
    case 'self-reported': return 'Owner marked vaccinated';
    case 'unvaccinated': return 'Owner marked not vaccinated';
    default: return 'Vaccination not stated';
  }
}

export interface LimitsSummary {
  /** True only when a limit actually applies to the viewer's dog (a tripped limit). */
  applies: boolean;
  /** Bold first line. */
  headline: string;
  /** The reason, in plain words (amber only). */
  reason?: string;
  /** "+2 more in Details" when there are more than shown. */
  more?: string;
}

/** Collapse compat.limits into the one slip the card has room for. */
export function summarizeLimits(compat: CompatibilityResult): LimitsSummary {
  const items = compat.limits?.items ?? [];
  const cautions = items.filter((i) => i.severity === 'caution');
  if (cautions.length > 0) {
    const first = cautions[0];
    return {
      applies: true,
      headline: first.text,
      reason: first.detail,
      more: items.length > 1 ? `+${items.length - 1} more in Details` : undefined,
    };
  }
  if (!compat.limits && compat.warnings.length > 0) {
    // Older results without the structured analysis: the plain warning strings.
    return {
      applies: true,
      headline: compat.warnings[0],
      more: compat.warnings.length > 1 ? `+${compat.warnings.length - 1} more in Details` : undefined,
    };
  }
  if (items.length === 0) return { applies: false, headline: 'No limits listed' };
  return {
    applies: false,
    headline: items[0].text,
    more: items.length > 1 ? `+${items.length - 1} more in Details` : undefined,
  };
}

/** "Kaju's owner" safe against names that already end in s or are empty. */
export function attribution(name: string): string {
  return `From ${name || 'the'}${name ? "'s" : ''} owner. GoDoggyDate doesn't verify it.`;
}

/**
 * The calm trust slip. Neutral paper with an ink spine; AMBER only when a limit
 * applies to the viewer's dog, with the reason in plain words.
 */
export function TrustSlip({
  dog,
  compat,
  className = '',
}: {
  dog: VaccFields & { name: string };
  compat: CompatibilityResult;
  className?: string;
}) {
  const vacc = vaccinationLine(dog);
  const limits = summarizeLimits(compat);
  const amber = limits.applies;
  return (
    <div
      role="group"
      aria-label={`${dog.name}'s owner: vaccination and limits`}
      className={`border-l-4 px-3 py-2 ${amber ? 'border-amber-spine bg-amber' : 'border-brown bg-cream-dark'} rounded-[4px_9px_9px_4px] ${className}`}
    >
      {amber ? (
        <>
          <p className="text-[14px] font-black leading-snug [overflow-wrap:anywhere]">{limits.headline}</p>
          {limits.reason && <p className="text-[14px] font-extrabold leading-snug [overflow-wrap:anywhere]">{limits.reason}</p>}
          <p className="mt-0.5 text-xs font-extrabold leading-snug text-brown-mid">
            {vacc}{limits.more ? ` · ${limits.more}` : ''}. {attribution(dog.name)}
          </p>
        </>
      ) : (
        <>
          <p className="text-[13.5px] font-black leading-snug [overflow-wrap:anywhere]">
            {vacc} <span aria-hidden="true">&nbsp;·&nbsp;</span> <span className="font-extrabold">{limits.headline}</span>
            {limits.more ? <span className="font-extrabold text-brown-mid"> · {limits.more}</span> : null}
          </p>
          <p className="text-xs font-extrabold leading-snug text-brown-mid">{attribution(dog.name)}</p>
        </>
      )}
    </div>
  );
}
