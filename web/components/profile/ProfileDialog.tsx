'use client';
// web/components/profile/ProfileDialog.tsx
// A full-screen sheet for Share and Settings on the Profile page. Escape and the
// close button both close it; focus moves to the close button on open.

import { useEffect, useRef, type ReactNode } from 'react';

export default function ProfileDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-sky bg-gingham" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[28px] leading-none text-brown">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] border-b-4 border-brown bg-paper text-xl font-black text-brown"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
