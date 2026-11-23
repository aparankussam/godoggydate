// web/app/dogtype/page.tsx
// The Dogtype teaser. There are 16 types, but their names are a mystery you
// uncover by matching in the app, so this page shows 16 identical blanks and
// reads nothing from the catalogue. Static and indexable.

import type { Metadata } from 'next';
import Link from 'next/link';
import { defaultSocialImages } from '../../lib/site';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '16 Dogtypes. One is your dog. — GoDoggyDate',
  description:
    'Every dog is one of 16 Dogtypes — a playful personality read from energy, play style, sociability, and spirit. Find your dog’s in 90 seconds.',
  openGraph: {
    title: '16 Dogtypes. One is your dog. — GoDoggyDate',
    description: 'A playful personality system for dogs. Find your dog’s type, then meet the rest by matching.',
    type: 'website',
    images: defaultSocialImages,
  },
  twitter: { card: 'summary_large_image', title: '16 Dogtypes. One is your dog. — GoDoggyDate', images: defaultSocialImages },
  alternates: { canonical: '/dogtype' },
};

export default function DogtypeIndexPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-brown">The Dogtypes</p>
        <h1 className="mt-2 font-display text-3xl text-brown sm:text-4xl">
          16 Dogtypes.
          <br />
          One of them is your dog.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-brown-mid">
          Every dog lands on one of 16 personalities, read from their energy, how they play, how social
          they are, and their spirit. It’s a vibe, not a verdict. Find yours in 90 seconds.
        </p>
      </header>

      <ul aria-label="16 hidden Dogtypes" className="mt-8 grid grid-cols-4 gap-2.5">
        {Array.from({ length: 16 }, (_, i) => (
          <li
            key={i}
            aria-hidden="true"
            className="flex aspect-square items-center justify-center rounded-2xl border-2 border-dashed border-brown-mid bg-cream-dark font-display text-3xl text-brown-mid"
          >
            ?
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-2xl border-2 border-brown p-4" style={{ background: '#DCEEFB' }}>
        <h2 className="font-display text-xl text-brown">How you meet the other 15</h2>
        <p className="mt-1 text-sm font-semibold text-brown">
          Each one stays a mystery until your dog matches with a dog of that type in GoDoggyDate. Then you see
          who they are and how they get along with yours.
        </p>
      </section>

      <div className="mt-8 flex flex-col gap-3">
        <Link href="/quiz?ref=dogtype" className="btn-primary text-center text-lg">
          Find your dog&apos;s Dogtype
        </Link>
        <Link href="/app?from=dogtype" className="btn-secondary text-center">
          Join GoDoggyDate
        </Link>
      </div>
    </main>
  );
}
