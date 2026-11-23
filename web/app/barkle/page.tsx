// web/app/barkle/page.tsx
// BARKLE — a public, no-signup daily game: Wordle for dog breeds. This server
// shell owns SEO/OG metadata and the page chrome; every bit of gameplay lives
// in the BarkleGame client component. It reads nothing from Firestore, needs no
// auth, calls no AI, and is fully statically generated — it works at N=0 users
// and is identical for everyone in the world on a given day.

import type { Metadata } from 'next';
import Link from 'next/link';
import BarkleGame from '../../components/BarkleGame';
import SiteFooter from '../../components/SiteFooter';
import { PawCoin } from '../../components/StickerBits';

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
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-sky/95 backdrop-blur-md border-b-2 border-brown">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-[44px] items-center gap-2 font-display text-xl sm:text-2xl text-brown whitespace-nowrap"><PawCoin size={30} /> GoDoggyDate</Link>
          <Link href="/app" className="btn-secondary inline-flex min-h-[44px] items-center text-sm whitespace-nowrap px-4 py-2 sm:px-6">Sign up free</Link>
        </div>
      </nav>

      {/* Header */}
      <section className="max-w-2xl mx-auto px-6 pt-10 pb-6 text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brown">The daily dog game</p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-brown leading-tight">Barkle</h1>
        <p className="mt-3 font-semibold text-brown">
          Guess today&apos;s mystery breed in six tries. A fresh clue after every miss — no account, no spoilers.
        </p>
      </section>

      {/* The game */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <BarkleGame />
      </section>

      <SiteFooter note="One breed a day, the same for everyone. Just for fun." />
    </main>
  );
}
