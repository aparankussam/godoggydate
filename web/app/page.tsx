'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthModal from '../components/AuthModal';
import FoundingPackSection from '../components/FoundingPackSection';
import { trackEvent } from '../lib/analytics';
import { onAuthStateChanged } from '../lib/auth';
import { getFirebase } from '../shared/utils/firebase';

export default function HomePage() {
  const router = useRouter();
  const [showAuth,    setShowAuth]    = useState(false);
  const [signedIn,    setSignedIn]    = useState(false);
  const [userId,      setUserId]      = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Quick auth check — determines whether to show "Get Started" or "Open App"
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setSignedIn(!!user);
      setUserId(user?.uid ?? null);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    trackEvent('landing_view');
  }, []);

  // If already signed in, CTAs go straight to /app
  function handleCTA(source: string) {
    trackEvent('cta_click', {
      source,
      signed_in: signedIn,
    });
    router.push('/app');
  }

  // The whole-life value that lands at N=1 — no other dogs required — leads,
  // and finding playmates is one part of it (it's the piece that needs local
  // density, so it can't be the whole pitch). Every line is scoped to what the
  // app actually does today.
  const features = [
    { emoji: '🧬', title: 'Your dog\'s Dogtype', desc: 'A shareable 16-type identity, read from who your dog actually is — not a quiz you fill in for them.' },
    { emoji: '💭', title: 'Pet Twin', desc: 'A card in your dog\'s voice — weekly free, daily with Pro — grounded in something real about their day. Openly imagined, never faked.' },
    { emoji: '⏳', title: 'Life in Dog Years', desc: 'See the life stage they\'re actually in — honest cohort averages, never a countdown.' },
    { emoji: '🎂', title: 'Every milestone', desc: 'Birthdays, Gotcha Day, and your anniversary together — remembered and celebrated on the day.' },
    { emoji: '🛡️', title: 'Playmates who fit', desc: 'When you want company, match with compatible dogs nearby — with the flags owners declare surfaced up front.' },
    { emoji: '🐾', title: 'Founding Pack', desc: 'Get in early — a permanent, numbered spot among the first dogs here.' },
  ];

  const steps = [
    { n: '01', title: "Create your dog's profile", desc: 'A few photos and their personality — that\'s all it takes to unlock everything else.' },
    { n: '02', title: 'Meet their Dogtype', desc: 'Get your dog\'s 16-type identity card, their life stage, and their first Pet Twin card — instantly, solo.' },
    { n: '03', title: 'Share it', desc: 'The Dogtype card is made to post. Every share is how another owner (and their dog) finds the app.' },
    { n: '04', title: 'Find playmates who fit', desc: 'When you\'re ready for company, match with compatible dogs nearby and plan a real meetup.' },
  ];

  const ctaLabel = !authChecked
    ? 'Get Started'
    : signedIn
    ? 'Open App →'
    : 'Get Started';

  return (
    <main className="min-h-screen bg-cream">
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => router.push('/app')}
      />

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-display text-2xl text-brown">🐾 GoDoggyDate</span>
          <div className="flex items-center gap-3">
            {/* "Find Playmates" only for guests */}
            {(!authChecked || !signedIn) && (
                <button
                onClick={() => handleCTA('nav_find_playmates')}
                className="btn-secondary hidden sm:block"
              >
                Find Playmates Near Me
              </button>
            )}
            <button
              onClick={() => handleCTA('nav_primary')}
              className="btn-primary"
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-[rgba(232,99,58,0.1)] border border-[rgba(232,99,58,0.2)] rounded-full px-4 py-2 mb-6">
          <span className="text-sm font-semibold text-primary">🧬 Meet your dog&apos;s Dogtype</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl text-brown leading-tight mb-6">
          Your dog&apos;s<br />
          <span className="text-primary">whole life</span>, in one place
        </h1>
        <p className="text-xl text-brown-light max-w-2xl mx-auto mb-10 leading-relaxed">
          Discover their Dogtype, watch them grow through every life stage, celebrate the real
          milestones — and find the playmates who actually fit. Free to start. No dog park required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => handleCTA('hero_primary')}
            className="btn-primary text-lg px-8 py-4"
          >
            {signedIn ? 'Open App →' : "Find your dog's Dogtype"}
          </button>
          <Link href="/quiz" className="btn-secondary text-lg px-8 py-4">
            🐶 Take the 90-second quiz
          </Link>
        </div>
        <p className="mt-3 text-sm text-brown-light">
          No signup needed — <Link href="/quiz" className="font-semibold text-primary underline underline-offset-2">find your dog&apos;s Dogtype</Link> · <Link href="/excuse" className="font-semibold text-primary underline underline-offset-2">get a Dog Excuse Note</Link> · <Link href="#how" className="font-semibold text-primary underline underline-offset-2">how it works</Link>.
        </p>
        <p className="mt-4 text-sm font-semibold text-primary">You get their whole life. They get you for all of theirs. 🐾</p>
        <p className="mt-2 text-sm text-brown-light">
          Built around who your dog is — not an endless feed
        </p>
      </section>

      {/* Dog card preview */}
      <section className="max-w-5xl mx-auto px-6 pb-20 flex justify-center">
        <div className="relative w-72">
          <div className="absolute top-4 left-4 right-4 h-96 bg-cream-dark rounded-4xl rotate-3 opacity-60" />
          <div className="card rounded-4xl overflow-hidden relative">
            <div className="h-56 bg-cream-dark overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/kaju-hero.jpg" alt="Kaju" className="w-full h-full object-cover" />
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="score-ring w-11 h-11 text-sm">96</div>
                <div>
                  <p className="font-display text-xl text-brown">Kaju, Adult</p>
                  <p className="text-xs text-primary font-semibold uppercase tracking-wide mb-0.5">Founder Dog</p>
                  <p className="text-sm text-brown-light">Mini Dachshund · 0.1 mi away</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {['✅ Vaccinated', '⚡ 70% energy', '🎾 Fetch'].map((t) => (
                  <span key={t} className="chip text-xs">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <FoundingPackSection signedInUserId={userId} onRequireAuth={() => setShowAuth(true)} />

      {/* Features */}
      <section className="bg-cream-dark py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-display text-4xl text-brown text-center mb-3">
            Everything your dog is — in one app
          </h2>
          <p className="text-center text-brown-light max-w-xl mx-auto mb-12">
            Most of it works the moment you sign up, with no other dogs required.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card p-6 rounded-2xl">
                <span className="text-4xl mb-4 block">{f.emoji}</span>
                <h3 className="font-display text-lg text-brown mb-2">{f.title}</h3>
                <p className="text-sm text-brown-light leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="font-display text-4xl text-brown text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-5">
              <span className="font-display text-5xl text-[rgba(232,99,58,0.2)] leading-none shrink-0">
                {s.n}
              </span>
              <div>
                <h3 className="font-display text-xl text-brown mb-2">{s.title}</h3>
                <p className="text-brown-light leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brown py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-6xl mb-6">🐾</p>
          <h2 className="font-display text-4xl text-white mb-4">
            Start with who your dog is
          </h2>
          <p className="text-[rgba(255,255,255,0.7)] mb-8 text-lg">
            Get their Dogtype, their life stage, and their first Pet Twin card in minutes — then find
            the playmates who fit. Be among the first dogs in the Founding Pack.
          </p>
          <button
            onClick={() => handleCTA('footer_primary')}
            className="btn-primary text-lg px-10 py-4"
          >
            {signedIn ? 'Open App →' : "Create Your Dog's Profile"}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display text-lg text-brown-light">🐾 GoDoggyDate</span>
          <div className="text-center sm:text-left">
            <p className="text-sm text-brown-light">
              © {new Date().getFullYear()} GoDoggyDate. Made with ❤️ for dogs everywhere.
            </p>
            <p className="mt-1 text-xs text-brown-light/90">
              A GoBotsAI product · <a href="https://gobotsai.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">gobotsai.com</a>
            </p>
          </div>
          <div className="flex gap-4 text-sm text-brown-light">
            <Link href="/playdate-safety" className="hover:text-primary transition-colors">Play or Fight?</Link>
            <Link href="/dog-playdates" className="hover:text-primary transition-colors">Dog Playdates</Link>
            <Link href="/dog-socialization-tips" className="hover:text-primary transition-colors">Socialization Tips</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
