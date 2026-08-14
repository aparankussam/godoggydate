'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithGoogle } from '../lib/auth';

export default function HomePage() {
  const router = useRouter();
  const [signInError, setSignInError] = useState('');

  async function handleSignIn() {
    setSignInError('');
    try {
      await signInWithGoogle();
      router.push('/app');
    } catch (err: unknown) {
      // Ignore: user closed the popup or cancelled — not an error worth showing
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      console.error('Sign-in error:', err);
      setSignInError('Sign-in failed. Please try again.');
    }
  }

  const features = [
    { emoji: '🛡️', title: 'Safety First', desc: 'Our matching engine prevents incompatible pairings before you swipe.' },
    { emoji: '🧠', title: 'Smart Compatibility', desc: 'Scored on size, energy, play style, health, and 10+ signals.' },
    { emoji: '📍', title: 'Truly Local', desc: 'Connect with dogs in your neighbourhood — real meetups, not endless scrolling.' },
    { emoji: '⭐', title: 'Trusted Community', desc: 'Public trust scores built from verified post-meetup ratings.' },
  ];

  const steps = [
    { n: '01', title: 'Create your dog\'s profile', desc: 'Add their personality, play style, and safety preferences in under 60 seconds.' },
    { n: '02', title: 'Swipe through compatible dogs', desc: 'Every card shows a compatibility score, energy match, and safety notes.' },
    { n: '03', title: 'Match & unlock chat', desc: 'When it\'s mutual, unlock the chat for $4.99 and plan your first meetup.' },
    { n: '04', title: 'Rate & build trust', desc: 'After every playdate, leave a rating. Great dogs rise to the top.' },
  ];

  return (
    <main className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-cream/90 backdrop-blur-md border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-display text-2xl text-brown">🐾 GoDoggyDate</span>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-3">
              <button onClick={handleSignIn} className="btn-secondary hidden sm:block">
                Find Playmates Near Me
              </button>
              <Link href="/app" className="btn-primary">
                Create Your Dog Profile
              </Link>
            </div>
            {signInError && (
              <p className="text-xs text-red-500">{signInError}</p>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-[rgba(232,99,58,0.1)] border border-[rgba(232,99,58,0.2)] rounded-full px-4 py-2 mb-6">
          <span className="text-sm font-semibold text-primary">🐾 Built for dogs like Kaju</span>
        </div>
        <h1 className="font-display text-5xl md:text-7xl text-brown leading-tight mb-6">
          Find safe, compatible<br />
          <span className="text-primary">playmates</span> for your dog nearby
        </h1>
        <p className="text-xl text-brown-light max-w-2xl mx-auto mb-10 leading-relaxed">
          Kaju is a goofy mini dachshund who loves everyone — but not every dog is the right match.
          We built GoDoggyDate to make finding the right playmate safe, easy, and stress-free.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/app" className="btn-primary text-lg px-8 py-4">
            Find Playmates Near Me
          </Link>
          <Link href="#how" className="btn-secondary text-lg px-8 py-4">
            How it works
          </Link>
        </div>
        <p className="mt-4 text-sm font-semibold text-primary">Join Kaju&apos;s pack 🐾</p>
        <p className="mt-2 text-sm text-brown-light">
          Free to join · No subscription needed · $4.99 to unlock chat
        </p>
      </section>

      {/* Dog card preview */}
      <section className="max-w-5xl mx-auto px-6 pb-20 flex justify-center">
        <div className="relative w-72">
          {/* Back card */}
          <div className="absolute top-4 left-4 right-4 h-96 bg-cream-dark rounded-4xl rotate-3 opacity-60" />
          {/* Front card */}
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

      {/* Features */}
      <section className="bg-cream-dark py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-display text-4xl text-brown text-center mb-12">
            Built for dog safety, not dopamine
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
            Your dog&apos;s next best friend is nearby
          </h2>
          <p className="text-[rgba(255,255,255,0.7)] mb-8 text-lg">
            Join thousands of dog owners finding safer, happier playdates every day.
          </p>
          <Link href="/app" className="btn-primary text-lg px-10 py-4">
            Create Your Dog&apos;s Profile
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display text-lg text-brown-light">🐾 GoDoggyDate</span>
          <p className="text-sm text-brown-light">
            © {new Date().getFullYear()} GoDoggyDate. Made with ❤️ for dogs everywhere.
          </p>
          <div className="flex gap-4 text-sm text-brown-light">
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
