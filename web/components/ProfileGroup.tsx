'use client';
// web/components/ProfileGroup.tsx
// A collapsible group for the secondary cards on the Profile tab. The profile
// grew to ~10 cards (about 6,000px on a phone); the essentials stay out in the
// open and the rest sit behind one of these. Collapsed by default on a phone,
// open on a wide screen where there is room. Native <details>, so it works
// without JS tricks and keeps keyboard/screen-reader behavior for free.

import { useState } from 'react';

interface Props {
  title: string;
  /** One line under the title that says what's inside. */
  hint?: string;
  children: React.ReactNode;
  /** Extra classes for the outer element (e.g. phone ordering). */
  className?: string;
}

export default function ProfileGroup({ title, hint, children, className = '' }: Props) {
  // Profile content only renders after the client has loaded the profile, so
  // reading the viewport here can't cause a server/client mismatch.
  const [open, setOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className={`group ${className}`}
    >
      <summary className="card flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 rounded-[1.8rem] px-5 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-brown">{title}</span>
          {hint && <span className="block text-xs leading-snug text-brown-light">{hint}</span>}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-xl text-brown-light transition-transform group-open:rotate-90 motion-reduce:transition-none"
        >
          ›
        </span>
      </summary>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </details>
  );
}
