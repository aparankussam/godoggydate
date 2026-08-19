'use client';
// web/components/ApologyCard.tsx
// The shareable "notes-app apology" card — the celebrity-statement screenshot,
// but the celebrity is a dog. Deliberately styled like a phone notes app (white
// note chrome, a plain-text statement, a paw-print signature) so it reads as the
// familiar internet apology format at a glance. Openly a joke: it carries an
// "AI, in {dog}'s voice" label and never claims to be a real statement.
//
// Exported to PNG via the same html2canvas path as WantedPosterWeb/DogtypeCard,
// so colors are inline hex (no oklch / backdrop-blur) and the brand + URL are
// baked INSIDE the captured region — a reposted screenshot keeps the back-link.

import { forwardRef } from 'react';

interface Props {
  statement: string;
  signOff: string;
  dogName: string;
  /** Optional honest "today" label for the note subtitle. */
  dateLabel?: string;
}

// iOS-notes-ish palette, kept as literal hex for faithful html2canvas capture.
const PAPER = '#FFFDF9';
const INK = '#1F1B16';
const INK_SOFT = '#8A8378';
const RULE = '#ECE6DA';
const ACCENT = '#E8633A'; // brand primary-ish, for the paw + brand mark

const ApologyCard = forwardRef<HTMLDivElement, Props>(function ApologyCard(
  { statement, signOff, dogName, dateLabel },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative w-[340px] rounded-[1.6rem] overflow-hidden"
      style={{ background: PAPER, border: `1px solid ${RULE}`, boxShadow: '0 10px 30px rgba(31,27,22,0.14)' }}
    >
      {/* Note chrome — a faux status/toolbar row that sells the "notes app" read */}
      <div className="flex items-center justify-between px-5 pt-4">
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: ACCENT, textTransform: 'uppercase' }}>
          Notes
        </span>
        <span style={{ fontSize: 15, color: INK_SOFT }} aria-hidden="true">•••</span>
      </div>

      <div className="px-5 pt-3 pb-5">
        {/* Title + honest subtitle */}
        <p className="font-display leading-tight" style={{ fontSize: 24, color: INK }}>
          A Statement
        </p>
        <p style={{ fontSize: 12, color: INK_SOFT, marginTop: 2 }}>
          {dateLabel ? `${dateLabel} · ` : ''}from {dogName} · written by AI, in {dogName}&apos;s voice
        </p>

        <div className="my-3.5" style={{ height: 1, background: RULE }} />

        {/* The statement itself */}
        <p style={{ fontSize: 15, lineHeight: 1.55, color: INK, whiteSpace: 'pre-line' }}>
          {statement}
        </p>

        {/* Signature line */}
        <p className="mt-4" style={{ fontSize: 15, fontWeight: 600, color: INK }}>
          {signOff}
        </p>

        {/* Paw "signature stamp" */}
        <div className="mt-3 flex items-center gap-2">
          <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">🐾</span>
          <span style={{ fontSize: 11, fontStyle: 'italic', color: INK_SOFT }}>
            Signed, under duress, by a very good dog
          </span>
        </div>

        {/* Baked-in brand + URL — a reposted PNG still carries the back-link. */}
        <div
          className="mt-5 pt-3 flex items-center justify-between"
          style={{ borderTop: `1px solid ${RULE}` }}
        >
          <p className="font-display" style={{ fontSize: 13, color: INK }}>GoDoggyDate</p>
          <p style={{ fontSize: 10, color: INK_SOFT }}>godoggydate.com</p>
        </div>
      </div>
    </div>
  );
});

export default ApologyCard;
