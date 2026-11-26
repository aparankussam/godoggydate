// web/components/SafetyCard.tsx
// Safety cards (lost-dog kit, emergency vet): a normal cream card with a soft
// red-tinted title strip, so they stand out without shouting. Solid red is kept
// for a real emergency only: safetyButtonClass() is the red "My dog is lost".
// Mirrors mobile/components/SafetyCard.tsx.

import type { ReactNode } from 'react';

export function SafetyCard({ banner, right, children }: { banner: ReactNode; right?: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden rounded-[1.4rem]">
      <p className="flex items-center justify-between border-b-2 border-brown bg-red-50 px-4 py-1.5 text-[13px] font-black uppercase tracking-wider text-red-600">
        <span>{banner}</span>
        {right && <span>{right}</span>}
      </p>
      <div className="space-y-2.5 p-4">{children}</div>
    </div>
  );
}

/** Solid red for the main action, red outline for the second one. */
export function safetyButtonClass(outline?: boolean): string {
  return `flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border-2 border-red-600 px-3 text-center text-[15px] font-black ${
    outline ? 'bg-paper text-red-600' : 'bg-red-600 text-white'
  }`;
}
