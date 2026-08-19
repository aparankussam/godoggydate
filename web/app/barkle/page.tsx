// web/app/barkle/page.tsx
// BARKLE — a public, no-signup daily game: Wordle for dog breeds. This server
// shell owns SEO/OG metadata and the page chrome; every bit of gameplay lives
// in the BarkleGame client component. It reads nothing from Firestore, needs no
// auth, calls no AI, and is fully statically generated — it works at N=0 users
// and is identical for everyone in the world on a given day.

import type { Metadata } from 'next';
import Link from 'next/link';
import BarkleGame from '../../components/BarkleGame';

export const dynamic = 'force-static';

export function generateMetadata(): Metadata {
  const title = 'Barkle — the daily dog-breed guessing game | GoDoggyDate';
  const description =
    'One mystery dog breed a day, six guesses, a new clue after every miss. No signup, no spoilers — the same puzzle for everyone in the world. Share your spoiler-free score.';
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: '/barkle' },
  };
}

export default function BarklePage() {
  return (
    <main className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-display text-2xl text-brown">🐾 GoDoggyDate</Link>
          <Link href="/app" className="btn-secondary text-sm">Open the app</Link>
        </div>
      </nav>

      {/* Header */}
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brown-light">The daily dog game</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-brown leading-tight">Barkle</h1>
        <p className="mt-3 text-brown-mid">
          Guess today&apos;s mystery breed in six tries. A fresh clue after every miss — no account, no spoilers.
        </p>
      </section>

      {/* The game */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <BarkleGame />
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-sm text-brown-light">
            © {new Date().getFullYear()} GoDoggyDate · One breed a day, the same for everyone. Just for fun.
          </p>
        </div>
      </footer>
    </main>
  );
}
