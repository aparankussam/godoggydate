'use client';
// web/components/OwnerLimits.tsx
// The limits owners DECLARED ("Not a good match with" / "Good to know before
// meeting"), shown where the swiping decision is made: on the first card, in the
// details sheet and in the match modal. Decision D3: warn first, rank lower, never
// hide. Every line is owner-named ("Moose's owner prefers no puppies"), so a
// reader can't mistake it for a statement about the dog they are looking at, and
// it is always framed as what the owner said, not something GoDoggyDate verified.
// Rendered from compat.limits (shared/utils/matchingEngine.ts analyzeLimits); older
// results without it fall back to the plain warning strings.

import type { CompatibilityResult, LimitItem } from '../../shared/types';

/** Most chips the first card shows (a phone card is ~26rem tall: more clips the bottom
 *  chips, and a clipped safety flag is worse than a pointer to Details). */
const CARD_MAX_CHIPS = 3;

function itemsOf(compat: CompatibilityResult): LimitItem[] | null {
  return compat.limits ? compat.limits.items : null;
}

/**
 * Compact chips for the swipe card: tripped limits (amber) first, at most CARD_MAX_CHIPS
 * chips, the rest behind one "+N more" pointing at Details (which lists every one).
 */
export function LimitChips({ compat, className = '' }: { compat: CompatibilityResult; className?: string }) {
  const items = itemsOf(compat);

  if (!items) {
    if (compat.warnings.length === 0) return null;
    return (
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {compat.warnings.map((warning) => (
          <span
            key={warning}
            className="rounded-2xl border border-amber-300/60 bg-amber-950/55 px-2.5 py-0.5 text-[12px] font-semibold leading-tight text-amber-100 backdrop-blur-md"
          >
            ⚠ {warning}
          </span>
        ))}
      </div>
    );
  }

  // Tripped limits first, then the rest. Past the cap the overflow collapses into one
  // "+N more" chip that is amber when any of them is a tripped limit.
  const ordered = [
    ...items.filter((i) => i.severity === 'caution'),
    ...items.filter((i) => i.severity !== 'caution'),
  ];
  if (ordered.length === 0) return null;
  const overflow = ordered.length > CARD_MAX_CHIPS;
  const shown = overflow ? ordered.slice(0, CARD_MAX_CHIPS - 1) : ordered;
  const hidden = overflow ? ordered.slice(CARD_MAX_CHIPS - 1) : [];
  const hiddenCautions = hidden.filter((i) => i.severity === 'caution').length;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="list" aria-label="Limits the owners shared">
      {shown.map((item) =>
        item.severity === 'caution' ? (
          <span
            key={item.id}
            role="listitem"
            title={item.detail ? `${item.text} (${item.detail})` : item.text}
            className="rounded-2xl border border-amber-300/60 bg-amber-950/60 px-2.5 py-0.5 text-[12px] font-semibold leading-tight text-amber-100 shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur-md"
          >
            <span aria-hidden="true">⚠ </span>
            {item.text}
          </span>
        ) : (
          <span
            key={item.id}
            role="listitem"
            className="rounded-2xl border border-white/25 bg-black/40 px-2.5 py-0.5 text-[12px] font-semibold leading-tight text-white/90 shadow-[0_4px_14px_rgba(0,0,0,0.25)] backdrop-blur-md"
          >
            {item.text}
          </span>
        ),
      )}
      {hidden.length > 0 && (
        <span
          role="listitem"
          className={`rounded-2xl border px-2.5 py-0.5 text-[12px] font-semibold leading-tight backdrop-blur-md ${
            hiddenCautions > 0
              ? 'border-amber-300/60 bg-amber-950/60 text-amber-100'
              : 'border-white/25 bg-black/40 text-white/80'
          }`}
        >
          {hiddenCautions > 0 ? '⚠ ' : ''}+{hidden.length} more {hidden.length === 1 ? 'limit' : 'limits'} in Details
        </span>
      )}
    </div>
  );
}

/**
 * The full list, for the details sheet (light) and the match modal (dark).
 * Tripped limits first with the reason, then the rest. Nothing is hidden.
 */
export function LimitList({
  compat,
  tone = 'light',
  heading = 'What the owners told us',
}: {
  compat: CompatibilityResult;
  tone?: 'light' | 'dark';
  heading?: string;
}) {
  const items = itemsOf(compat);
  const lines: Array<{ key: string; text: string; detail?: string; caution: boolean }> = items
    ? items.map((i) => ({ key: i.id, text: i.text, detail: i.detail, caution: i.severity === 'caution' }))
    : compat.warnings.map((w) => ({ key: w, text: w, caution: true }));
  if (lines.length === 0) return null;

  const dark = tone === 'dark';
  return (
    <div
      className={
        dark
          ? 'mt-3 rounded-2xl border border-amber-300/60 bg-amber-950/55 px-3 py-3'
          : 'mt-3 rounded-xl bg-[rgba(180,83,9,0.08)] px-3 py-3'
      }
    >
      <p className={`text-[12px] font-bold uppercase tracking-[0.12em] ${dark ? 'text-white' : 'text-brown-light'}`}>
        {heading}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {lines.map((line) => (
          <li key={line.key} className={`text-sm leading-snug ${dark ? 'text-white' : 'text-brown'}`}>
            <span className="mr-1.5" aria-hidden="true">{line.caution ? '⚠' : '•'}</span>
            <span className={line.caution ? 'font-semibold' : ''}>{line.text}</span>
            {line.detail && (
              <span className={dark ? 'text-white/80' : 'text-brown-light'}> — {line.detail}</span>
            )}
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-[12px] leading-snug ${dark ? 'text-white/70' : 'text-brown-light'}`}>
        Each owner chose these themselves. GoDoggyDate doesn&apos;t verify them.
      </p>
    </div>
  );
}

/**
 * Details view, "Sticker Book" paper version: every limit the owner listed, nothing
 * hidden. A limit that applies to the viewer's dog is an AMBER slip with the reason in
 * plain words; the rest are neutral paper slips. Always owner-named.
 */
export function LimitsBlock({ compat, ownerName }: { compat: CompatibilityResult; ownerName: string }) {
  const items = itemsOf(compat);
  const lines: Array<{ key: string; text: string; detail?: string; caution: boolean }> = items
    ? items.map((i) => ({ key: i.id, text: i.text, detail: i.detail, caution: i.severity === 'caution' }))
    : compat.warnings.map((w) => ({ key: w, text: w, caution: true }));
  if (lines.length === 0) {
    return <p className="text-[13px] font-extrabold leading-snug">{ownerName}&apos;s owner listed no limits</p>;
  }
  const ordered = [...lines.filter((l) => l.caution), ...lines.filter((l) => !l.caution)];
  return (
    <ul className="flex flex-col gap-1.5" aria-label={`Limits ${ownerName}'s owner listed`}>
      {ordered.map((line) => (
        <li
          key={line.key}
          className={`overflow-hidden rounded-[5px] border-2 border-brown border-l-[7px] px-2.5 py-1 ${
            line.caution ? 'border-l-amber-spine bg-amber' : 'border-l-brown bg-cream'
          }`}
        >
          <p className="text-sm font-extrabold leading-snug [overflow-wrap:anywhere]">{line.text}</p>
          {line.caution && line.detail && (
            <p className="text-sm font-extrabold leading-snug [overflow-wrap:anywhere]">{line.detail}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
