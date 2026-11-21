'use client';
// web/components/SignInGate.tsx
// What a signed-out visitor sees on an /app/* screen that needs an account.
// It used to say "Sign in to …" with only a "Go to Discover" link, which led to
// a second screen that finally had the sign-in button. This opens the sign-in
// modal right here; once sign-in lands the host page's own auth listener swaps
// this out for the real screen.

import { useState } from 'react';
import Link from 'next/link';
import AuthModal from './AuthModal';

interface Props {
  title: string;
  emoji?: string;
}

export default function SignInGate({ title, emoji }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
      <AuthModal isOpen={open} onClose={() => setOpen(false)} />
      {emoji && <span className="text-6xl" aria-hidden="true">{emoji}</span>}
      <h1 className="font-display text-2xl text-brown">{title}</h1>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary px-8 py-3">
        Sign in
      </button>
      <Link href="/app" className="py-2 text-sm font-semibold text-brown-light underline underline-offset-2">
        Go to Discover
      </Link>
    </div>
  );
}
