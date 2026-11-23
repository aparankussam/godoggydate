// web/app/not-found.tsx
// Branded 404 for every unmatched route and every notFound() call (bad /d/ and
// /pack/ links included). Without this Next serves its bare black-on-white
// default, with no way back into the site.

import type { Metadata } from 'next';
import Link from 'next/link';
import { StickerDog } from '../components/StickerBits';

export const metadata: Metadata = {
  title: 'Page not found | GoDoggyDate',
  description: 'That page has wandered off. Head back to GoDoggyDate.',
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
      <div className="card flex w-full max-w-lg flex-col items-center px-6 py-10">
      <StickerDog size={84} label="A drawn sticker dog" />
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-rose">Error 404</p>
      <h1 className="mt-2 font-display text-4xl text-brown sm:text-5xl">This page wandered off</h1>
      <p className="mt-3 max-w-md text-brown-mid">
        The link may be old or mistyped, or the dog page you were sent to isn&apos;t there any more.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/" className="btn-primary">Back to GoDoggyDate</Link>
        <Link href="/quiz" className="btn-secondary">Take the Dogtype quiz</Link>
      </div>
      </div>
    </main>
  );
}
