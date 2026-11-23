'use client';
// web/components/dogtype/DogtypeSheet.tsx
// The full read on one Dogtype you've met: who it is, how it gets along with your
// dog (every reason line), and the dogs you've matched who are that type. A
// bottom sheet on phones, a centered dialog on desktop. It only ever receives a
// type you have discovered or your own, never a hidden one.

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { dogtypeByCode, dogtypeCompat, dogtypeReasons } from '../../../shared/dogtype';
import type { MatchedDog } from '../../lib/matchedDogs';

interface Props {
  open: boolean;
  onClose: () => void;
  code: string | null;
  ownCode: string;
  ownName: string;
  matches: MatchedDog[];
  discoveredLine?: string;
  /** The match screen already is a match with this dog: skip the list. Default true. */
  showMatches?: boolean;
}

export default function DogtypeSheet({ open, onClose, code, ownCode, ownName, matches, discoveredLine, showMatches = true }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const type = code ? dogtypeByCode(code) : null;
  if (!open || !type || !code) return null;
  const isOwn = code === ownCode;
  const compat = isOwn ? null : dogtypeCompat(ownCode, code);
  const reasons = isOwn ? [] : dogtypeReasons(ownCode, code);
  const vibeLabel = !compat ? '' : compat.vibe === 'great' ? 'Great vibe' : compat.vibe === 'spicy' ? 'Spicy · take it slow' : 'Good potential';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={type.name}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-brown/45" tabIndex={-1} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-[1.75rem] border-2 border-b-0 border-brown bg-paper sm:rounded-[1.75rem] sm:border-b-2">
        <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-border sm:hidden" aria-hidden="true" />
        <div className="flex-1 overflow-y-auto px-5 pb-2 pt-3">
          <div className="flex items-center gap-3.5">
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-[3px] border-brown bg-note text-4xl" aria-hidden="true">
              {type.emoji}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-rose">{isOwn ? `${ownName}’s Dogtype` : 'Dogtype you’ve met'}</p>
              <h2 className="font-display text-2xl leading-tight text-brown">{type.name}</h2>
              <p className="font-hand text-xl leading-tight text-brown">{type.tagline}</p>
            </div>
          </div>
          {discoveredLine && <p className="mt-2 text-[13px] font-semibold text-brown-mid">{discoveredLine}</p>}
          <p className="mt-2 text-sm font-semibold leading-relaxed text-brown-mid">{type.blurb}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {type.axes.map((a) => (
              <span key={a.key} className="inline-flex items-center gap-1 rounded-full border-2 border-brown bg-paper px-2.5 py-1 text-xs font-extrabold text-brown">
                <span aria-hidden="true">{a.pole.emoji}</span> {a.pole.label}
              </span>
            ))}
          </div>

          {!isOwn && compat && (
            <div className="mt-4 border-t-2 border-border pt-3">
              <h3 className="font-display text-xl text-brown">How they get along with {ownName}</h3>
              <p className={`mt-2 inline-block rounded-full border-2 border-brown px-3 py-1 text-[13px] font-black text-brown ${compat.vibe === 'great' ? 'bg-fit' : 'bg-kraft'}`}>
                {vibeLabel}
              </p>
              <ul className="mt-2 space-y-2">
                {reasons.map((r) => (
                  <li key={r.text} className="flex items-start gap-2.5">
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brown text-[13px] font-black text-brown ${r.mark === 'good' ? 'bg-fit' : 'bg-amber'}`} aria-hidden="true">
                      {r.mark === 'good' ? '✓' : '!'}
                    </span>
                    <span className="text-sm font-bold text-brown">{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showMatches && (
            <div className="mt-4 border-t-2 border-border pt-3">
              <h3 className="font-display text-xl text-brown">
                {matches.length > 0 ? `Your matches of this type (${matches.length})` : 'Your matches of this type'}
              </h3>
              {matches.length === 0 ? (
                <p className="mt-1 text-sm font-semibold text-brown-mid">
                  {isOwn ? `No matches share ${ownName}’s type yet.` : 'None right now. This type stays discovered.'}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {matches.map((m) => (
                    <li key={m.matchId}>
                      <Link
                        href={`/app/dog/${m.matchId}`}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-2xl border-2 border-brown bg-white p-2.5"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-brown bg-kraft text-xl">
                          {m.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.photo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            '🐕'
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-lg text-brown">{m.name}</span>
                          {m.breed && <span className="block truncate text-[13px] font-semibold text-brown-mid">{m.breed}</span>}
                        </span>
                        <span className="text-2xl font-black text-brown" aria-hidden="true">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="btn-secondary m-4 mt-2 min-h-[48px] text-sm">
          Close
        </button>
      </div>
    </div>
  );
}
