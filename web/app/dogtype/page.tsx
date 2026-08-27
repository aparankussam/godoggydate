// web/app/dogtype/page.tsx
// The Dogtype index — a static, SEO-indexable grid of all 16 types, linking to
// each type's public page. Reads only the static shared/dogtype catalogue (no
// Firestore, no auth), so it prerenders. This is the "Browse all 16 Dogtypes"
// destination from the profile explorer's locked-match lure.

import type { Metadata } from 'next';
import Link from 'next/link';
import { DOGTYPE_CODES, dogtypeByCode, dogtypeCodeDecode } from '../../../shared/dogtype';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'The 16 Dogtypes — GoDoggyDate',
  description:
    'Every dog is one of 16 Dogtypes — a playful personality read from energy, play style, sociability, and spirit. Meet all 16 and find your dog’s.',
  openGraph: {
    title: 'The 16 Dogtypes — GoDoggyDate',
    description: 'A playful personality system for dogs. Meet all 16 Dogtypes.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'The 16 Dogtypes — GoDoggyDate' },
  alternates: { canonical: '/dogtype' },
};

export default function DogtypeIndexPage() {
  const types = DOGTYPE_CODES.map((code) => dogtypeByCode(code)).filter(
    (t): t is NonNullable<typeof t> => t !== null,
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">The Dogtypes</p>
        <h1 className="mt-2 font-display text-3xl text-brown sm:text-4xl">All 16 Dogtypes</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brown-mid">
          Every dog lands on one of these — a playful personality read from four things you already
          know about them: their energy, how they play, how social they are, and their spirit. It’s a
          vibe, not a verdict.
        </p>
      </header>

      <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {types.map((type) => (
          <li key={type.code}>
            <Link
              href={`/dogtype/${type.code}`}
              className="flex items-start gap-3 rounded-xl border border-border bg-white/60 px-4 py-3.5 transition-colors hover:border-gold/60 hover:bg-white"
            >
              <span className="text-3xl leading-none" aria-hidden="true">
                {type.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg leading-tight text-brown">{type.name}</span>
                <span className="mt-0.5 block text-[12px] font-semibold text-primary">{type.tagline}</span>
                <span className="mt-0.5 block text-[11px] text-brown-light">{dogtypeCodeDecode(type.code)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-sm text-brown-mid">
        Don’t know your dog’s type yet?{' '}
        <Link href="/app" className="font-bold text-primary underline underline-offset-2">
          Find it on GoDoggyDate →
        </Link>
      </p>
    </main>
  );
}
