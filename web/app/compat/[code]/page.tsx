// web/app/compat/[code]/page.tsx
// Public, SEO-indexable "is YOUR dog compatible?" invite page for one of the 16
// Dogtypes. This is the compatibility twist on /dogtype/[code]: instead of just
// describing a type, it asks the reader a question — "your dog and a {Type} —
// would they get along?" — and hands them the honest, playful vibe read from the
// shared catalogue, then drives them into the app to find their OWN dog's type.
//
// Like /dogtype/[code], it reads ONLY from the static shared/dogtype catalogue
// (no Firestore, no auth), so all 16 are statically generated and crawlable —
// they are the top of the invite loop. Everything here is deliberately framed as
// a PLAYFUL vibe, never a score; real dog-to-dog numbers come from the app.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DOGTYPE_CODES,
  dogtypeByCode,
  dogtypeBestMatches,
  dogtypeVibe,
  type DogtypeVibe,
} from '../../../../shared/dogtype';

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
  const title = `${type.name} (${type.code}) — is YOUR dog compatible? | GoDoggyDate`;
  const description = `Would your dog get along with ${aOrAn(type.name)}? See the types that vibe best with the ${strip(type.name)}, then find your own dog's Dogtype — free.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `/compat/${type.code}` },
  };
}

const VIBE_META: Record<DogtypeVibe, { emoji: string; label: string; blurb: string }> = {
  great: { emoji: '💛', label: 'Great vibe', blurb: 'Friends before the leashes are even off.' },
  good: { emoji: '🐾', label: 'Good vibe', blurb: 'Different energies that can absolutely click.' },
  spicy: { emoji: '🌶️', label: 'Spicy', blurb: 'Real potential — just take the intro slow.' },
};

// "a" vs "an" for a type name that starts with "The " (e.g. "The Old Soul").
function strip(name: string) {
  return name.replace(/^The /, '');
}
function aOrAn(name: string) {
  const bare = strip(name);
  return `${/^[AEIOU]/i.test(bare) ? 'an' : 'a'} ${name}`;
}

export default function CompatPage({ params }: PageProps) {
  const type = dogtypeByCode(params.code);
  if (!type) notFound();

  // Up to six types that vibe best, each with its honest playful tier.
  const matches = dogtypeBestMatches(type.code, 6).map((m) => ({
    type: m,
    vibe: dogtypeVibe(type.code, m.code),
  }));

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
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/80">Compatibility</p>
            <span className="font-mono text-base font-bold tracking-[0.28em] bg-black/25 rounded-md px-3 py-1.5">
              {type.code}
            </span>
          </div>
          <div className="mt-6 text-7xl sm:text-8xl leading-none" aria-hidden="true">{type.emoji}</div>
          <h1 className="mt-4 font-display text-4xl sm:text-6xl leading-tight">
            {type.name} — is YOUR dog compatible?
          </h1>
          <p className="mt-3 text-lg sm:text-xl text-white/90 max-w-2xl leading-relaxed">
            The <span className="font-semibold">{strip(type.name)}</span> is {type.tagline.replace(/[.!]$/, '')}.
            {' '}Would your dog and {aOrAn(type.name)} get along? Here&apos;s the playful read.
          </p>
        </div>
      </section>

      {/* Best matches grid */}
      {matches.length > 0 && (
        <section className="max-w-4xl mx-auto px-6 py-6">
          <h2 className="font-display text-2xl text-brown mb-1">
            Types the {strip(type.name)} vibes with
          </h2>
          <p className="text-sm text-brown-light mb-4">
            A playful read from the four axes — labeled as a vibe, not a score. Real matches get
            worked out dog-by-dog in the app.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {matches.map(({ type: t, vibe }) => {
              const meta = VIBE_META[vibe];
              return (
                <Link
                  key={t.code}
                  href={`/compat/${t.code}`}
                  className="card p-4 rounded-2xl flex items-start gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="text-3xl leading-none" aria-hidden="true">{t.emoji}</div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-display text-lg text-brown leading-tight">{t.name}</p>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-brown-light">
                        {meta.emoji} {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-brown-light">{meta.blurb}</p>
                    <p className="mt-0.5 text-[10px] font-mono text-brown-light tracking-widest">{t.code}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Honest note */}
      <section className="max-w-4xl mx-auto px-6 py-2">
        <div className="card p-5 rounded-2xl bg-white">
          <p className="text-sm text-brown-mid leading-relaxed">
            <span className="font-semibold text-brown">The honest bit:</span> this is a playful vibe
            based on personality types, not a compatibility percentage. Two dogs of any types can be
            best friends with a good intro — the app works out the real match between your actual dog
            and theirs.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brown py-16 mt-6">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-5xl mb-4" aria-hidden="true">{type.emoji}</p>
          <h2 className="font-display text-3xl text-white mb-3">
            Is your dog compatible? Find out.
          </h2>
          <p className="text-white/70 mb-6">
            Add your dog&apos;s photos and personality, get their Dogtype in about a minute, then see
            how they vibe with {aOrAn(type.name)} — free.
          </p>
          <Link href="/app" className="btn-primary text-lg px-10 py-4">Find your dog&apos;s type</Link>
        </div>
      </section>

      {/* Learn about this type */}
      <section className="max-w-4xl mx-auto px-6 py-10 text-center">
        <Link href={`/dogtype/${type.code}`} className="chip text-sm">
          {type.emoji} Read the full {strip(type.name)} profile
        </Link>
      </section>

      {/* All 16 */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <h2 className="font-display text-2xl text-brown mb-4">Check compatibility for all 16 Dogtypes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DOGTYPE_CODES.map((code) => {
            const t = dogtypeByCode(code);
            if (!t) return null;
            const active = code === type.code;
            return (
              <Link
                key={code}
                href={`/compat/${code}`}
                className={`rounded-xl border p-3 text-center transition-colors ${
                  active ? 'border-primary bg-primary/10' : 'border-border bg-white hover:border-primary/40'
                }`}
              >
                <div className="text-2xl" aria-hidden="true">{t.emoji}</div>
                <p className="mt-1 text-xs font-bold text-brown leading-tight">{t.name}</p>
                <p className="text-[10px] font-mono text-brown-light tracking-widest">{code}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-brown-light">
            © {new Date().getFullYear()} GoDoggyDate · Dogtype compatibility is a playful personality read, not a clinical test.
          </p>
        </div>
      </footer>
    </main>
  );
}
