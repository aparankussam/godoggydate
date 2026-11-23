// web/app/quiz/page.tsx
// Public, no-signup Dogtype quiz — the 16personalities-style top-of-funnel.
// This server shell handles SEO/OG metadata and the static page chrome; all
// the interactivity lives in the DogtypeQuiz client component. Reads nothing
// from Firestore and needs no auth, so it's statically generated and works at
// N=0 users.

import type { Metadata } from 'next';
import Link from 'next/link';
import DogtypeQuiz from '../../components/DogtypeQuiz';
import { PawCoin } from '../../components/StickerBits';
import SiteFooter from '../../components/SiteFooter';

export const dynamic = 'force-static';

export function generateMetadata(): Metadata {
  const title = "What's your dog's Dogtype? — a 90-second quiz | GoDoggyDate";
  const description =
    "8 playful questions, no signup. Get your dog's Dogtype — one of 16 playful personality types — plus which types they tend to vibe with. A fun read from your own answers, never a score.";
  return {
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: '/quiz' },
  };
}

export default function QuizPage() {
  return (
    <main className="min-h-screen">
      <header className="max-w-4xl mx-auto px-4 h-[54px] flex items-center justify-between">
        <Link href="/" className="inline-flex min-h-[44px] items-center gap-2 font-display text-[22px] text-brown whitespace-nowrap">
          <PawCoin size={30} /> GoDoggyDate
        </Link>
        <Link href="/app" className="inline-flex min-h-[44px] items-center px-2 text-sm font-black text-brown underline decoration-2 underline-offset-[3px] whitespace-nowrap">Sign up free</Link>
      </header>

      {/* The quiz itself */}
      <section className="max-w-4xl mx-auto px-4 pb-10">
        <DogtypeQuiz />
      </section>

      <SiteFooter note="Dogtype is a playful personality read, not a clinical test." />
    </main>
  );
}
