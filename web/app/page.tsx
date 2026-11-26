'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthModal from '../components/AuthModal';
import FoundingPackSection from '../components/FoundingPackSection';
import CopyrightYear from '../components/CopyrightYear';
import BrandLogo from '../components/BrandLogo';
import AnimatedLogo from '../components/AnimatedLogo';
import { trackEvent } from '../lib/analytics';
import { onAuthStateChanged } from '../lib/auth';
import { getFirebase } from '../shared/utils/firebase';
import { getEntitlements, getFoundingMemberLink, isProActive } from '../lib/entitlements';
import { takePendingPackDay } from '../lib/packDayPending';
import { PawCoin, Tape, StickerDog, Chevron } from '../components/StickerBits';

export default function HomePage() {
  const router = useRouter();
  const [showAuth,    setShowAuth]    = useState(false);
  const [signedIn,    setSignedIn]    = useState(false);
  const [userId,      setUserId]      = useState<string | null>(null);
  const [, setAuthChecked] = useState(false);
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
    { icon: 'type', title: 'Your dog\'s Dogtype', desc: 'A shareable 16-type identity, read from who your dog actually is — not a quiz you fill in for them.' },
    { icon: 'cards', title: 'The Playroom', desc: 'Playful, shareable cards built from your dog\'s real profile — a roast, a letter in their voice, a Wanted poster, and more. Openly AI-written, never faked.' },
    { icon: 'hourglass', title: 'Life in Dog Years', desc: 'See the life stage they\'re actually in — honest cohort averages, never a countdown.' },
    { icon: 'cake', title: 'Every milestone', desc: 'Birthdays, Gotcha Day, and your anniversary together — remembered and celebrated on the day.' },
    { icon: 'pack', title: 'Playmates who fit', desc: 'When you want company, match with compatible dogs nearby — with the flags owners declare surfaced up front. Or join a Pack Day: an open group playdate at a public place, hosted by a member.' },
    { icon: 'star', title: 'Founding Members', desc: 'Get in early. Only 150 dogs ever get a permanent, numbered Founding Member spot.' },
  ];

  const steps = [
    { n: '01', title: "Create your dog's profile", desc: 'A few photos and their personality — that\'s all it takes to unlock everything else.' },
    { n: '02', title: 'Meet their Dogtype', desc: 'Get your dog\'s 16-type identity card, their life stage, and a Playroom full of cards to share — instantly, solo.' },
    { n: '03', title: 'Share it', desc: 'The Dogtype card is made to post. Every share is how another owner (and their dog) finds the app.' },
    { n: '04', title: 'Find playmates who fit', desc: 'When you\'re ready for company, match with compatible dogs nearby and plan a real meetup — or join a Pack Day, an open group playdate at a public place.' },
  ];

  const trust = ['Adults 18+', 'Approximate location only', "Each owner's limits shown up front", 'Meet in public places'];

  return (
    <main className="min-h-screen">
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

      {/* Hero: sky page, taped polaroid, one pink action */}
      <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-6 lg:pt-4">
        <div className="lg:col-span-2">
          <header className="flex h-[50px] items-center justify-between pl-4 pr-2 pt-1.5">
            <Link href="/" aria-label="GoDoggyDate home" className="flex min-h-[44px] items-center gap-2">
              <BrandLogo height={40} />
            </Link>
            <button
              type="button"
              onClick={() => handleCTA('nav_sign_in')}
              className="flex h-11 min-w-[64px] items-center justify-center px-2 text-sm font-black text-brown underline decoration-2 underline-offset-[3px]"
            >
              {signedIn ? 'Open app' : 'Sign in'}
            </button>
          </header>
        </div>

        {/* Sample card: Kaju in a taped polaroid */}
        <div className="relative mx-auto mt-0 h-[364px] w-full max-w-[420px] lg:h-[420px]">
          <figure
            aria-label="Sample card: Kaju"
            className="absolute left-[12%] top-7 m-0 w-[80%] rotate-2 rounded-md bg-paper px-[9px] pt-[9px] shadow-[0_0_0_1.5px_#2A1F4A,0_12px_20px_rgba(42,31,74,0.26)]"
          >
            <Tape style={{ top: -10, left: 22, width: 84, height: 24, transform: 'rotate(-5deg)' }} />
            <div className="relative h-[272px] overflow-hidden rounded-[3px] border-[1.5px] border-brown bg-[#E9E6E2] lg:h-[320px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/kaju-profile.jpg"
                alt="Kaju, a mini dachshund in a plaid coat and yellow boots, running at the camera through snow with his ears flying"
                width={640}
                height={960}
                fetchPriority="high"
                decoding="async"
                className="h-full w-full origin-[50%_42%] scale-[1.3] object-cover object-[50%_30%]"
              />
            </div>

            <div className="absolute -right-3.5 -top-7 z-[4] w-40 rotate-[4deg] overflow-hidden rounded-[9px] border-2 border-brown bg-paper text-center shadow-[0_3px_0_rgba(42,31,74,0.28)]">
              <p className="bg-brown px-0 pb-1 pt-[3px] text-xs font-black leading-[1.2] tracking-[0.3px] text-paper">Kaju&apos;s Dogtype</p>
              <p className="whitespace-nowrap px-1 pt-1 font-display text-[19px] leading-[1.05]">The Zoomie Menace</p>
              <p className="px-1.5 pb-[5px] pt-px text-[13px] font-extrabold leading-[1.2] text-brown-mid">Maximum dog.</p>
            </div>

            <p className="absolute -right-2 top-[247px] z-[3] m-0 -rotate-3 whitespace-nowrap rounded-md border-2 border-brown bg-paper px-[9px] pb-[3px] pt-0.5 text-[12.5px] font-black leading-[1.3] shadow-[0_2px_0_rgba(42,31,74,0.28)] lg:top-[295px]">
              Sample card
            </p>

            <figcaption className="flex h-[50px] items-center gap-[9px] pb-0.5 pl-[104px] pr-1.5">
              <span className="font-display text-[28px] leading-none tracking-[0.3px]">Kaju</span>
              <span className="-rotate-[1.5deg] whitespace-nowrap font-hand text-[22px] font-bold leading-[0.92]">
                Goofy, fearless,
                <br />
                treats-obsessed
              </span>
            </figcaption>
          </figure>

          {/* "Your dog?" small polaroid with the drawn dog */}
          <div className="absolute left-3 top-[204px] z-[5] w-[122px] -rotate-6 rounded-md bg-paper px-[7px] pt-[7px] shadow-[0_0_0_1.5px_#2A1F4A,0_8px_14px_rgba(42,31,74,0.26)] lg:top-[262px]">
            <Tape style={{ top: -8, left: 38, width: 46, height: 15, transform: 'rotate(4deg)' }} />
            <div className="flex h-24 items-center justify-center rounded-[3px] border-2 border-dashed border-brown bg-note">
              <StickerDog size={80} />
            </div>
            <p className="m-0 pb-1.5 pt-[3px] text-center">
              <span className="block font-display text-[20px] leading-[1.05]">Your dog?</span>
              <span className="block text-[12.5px] font-black leading-[15px]">Dogtype: ?</span>
            </p>
          </div>
        </div>

        <div className="lg:pb-6">
          <div className="mx-[18px] mb-3 max-w-[360px]">
            <AnimatedLogo />
          </div>
          <h1 className="mx-[18px] mt-1.5 font-display text-[34px] font-normal leading-none tracking-[0.2px] text-brown lg:text-6xl lg:leading-[1.02]">
            Find a dog who
            <br />
            plays like yours.
          </h1>
          <p className="mx-[18px] mt-1.5 text-[15px] font-extrabold leading-5 text-brown-mid lg:text-lg lg:leading-7">
            <span className="font-black text-brown">Playdates for your dog</span> with compatible dogs nearby. Friendship between dogs, not dating.
          </p>

          <div className="relative mx-[18px] mt-[22px] lg:max-w-md">
            {signedIn ? (
              <button
                type="button"
                onClick={() => handleCTA('hero_primary')}
                className="btn-primary flex h-14 w-full items-center justify-center gap-2.5 px-0 pb-[5px] pt-0 text-[25px] leading-none tracking-[0.3px]"
              >
                Open the app
                <Chevron />
              </button>
            ) : (
              <Link
                href="/quiz?ref=hero"
                onClick={() => trackEvent('cta_click', { source: 'hero_quiz', signed_in: false })}
                className="btn-primary flex h-14 w-full items-center justify-center gap-2.5 px-0 pb-[5px] pt-0 text-[25px] leading-none tracking-[0.3px]"
              >
                Find your dog&apos;s Dogtype
                <Chevron />
              </Link>
            )}
            {!signedIn && (
              <p className="absolute -right-1 -top-[15px] m-0 rotate-3 whitespace-nowrap rounded-md border-2 border-brown bg-paper px-[9px] pb-[3px] pt-0.5 text-[12.5px] font-black leading-[1.3] shadow-[0_2px_0_rgba(42,31,74,0.28)]">
                Free · 90 seconds, no signup
              </p>
            )}
          </div>

          <p className="mx-[18px] mb-6 mt-2 text-center text-[13px] font-extrabold leading-[18px] text-brown-mid lg:max-w-md">
            Dogtype is a playful read, not a score.
          </p>
        </div>
      </div>

      {/* Plain trust band */}
      <section aria-label="What to know" className="rounded-t-[22px] border-t-[2.5px] border-brown bg-paper px-5 pb-6 pt-[18px]">
        <ul className="mx-auto w-fit max-w-full list-none p-0">
          {trust.map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-[15.5px] font-extrabold leading-[30px] text-brown">
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-brown" />
              {t}
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-5 flex max-w-sm flex-col items-center gap-1">
          {signedIn ? (
            <Link href="/quiz?ref=hero" className="btn-secondary flex min-h-[48px] w-full items-center justify-center text-base">
              Take the 90-second quiz
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => handleCTA('hero_create_profile')}
              className="btn-secondary flex min-h-[48px] w-full items-center justify-center text-base"
            >
              Create your dog&apos;s profile
            </button>
          )}
          <p className="mt-2 text-center text-sm font-bold text-brown-mid">
            Also free without an account:{' '}
            <Link href="/excuse" className="inline-block py-2 font-black text-brown underline underline-offset-2">Dog Excuse Note</Link>
            {' · '}
            <Link href="/barkle" className="inline-block py-2 font-black text-brown underline underline-offset-2">Barkle (daily breed puzzle)</Link>
          </p>
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
      <section className="border-y-[2.5px] border-brown bg-cream-dark py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-display text-4xl text-brown text-center mb-3">
            Everything your dog is — in one app
          </h2>
          <p className="text-center font-bold text-brown-mid max-w-xl mx-auto mb-10">
            Most of it works the moment you sign up, with no other dogs required.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div key={f.title} className={`card p-6 ${i % 2 === 0 ? '-rotate-[0.6deg]' : 'rotate-[0.6deg]'}`}>
                <span aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-brown bg-note">
                  <FeatureIcon name={f.icon} />
                </span>
                <h3 className="font-display text-xl text-brown mb-2">{f.title}</h3>
                <p className="text-sm font-semibold text-brown-mid leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display text-4xl text-brown text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-4 rounded-3xl border-2 border-brown bg-paper p-5 shadow-[0_8px_0_rgba(42,31,74,0.12)]">
              <span className="w-12 shrink-0 font-display text-4xl leading-none tabular-nums text-brown">
                {s.n}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-xl text-brown mb-1.5">{s.title}</h3>
                <p className="text-sm font-semibold text-brown-mid leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brown py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <span aria-hidden="true" className="mx-auto mb-5 flex justify-center">
            <PawCoin size={56} />
          </span>
          <h2 className="font-display text-4xl text-paper mb-4">
            Start with who your dog is
          </h2>
          <p className="text-paper/85 font-semibold mb-8 text-lg">
            Get their Dogtype, their life stage, and a Playroom of shareable cards in minutes — then find
            the playmates who fit. Get in while Founding Member spots last.
          </p>
          <button
            onClick={() => handleCTA('footer_primary')}
            className="btn-primary text-lg px-10 py-4 min-h-[48px]"
          >
            {signedIn ? 'Open App →' : "Create Your Dog's Profile"}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-paper border-t-[2.5px] border-brown py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 font-display text-xl text-brown">
            <PawCoin size={28} /> GoDoggyDate
          </span>
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-brown-mid">
              © <CopyrightYear /> GoDoggyDate. Made for dogs everywhere.
            </p>
            <p className="mt-1 text-xs font-semibold text-brown-mid">
              GoDoggyDate is operated by GoBots LLC · <a href="https://gobotsai.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-brown">gobotsai.com</a>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-bold text-brown-mid">
            <Link href="/dogtype" className="py-2.5 hover:text-brown transition-colors">The 16 Dogtypes</Link>
            <Link href="/playdate-safety" className="py-2.5 hover:text-brown transition-colors">Play or Fight?</Link>
            <Link href="/dog-playdates" className="py-2.5 hover:text-brown transition-colors">Dog Playdates</Link>
            <Link href="/dog-socialization-tips" className="py-2.5 hover:text-brown transition-colors">Socialization Tips</Link>
            <Link href="/support" className="py-2.5 hover:text-brown transition-colors">Support</Link>
            <Link href="/privacy" className="py-2.5 hover:text-brown transition-colors">Privacy</Link>
            <Link href="/terms" className="py-2.5 hover:text-brown transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureIcon({ name }: { name: string }) {
  const p = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: '#2A1F4A', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (name) {
    case 'type':
      return (<svg {...p}><path d="M4 7h16M4 12h10M4 17h13" /></svg>);
    case 'cards':
      return (<svg {...p}><rect x="4" y="5" width="11" height="14" rx="2" /><path d="M18 8l2 9" /></svg>);
    case 'hourglass':
      return (<svg {...p}><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" /></svg>);
    case 'cake':
      return (<svg {...p}><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M12 11V7M12 4v1" /></svg>);
    case 'pack':
      return (<svg {...p}><circle cx="8" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.5" /><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M14 20c0-2 1.5-3.5 3.5-3.5S21 18 21 20" /></svg>);
    default:
      return (<svg {...p}><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6.1L12 16.8 6.5 19.7l1.2-6.1L3.2 9.4l6.1-.8z" /></svg>);
  }
}
