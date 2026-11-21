// web/app/quiz/page.tsx
// Public, no-signup Dogtype quiz — the 16personalities-style top-of-funnel.
// This server shell handles SEO/OG metadata and the static page chrome; all
// the interactivity lives in the DogtypeQuiz client component. Reads nothing
// from Firestore and needs no auth, so it's statically generated and works at
// N=0 users.

import type { Metadata } from 'next';
import Link from 'next/link';
import DogtypeQuiz from '../../components/DogtypeQuiz';
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
    <main className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex min-h-[44px] items-center font-display text-xl sm:text-2xl text-brown whitespace-nowrap">🐾 GoDoggyDate</Link>
          <Link href="/app" className="btn-secondary text-sm whitespace-nowrap px-4 sm:px-6">Sign up free</Link>
        </div>
      </nav>

      {/* The quiz itself */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <DogtypeQuiz />
      </section>

      <SiteFooter note="Dogtype is a playful personality read, not a clinical test." />
    </main>
  );
}
