'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthModal from '../components/AuthModal';
import FoundingPackSection from '../components/FoundingPackSection';
import CopyrightYear from '../components/CopyrightYear';
import { trackEvent } from '../lib/analytics';
import { onAuthStateChanged } from '../lib/auth';
import { getFirebase } from '../shared/utils/firebase';
import { getEntitlements, getFoundingMemberLink, isProActive } from '../lib/entitlements';
import { takePendingPackDay } from '../lib/packDayPending';

export default function HomePage() {
  const router = useRouter();
  const [showAuth,    setShowAuth]    = useState(false);
  const [signedIn,    setSignedIn]    = useState(false);
  const [userId,      setUserId]      = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // Set when sign-in was opened from the $39 button, so it resumes checkout.
  const resumeFoundingCheckout = useRef(false);

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

  async function handleAuthSuccess() {
    const uid = getFirebase().auth.currentUser?.uid;
    if (resumeFoundingCheckout.current && uid) {
      resumeFoundingCheckout.current = false;
      const link = getFoundingMemberLink(uid);
      if (link && !isProActive(await getEntitlements(uid))) {
        // Same tab: a popup opened after an async step gets blocked.
        window.location.href = link;
        return;
      }
    }
    // A visitor who came from a shared Pack Day goes back to that event.
    const pendingPackDay = takePendingPackDay();
    router.push(pendingPackDay ? `/app/pack/${pendingPackDay}` : '/app');
  }

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
    { emoji: '🎉', title: 'The Playroom', desc: 'Playful, shareable cards built from your dog\'s real profile — a roast, a letter in their voice, a Wanted poster, and more. Openly AI-written, never faked.' },
    { emoji: '⏳', title: 'Life in Dog Years', desc: 'See the life stage they\'re actually in — honest cohort averages, never a countdown.' },
    { emoji: '🎂', title: 'Every milestone', desc: 'Birthdays, Gotcha Day, and your anniversary together — remembered and celebrated on the day.' },
    { emoji: '🛡️', title: 'Playmates who fit', desc: 'When you want company, match with compatible dogs nearby — with the flags owners declare surfaced up front. Or join a Pack Day: an open group playdate at a public place, hosted by a member.' },
    { emoji: '⭐', title: 'Founding Members', desc: 'Get in early. Only 150 dogs ever get a permanent, numbered Founding Member spot.' },
  ];

  const steps = [
    { n: '01', title: "Create your dog's profile", desc: 'A few photos and their personality — that\'s all it takes to unlock everything else.' },
    { n: '02', title: 'Meet their Dogtype', desc: 'Get your dog\'s 16-type identity card, their life stage, and a Playroom full of cards to share — instantly, solo.' },
    { n: '03', title: 'Share it', desc: 'The Dogtype card is made to post. Every share is how another owner (and their dog) finds the app.' },
    { n: '04', title: 'Find playmates who fit', desc: 'When you\'re ready for company, match with compatible dogs nearby and plan a real meetup — or join a Pack Day, an open group playdate at a public place.' },
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
        onClose={() => {
          // Dismissed: a later plain sign-in shouldn't jump to checkout. On success
          // this runs after handleAuthSuccess has already read the flag.
          resumeFoundingCheckout.current = false;
          setShowAuth(false);
        }}
        onSuccess={handleAuthSuccess}
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
      <section className="max-w-5xl mx-auto px-6 pt-6 pb-12 text-center md:pt-14 md:pb-16">
        {/* A real dog above the fold, so a first-time visitor sees what this is
            about before reading a word. Cropped to Kaju's face on phones. */}
        <div className="mx-auto mb-5 w-full max-w-md overflow-hidden rounded-3xl border border-border shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/kaju-hero-sm.jpg"
            alt="Kaju, a red mini dachshund, standing on a rock in a creek"
            width={800}
            height={467}
            fetchPriority="high"
            decoding="async"
            className="h-32 w-full object-cover object-[50%_26%] sm:h-52"
          />
        </div>
        <div className="inline-flex items-center gap-2 bg-[rgba(255,92,141,0.1)] border border-[rgba(255,92,141,0.2)] rounded-full px-4 py-1.5 mb-4 md:mb-6">
          <span className="text-sm font-semibold text-rose">🐕 The local dog playdate app</span>
        </div>
        <h1 className="font-display text-4xl md:text-7xl text-brown leading-tight mb-4 md:mb-6">
          Your dog&apos;s <span className="text-rose">whole life</span>,<br className="hidden md:block" />{' '}
          in one place
        </h1>
        <p className="text-base md:text-xl text-brown-light max-w-2xl mx-auto mb-6 md:mb-10 leading-relaxed">
          Meet compatible dogs near you for safer playdates — and keep your dog&apos;s Dogtype, life
          stage and milestones in one place. Free to start. No dog park required.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          {signedIn ? (
            <button
              onClick={() => handleCTA('hero_primary')}
              className="btn-primary text-lg px-8 py-3.5 md:py-4"
            >
              Open App →
            </button>
          ) : (
            <Link
              href="/quiz?ref=hero"
              onClick={() => trackEvent('cta_click', { source: 'hero_quiz', signed_in: false })}
              className="btn-primary text-center text-lg px-8 py-3.5 md:py-4"
            >
              🐶 Find your dog&apos;s Dogtype
            </Link>
          )}
          {signedIn ? (
            <Link href="/quiz?ref=hero" className="btn-secondary text-center text-lg px-8 py-3.5 md:py-4">
              🐶 Take the 90-second quiz
            </Link>
          ) : (
            <button
              onClick={() => handleCTA('hero_create_profile')}
              className="btn-secondary text-lg px-8 py-3.5 md:py-4"
            >
              Create your dog&apos;s profile
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-brown-light">
          The Dogtype quiz takes 90 seconds, no signup. Also free without an account: <Link href="/excuse" className="font-semibold text-rose underline underline-offset-2">Dog Excuse Note</Link> · <Link href="/barkle" className="font-semibold text-rose underline underline-offset-2">Barkle (daily breed puzzle)</Link>.
        </p>
        <p className="mt-4 text-sm font-semibold text-rose">You get their whole life. They get you for all of theirs. 🐾</p>
        <p className="mt-2 text-sm text-brown-light">
          Built around who your dog is — not an endless feed
        </p>
      </section>

      {/* Dog card preview */}
      <section className="max-w-5xl mx-auto px-6 pb-20 flex justify-center">
        <div className="relative w-72">
          <div className="absolute top-4 left-4 right-4 h-96 bg-cream-dark rounded-4xl rotate-3 opacity-60" />
          <div className="card rounded-4xl overflow-hidden relative">
            <div className="h-56 bg-cream-dark overflow-hidden relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/kaju-profile.jpg" alt="Kaju" className="w-full h-full object-cover object-[50%_32%]" loading="lazy" decoding="async" width={640} height={960} />
              <span className="absolute top-2 left-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brown-mid">Sample card</span>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="score-ring w-11 h-11 text-sm">96</div>
                <div>
                  <p className="font-display text-xl text-brown">Kaju, Adult</p>
                  <p className="text-xs text-rose font-semibold uppercase tracking-wide mb-0.5">Founder Dog</p>
                  <p className="text-sm text-brown-light">Mini Dachshund · 0.1 mi away</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {['📋 Owner marked: vaccinated', '⚡ 70% energy', '🎾 Fetch'].map((t) => (
                  <span key={t} className="chip text-xs">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <FoundingPackSection
        signedInUserId={userId}
        onClaimFreeSpot={() => handleCTA('founding_free_spot')}
        onRequireAuth={() => {
          resumeFoundingCheckout.current = true;
          setShowAuth(true);
        }}
      />

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
              {/* Fixed-width numeral column so every step's text starts at the same x. */}
              <span className="w-16 shrink-0 font-display text-5xl text-[rgba(255,92,141,0.2)] leading-none tabular-nums">
                {s.n}
              </span>
              <div className="min-w-0">
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
            Get their Dogtype, their life stage, and a Playroom of shareable cards in minutes — then find
            the playmates who fit. Get in while Founding Member spots last.
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
              © <CopyrightYear /> GoDoggyDate. Made with ❤️ for dogs everywhere.
            </p>
            <p className="mt-1 text-xs text-brown-light/90">
              GoDoggyDate is operated by GoBots LLC · <a href="https://gobotsai.com" target="_blank" rel="noreferrer" className="hover:text-rose transition-colors">gobotsai.com</a>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-brown-light">
            <Link href="/dogtype" className="py-2.5 hover:text-rose transition-colors">The 16 Dogtypes</Link>
            <Link href="/playdate-safety" className="py-2.5 hover:text-rose transition-colors">Play or Fight?</Link>
            <Link href="/dog-playdates" className="py-2.5 hover:text-rose transition-colors">Dog Playdates</Link>
            <Link href="/dog-socialization-tips" className="py-2.5 hover:text-rose transition-colors">Socialization Tips</Link>
            <Link href="/support" className="py-2.5 hover:text-rose transition-colors">Support</Link>
            <Link href="/privacy" className="py-2.5 hover:text-rose transition-colors">Privacy</Link>
            <Link href="/terms" className="py-2.5 hover:text-rose transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
