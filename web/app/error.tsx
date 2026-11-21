'use client';
// web/app/error.tsx
// Route-level error boundary: a render error on any page shows this instead of
// Next's blank "Application error" screen, with a retry and a way home.

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('route error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 py-16 text-center">
      <p className="text-6xl" aria-hidden="true">🐾</p>
      <h1 className="mt-4 font-display text-4xl text-brown sm:text-5xl">Something went sideways</h1>
      <p className="mt-3 max-w-md text-brown-mid">
        That page hit a snag. Give it another go, and if it keeps happening, head home and try again in a minute.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-secondary">Back to GoDoggyDate</Link>
      </div>
    </main>
  );
}
