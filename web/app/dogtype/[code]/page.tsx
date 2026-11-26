// web/app/dogtype/[code]/page.tsx
// Public, SEO-indexable landing page for one of the 16 Dogtypes — the share
// destination for "my dog is a Zoomie Menace 🌪️". Reads only from the static
// shared/dogtype catalogue (no Firestore, no auth), so all 16 are statically
// generated. Unlike /d/[slug] (a specific dog, deliberately not indexed), these
// are generic identity pages we WANT crawled — they're the acquisition funnel.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SiteFooter from '../../../components/SiteFooter';
import { DOGTYPE_CODES, dogtypeByCode } from '../../../../shared/dogtype';
import BrandLogo from '../../../components/BrandLogo';

export const dynamic = 'force-static';

interface PageProps {
  params: { code: string };
}

export function generateStaticParams() {
  return DOGTYPE_CODES.map((code) => ({ code }));
}

export function generateMetadata({ params }: PageProps): Metadata {
  const type = dogtypeByCode(params.code);
  if (!type) return { title: 'Dogtype not found — GoDoggyDate' };
  const title = `${type.name} — Dogtype | GoDoggyDate`;
  const description = `${type.tagline} ${type.blurb}`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `/dogtype/${type.code}` },
    // Only a shared link should lead here: the other types stay a mystery,
    // so these pages are not offered up by search.
    robots: { index: false, follow: true },
  };
}

export default function DogtypePage({ params }: PageProps) {
  const type = dogtypeByCode(params.code);
  if (!type) notFound();

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-sky/95 backdrop-blur-md border-b-2 border-brown">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="GoDoggyDate home" className="inline-flex min-h-[44px] items-center"><BrandLogo height={40} /></Link>
          <Link href="/quiz?ref=dogtype" className="btn-secondary inline-flex min-h-[44px] items-center text-sm whitespace-nowrap px-4 py-2 sm:px-6">
            <span className="sm:hidden">Get yours</span>
            <span className="hidden sm:inline">Find your dog&apos;s Dogtype</span>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-12 pb-8">
        <div className="card overflow-hidden text-brown p-8 sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-rose">Dogtype</p>
          <div className="mt-6 text-7xl sm:text-8xl leading-none" aria-hidden="true">{type.emoji}</div>
          <h1 className="mt-4 font-display text-4xl sm:text-6xl leading-tight">{type.name}</h1>
          <p className="mt-2 text-xl text-brown-mid font-extrabold">{type.tagline}</p>
          <p className="mt-4 text-lg text-brown-mid max-w-2xl leading-relaxed">{type.blurb}</p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {type.axes.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center gap-1 rounded-full bg-paper border-2 border-brown px-2.5 py-1 text-xs font-extrabold text-brown"
              >
                <span aria-hidden="true">{a.pole.emoji}</span> {a.pole.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* The four axes */}
      <section className="max-w-4xl mx-auto px-6 py-6">
        <h2 className="font-display text-2xl text-brown mb-4">What makes {/^[AEIOU]/i.test(type.name.replace(/^The /, '')) ? 'an' : 'a'} {type.name.replace(/^The /, '')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {type.axes.map((a) => (
            <div key={a.key} className="card p-4 rounded-2xl">
              <p className="text-[12px] font-bold uppercase tracking-wide text-brown-light">{a.axis}</p>
              <p className="mt-1 font-display text-lg text-brown">
                {a.pole.emoji} {a.pole.label}
                <span className="text-brown-light text-sm font-body font-normal"> over {a.other.label}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* The rest stay a mystery */}
      <section className="max-w-4xl mx-auto px-6 py-6">
        <div className="rounded-2xl border-2 border-brown p-4" style={{ background: '#DCEEFB' }}>
          <h2 className="font-display text-2xl text-brown">15 more Dogtypes are out there</h2>
          <div aria-hidden="true" className="mt-3 grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
            {Array.from({ length: 15 }, (_, i) => (
              <span key={i} className="h-3.5 rounded border-2 border-dashed border-brown-mid" />
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold text-brown">
            You only meet them by matching. Find your dog&apos;s type, then start swiping to see who&apos;s out there.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brown py-16 mt-6">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-5xl mb-4" aria-hidden="true">{type.emoji}</p>
          <h2 className="font-display text-3xl text-paper mb-3">What&apos;s your dog&apos;s Dogtype?</h2>
          <p className="text-paper/85 font-semibold mb-6">
            Answer 8 playful questions and get their type in about 90 seconds — free, no signup.
          </p>
          <Link href="/quiz?ref=dogtype" className="btn-primary text-lg px-10 py-4">Find your dog&apos;s type</Link>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-12">
        <Link href="/app?from=dogtype" className="btn-secondary inline-flex">Join GoDoggyDate</Link>
      </section>

      <SiteFooter note="Dogtype is a playful personality read, not a clinical test." />
    </main>
  );
}
