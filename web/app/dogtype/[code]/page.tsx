// web/app/dogtype/[code]/page.tsx
// Public, SEO-indexable landing page for one of the 16 Dogtypes — the share
// destination for "my dog is a Zoomie Menace 🌪️". Reads only from the static
// shared/dogtype catalogue (no Firestore, no auth), so all 16 are statically
// generated. Unlike /d/[slug] (a specific dog, deliberately not indexed), these
// are generic identity pages we WANT crawled — they're the acquisition funnel.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DOGTYPE_CODES, dogtypeByCode, dogtypeBestMatches, dogtypeCodeDecode } from '../../../../shared/dogtype';

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
  };
}

export default function DogtypePage({ params }: PageProps) {
  const type = dogtypeByCode(params.code);
  if (!type) notFound();

  const bestMatches = dogtypeBestMatches(type.code, 3);
  const spark = type.code[0] === 'E';
  const heroGradient = spark
    ? 'linear-gradient(160deg, #7A2E0E 0%, #E8633A 55%, #F5B731 100%)'
    : 'linear-gradient(160deg, #241A2E 0%, #5C3D2E 50%, #C98A5E 100%)';

  return (
    <main className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl text-brown">🐾 GoDoggyDate</Link>
          <Link href="/app" className="btn-primary text-sm">Find your dog&apos;s Dogtype</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-12 pb-8">
        <div className="rounded-[2rem] overflow-hidden text-white p-8 sm:p-12" style={{ background: heroGradient }}>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/80">Dogtype</p>
          <div className="mt-6 text-7xl sm:text-8xl leading-none" aria-hidden="true">{type.emoji}</div>
          <h1 className="mt-4 font-display text-4xl sm:text-6xl leading-tight">{type.name}</h1>
          <p className="mt-2 text-xl text-white/90 italic font-semibold">{type.tagline}</p>
          <p className="mt-4 text-lg text-white/85 max-w-2xl leading-relaxed">{type.blurb}</p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {type.axes.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center gap-1 rounded-full bg-cream border border-border px-2.5 py-1 text-xs font-semibold text-brown"
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
              <p className="text-[11px] font-bold uppercase tracking-wide text-brown-light">{a.axis}</p>
              <p className="mt-1 font-display text-lg text-brown">
                {a.pole.emoji} {a.pole.label}
                <span className="text-brown-light text-sm font-body font-normal"> over {a.other.label}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Plays well with */}
      {bestMatches.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 py-6">
          <h2 className="font-display text-2xl text-brown mb-1">Plays well with</h2>
          <p className="text-sm text-brown-light mb-4">
            A playful read from the types — real matches get worked out dog-by-dog in the app.
          </p>
          <div className="flex flex-wrap gap-3">
            {bestMatches.map((t) => (
              <Link
                key={t.code}
                href={`/dogtype/${t.code}`}
                className="chip text-sm"
              >
                {t.emoji} {t.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-brown py-16 mt-6">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-5xl mb-4" aria-hidden="true">{type.emoji}</p>
          <h2 className="font-display text-3xl text-white mb-3">What&apos;s your dog&apos;s Dogtype?</h2>
          <p className="text-white/70 mb-6">
            Add your dog&apos;s photos and personality and get their type in about a minute — free.
          </p>
          <Link href="/app" className="btn-primary text-lg px-10 py-4">Find your dog&apos;s type</Link>
        </div>
      </section>

      {/* All 16 */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="font-display text-2xl text-brown mb-4">All 16 Dogtypes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DOGTYPE_CODES.map((code) => {
            const t = dogtypeByCode(code);
            if (!t) return null;
            const active = code === type.code;
            const decode = dogtypeCodeDecode(code);
            return (
              <Link
                key={code}
                href={`/dogtype/${code}`}
                title={decode ?? undefined}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  active ? 'border-primary bg-primary/10' : 'border-border bg-white hover:border-primary/40'
                }`}
              >
                <div className="text-2xl" aria-hidden="true">{t.emoji}</div>
                <p className="mt-1 text-xs font-bold text-brown leading-tight">{t.name}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-brown-light">
            © {new Date().getFullYear()} GoDoggyDate · Dogtype is a playful personality read, not a clinical test.
          </p>
        </div>
      </footer>
    </main>
  );
}
