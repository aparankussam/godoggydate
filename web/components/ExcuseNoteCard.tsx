'use client';
// web/components/ExcuseNoteCard.tsx
// The shareable "Official Dog Excuse Note" — a 4:5 chat-sized formal-looking
// note "issued" by your dog explaining why you can't make it to a thing. It is
// built entirely from shared/excuseNote.ts (deterministic; no LLM) and is a
// JOKE by construction and by presentation:
//
//   • A bright "NOT A REAL DOCTOR'S NOTE" ribbon sits across the top.
//   • The letterhead is a fictional dog office ("The Office of Biscuit, Doctor
//     of Naps"), the seal is a paw print, the signature is a paw, and a plain-
//     language disclaimer runs along the bottom.
//   • The "GoDoggyDate · godoggydate.com" footer is baked INTO the captured
//     region, so a reposted screenshot still carries the back-link.
//
// Presentation intentionally reads as a mock/parody — warm paper, playful
// stamp, emoji — and never imitates a real medical, legal, or employer form.
//
// forwardRef exposes the capturable node to the page, which drives the PNG
// export through the shared shareCard.ts path (same as every other card). No
// auth, no profile reads — works fully client-side at N=0.

import { forwardRef } from 'react';
import type { ExcuseNote } from '../../shared/excuseNote';

interface Props {
  note: ExcuseNote;
}

// Aged-paper palette as inline hex (solid fills / solid gradient, no
// backdrop-blur or oklch) so html2canvas captures it faithfully — same
// rationale as WantedPosterWeb / DogtypeCard.
const INK = '#2D1A0E';
const INK_SOFT = '#6B4E2E';
const PAPER = '#FBF3E4';
const SEAL = '#C44E27';

const ExcuseNoteCard = forwardRef<HTMLDivElement, Props>(function ExcuseNoteCard({ note }, ref) {
  return (
    <div
      ref={ref}
      className="relative w-[360px] aspect-[4/5] overflow-hidden"
      style={{ background: 'linear-gradient(155deg, #FBF3E4 0%, #F3E4C9 100%)' }}
    >
      {/* Decorative formal double-border frame */}
      <div
        className="absolute inset-3 flex flex-col"
        style={{ border: `2px solid ${INK}`, boxShadow: `inset 0 0 0 4px ${PAPER}, inset 0 0 0 6px ${INK_SOFT}` }}
      >
        {/* "Not a real note" ribbon — the unmistakable tell, kept in-frame */}
        <div
          className="self-center -mt-[1px] px-3 py-1"
          style={{ backgroundColor: SEAL, color: '#fff' }}
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-center leading-none">
            🐾 Not a real doctor&apos;s note 🐾
          </p>
        </div>

        <div className="flex-1 px-5 pt-3 pb-4 flex flex-col">
          {/* Letterhead */}
          <div className="text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em]" style={{ color: INK_SOFT }}>
              Official Notice
            </p>
            <h2 className="font-display leading-tight mt-0.5" style={{ fontSize: 17, color: INK }}>
              {note.office}
            </h2>
            <p className="text-[10px] italic mt-0.5" style={{ color: INK_SOFT }}>
              {note.department}
            </p>
          </div>

          <div className="my-2 flex items-center gap-2">
            <div className="flex-1" style={{ height: 1, backgroundColor: INK_SOFT, opacity: 0.5 }} />
            <span style={{ fontSize: 12 }} aria-hidden="true">🐾</span>
            <div className="flex-1" style={{ height: 1, backgroundColor: INK_SOFT, opacity: 0.5 }} />
          </div>

          {/* Ref line */}
          <p className="text-[9px]" style={{ color: INK_SOFT }}>
            Ref. No. {note.refNo}
          </p>

          {/* Body */}
          <p className="mt-2 text-[12px] font-semibold" style={{ color: INK }}>
            {note.salutation}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug" style={{ color: INK }}>
            {note.body}
          </p>
          <p className="mt-1.5 text-[11px] italic leading-snug" style={{ color: INK_SOFT }}>
            {note.supporting}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug" style={{ color: INK }}>
            {note.closing}
          </p>

          {/* Signature block + paw seal */}
          <div className="mt-auto pt-3 flex items-end justify-between">
            <div>
              <p className="text-[10px]" style={{ color: INK_SOFT }}>{note.signoff}</p>
              {/* "signature" — the dog's name in the display serif */}
              <p className="font-display leading-none mt-1" style={{ fontSize: 22, color: INK }}>
                {note.signerName} 🐾
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: INK_SOFT }}>
                {note.signerTitle}
              </p>
            </div>

            {/* Paw seal — an obviously-a-joke rubber stamp */}
            <div
              className="flex flex-col items-center justify-center rounded-full shrink-0"
              style={{
                width: 62,
                height: 62,
                border: `2px solid ${SEAL}`,
                color: SEAL,
                transform: 'rotate(-11deg)',
              }}
              aria-hidden="true"
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>🐾</span>
              <span className="text-[6px] font-bold uppercase tracking-[0.14em] mt-0.5 text-center leading-tight">
                Certified
                <br />
                Good Dog
              </span>
            </div>
          </div>

          {/* Disclaimer — plain-language honesty, always visible in the capture */}
          <p className="mt-2 text-[7.5px] leading-tight text-center" style={{ color: INK_SOFT }}>
            {note.disclaimer}
          </p>

          {/* Baked-in brand + URL — reposted PNG carries the back-link */}
          <div
            className="mt-1.5 pt-1.5 flex items-center justify-between"
            style={{ borderTop: `1px solid ${INK_SOFT}` }}
          >
            <p className="font-display" style={{ fontSize: 11, color: INK }}>GoDoggyDate</p>
            <p style={{ fontSize: 8.5, color: INK_SOFT }}>godoggydate.com</p>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ExcuseNoteCard;
