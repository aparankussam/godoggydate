'use client';
// web/components/TextsCard.tsx
// The shareable "Texts From Your Dog" card — a chat-bubble thread of the unhinged
// messages the dog supposedly sent. Deliberately GENERIC bubbles: rounded speech
// blobs on a neutral ground, NO iMessage trade dress (no blue/green gradients, no
// delivered/read receipts, no Apple type). It reads as "a messaging app" without
// impersonating one.
//
// Openly a joke: the header baked into the card says the dog cannot actually
// text. Exported to PNG via the same html2canvas path as ApologyCard, so colors
// are inline hex (no oklch / backdrop-blur) and the brand + URL + AI label are
// baked INSIDE the captured region — a reposted screenshot keeps them.

import { forwardRef } from 'react';

interface Props {
  texts: string[];
  dogName: string;
}

// Warm, brand-adjacent palette kept as literal hex for faithful html2canvas
// capture. Generic on purpose — not modeled on any real messaging app.
const PAPER = '#FFFDF9';
const INK = '#1F1B16';
const INK_SOFT = '#8A8378';
const RULE = '#ECE6DA';
const ACCENT = '#E8633A';
const BUBBLE_BG = '#F1EADC'; // received-style bubble (the dog is texting you)
const BUBBLE_INK = '#2A2620';

const TextsCard = forwardRef<HTMLDivElement, Props>(function TextsCard(
  { texts, dogName },
  ref,
) {
  const thread = texts.slice(0, 6);

  return (
    <div
      ref={ref}
      className="relative w-[340px] rounded-[1.6rem] overflow-hidden"
      style={{ background: PAPER, border: `1px solid ${RULE}`, boxShadow: '0 10px 30px rgba(31,27,22,0.14)' }}
    >
      {/* Chat header — a generic "who / status" row, not any real app's chrome */}
      <div
        className="flex items-center gap-3 px-5 pt-4 pb-3"
        style={{ borderBottom: `1px solid ${RULE}` }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{ width: 38, height: 38, background: BUBBLE_BG, fontSize: 20 }}
          aria-hidden="true"
        >
          🐶
        </span>
        <div style={{ lineHeight: 1.15 }}>
          <p className="font-display" style={{ fontSize: 17, color: INK }}>{dogName}</p>
          <p style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>typing…</p>
        </div>
      </div>

      {/* Honest header — baked into the PNG so it travels with the screenshot */}
      <p
        className="px-5 pt-3"
        style={{ fontSize: 10.5, color: INK_SOFT, fontStyle: 'italic', lineHeight: 1.35 }}
      >
        Imagined by AI — {dogName} cannot actually text (yet).
      </p>

      {/* The thread of received-style bubbles */}
      <div className="px-5 pt-3 pb-4 flex flex-col gap-2">
        {thread.map((msg, i) => (
          <div key={i} className="flex" style={{ justifyContent: 'flex-start' }}>
            <p
              style={{
                maxWidth: '82%',
                background: BUBBLE_BG,
                color: BUBBLE_INK,
                fontSize: 14.5,
                lineHeight: 1.4,
                padding: '9px 13px',
                borderRadius: 18,
                borderBottomLeftRadius: 6,
                whiteSpace: 'pre-line',
                wordBreak: 'break-word',
              }}
            >
              {msg}
            </p>
          </div>
        ))}
      </div>

      {/* Baked-in brand + URL — a reposted PNG still carries the back-link. */}
      <div
        className="mx-5 mb-4 pt-3 flex items-center justify-between"
        style={{ borderTop: `1px solid ${RULE}` }}
      >
        <p className="font-display" style={{ fontSize: 13, color: INK }}>GoDoggyDate</p>
        <p style={{ fontSize: 10, color: INK_SOFT }}>godoggydate.com</p>
      </div>
    </div>
  );
});

export default TextsCard;
