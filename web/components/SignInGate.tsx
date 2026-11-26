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
import BrandLogo from './BrandLogo';

interface Props {
  title: string;
  /** Kept for callers; the gate now shows the drawn paw coin instead of an emoji. */
  emoji?: string;
}

export default function SignInGate({ title }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-24">
      <div className="card flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
      <AuthModal isOpen={open} onClose={() => setOpen(false)} />
      <BrandLogo height={44} />
      <h1 className="font-display text-2xl text-brown">{title}</h1>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary px-8 py-3">
        Sign in
      </button>
      <Link href="/app" className="inline-flex min-h-[44px] items-center text-sm font-bold text-brown underline underline-offset-2">
        Go to Discover
      </Link>
      </div>
    </div>
  );
}
