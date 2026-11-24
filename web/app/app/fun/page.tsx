'use client';
// web/app/app/fun/page.tsx
// "Just for fun" — the hub for the shareable toy cards built entirely from a
// dog's own profile: the Wanted Poster and the Adventure Passport. Both are
// N=1 share-objects (no other users required) and honest by construction — the
// Wanted charges are real profile traits played for laughs, the passport count
// is the owner's own self-logged checklist. Same cards as the iPhone Playroom.
//
// Mirrors the auth/profile-load scaffolding of the other /app/* pages; the nav
// shell comes from app/app/layout.tsx (AppLayoutShell).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../lib/auth';
import type { User, SavedDogProfile } from '../../../lib/auth';
import { trackEvent } from '../../../lib/analytics';
import WantedPosterWeb from '../../../components/WantedPosterWeb';
import AdventurePassportWeb from '../../../components/AdventurePassportWeb';
import RoastSection from '../../../components/RoastSection';
import HumanReviewSection from '../../../components/HumanReviewSection';
import ApologySection from '../../../components/ApologySection';
import TextsSection from '../../../components/TextsSection';
import DogQuizSection from '../../../components/DogQuizSection';
import PlaqueCard from '../../../components/PlaqueCard';
import SignInGate from '../../../components/SignInGate';
import DiptychSection, { DIPTYCH_MIN_PHOTOS } from '../../../components/DiptychSection';
import LetterSection from '../../../components/LetterSection';
import ZoomieCard from '../../../components/playroom/ZoomieCard';
import TreatRow from '../../../components/playroom/TreatRow';
import ToyBox from '../../../components/playroom/ToyBox';
import { usePlayroomGlimpses } from '../../../lib/playroomGlimpses';
import { pickLetterMilestone } from '../../../lib/letter';
import { getHeroPhoto, getRenderablePhotos, resolveHeroIndex } from '../../../lib/photos';

export default function FunPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [savedProfile, setSavedProfile] = useState<SavedDogProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [panel, setPanel] = useState<'letter' | 'wanted' | 'passport' | 'dogday' | null>(null);
  const [treat, setTreat] = useState<string | null>(null);
  const g = usePlayroomGlimpses(authUser?.uid, savedProfile);

  // ── Auth observer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Load the dog profile once the user is known ─────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    setProfileLoading(true);
    getUserDogProfile(authUser.uid)
      .then((p) => { if (active) setSavedProfile(p); })
      .catch(() => { if (active) setSavedProfile(null); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [authUser]);

  useEffect(() => { trackEvent('fun_hub_open', {}); }, []);

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  // ── Not signed in ───────────────────────────────────────────────────────────
  if (!authUser) {
    return (
      <SignInGate emoji="🤠" title="Sign in to make your dog&apos;s fun cards" />
    );
  }

  const name = savedProfile?.name?.trim() || 'your dog';
  const photo = savedProfile ? getHeroPhoto(savedProfile.photos, resolveHeroIndex(savedProfile)) : null;
  // eslint-disable-next-line @next/next/no-img-element
  const thumb = photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : undefined;
  const togglePanel = (key: NonNullable<typeof panel>) => () => {
    trackEvent('playroom_card_open', { feature: key });
    setPanel((cur) => (cur === key ? null : key));
  };
  const track = (feature: string) => () => trackEvent('playroom_card_open', { feature });
  const toggleTreat = (key: string) => () => {
    trackEvent('playroom_card_open', { feature: key });
    setTreat((cur) => (cur === key ? null : key));
  };
  const streakLine =
    g.streak.current > 0
      ? `${g.streak.current}-day streak${g.streak.best > g.streak.current ? ` · best ${g.streak.best}` : ''}`
      : g.streak.yesterdaySolved === false
        ? 'Yesterday got away from you. Start a new streak today.'
        : 'Guess the dog in six tries';
  const stamp = g.stampTotal > 0 ? `${g.stamped} of ${g.stampTotal} stamped` : 'A bucket list of real-world quests';
  const photoCount = savedProfile ? getRenderablePhotos(savedProfile.photos).length : 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-sky/95 backdrop-blur px-5 h-14 flex items-center">
        <h1 className="font-display text-[26px] leading-none text-brown">Playroom</h1>
      </header>

      <div className="mx-auto max-w-2xl space-y-5 p-4 lg:px-8 lg:py-8">
        {profileLoading && !savedProfile && (
          <div className="flex items-center justify-center py-16">
            <span className="text-3xl animate-spin">🐾</span>
          </div>
        )}

        {/* No dog yet — send them to build one first. */}
        {!profileLoading && !savedProfile && (
          <div className="rounded-2xl border-2 border-brown bg-cream p-6 text-center">
            <span className="text-5xl">🐶</span>
            <p className="mt-3 font-display text-xl text-brown">Add your dog first</p>
            <p className="mt-1 text-sm text-brown-mid leading-relaxed">
              The Playroom is built from your dog&apos;s profile. Set one up and come back.
            </p>
            <Link href="/app/profile" className="btn-primary inline-block mt-4 px-6 py-2.5">Go to profile</Link>
          </div>
        )}

        {savedProfile && (
          <>
            {/* Today's Barkle, alone at the top */}
            <section className="rounded-[1.5rem] border-2 border-brown bg-paper p-4 shadow-[0_6px_0_rgba(42,31,74,0.14)]">
              <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-rose">Today’s Barkle</p>
              <h2 className="mt-1 font-display text-2xl leading-tight text-brown">{streakLine}</h2>
              <Link href="/barkle" onClick={() => trackEvent('fun_hub_click', { source: 'playroom', target: 'barkle' })} className="btn-primary mt-3 block text-center">
                Play today’s Barkle
              </Link>
            </section>

            <ToyBox title="Zoomies" emoji="🎾" tint="bg-gold-light" layout="grid">
              <ZoomieCard
                label="Snoot Boop"
                glyph="🐽"
                glimpse={g.boops > 0 ? `${g.boops} boops${g.nextStickerAt ? ` · next sticker at ${g.nextStickerAt}` : ''}` : `Boop ${name}'s snoot to earn stickers`}
                href="/app/fun/snoot"
                onClick={track('snoot')}
              />
              <ZoomieCard
                label="Sticker Studio"
                glyph="🎨"
                glimpse={g.stickers > 0 ? `${g.stickers} sticker${g.stickers === 1 ? '' : 's'} earned` : 'Earn stickers by booping, then stick them on photos'}
                href="/app/fun/sticker-studio"
                onClick={track('sticker-studio')}
              />
              <ZoomieCard label="Wanted Poster" glyph="🤠" thumb={thumb} glimpse={`Make ${name} a wanted poster`} active={panel === 'wanted'} onClick={togglePanel('wanted')} />
              <ZoomieCard label="Trading card" glyph="🃏" thumb={thumb} glimpse={`Share ${name}’s card and public page`} href="/app/profile?share=1" onClick={track('card')} />
              <ZoomieCard label="Adventure Passport" glyph="🗺️" glimpse={stamp} active={panel === 'passport'} onClick={togglePanel('passport')} />
              <ZoomieCard label="Excuse Note" glyph="📝" glimpse="A “my dog ate it” note, made to share" href="/excuse" onClick={track('excuse')} />
              <ZoomieCard label={`A letter from ${name}`} glyph="✉️" glimpse={g.letterLine} active={panel === 'letter'} onClick={togglePanel('letter')} />
              {photoCount >= DIPTYCH_MIN_PHOTOS && (
                <ZoomieCard label="National Dog Day" glyph="🖼️" glimpse="Then and now, side by side" active={panel === 'dogday'} onClick={togglePanel('dogday')} />
              )}
            </ToyBox>

            {panel === 'wanted' && (
              <div id="wanted" className="scroll-mt-20"><WantedPosterWeb savedProfile={savedProfile} dogId={authUser.uid} /></div>
            )}
            {panel === 'passport' && (
              <div id="passport" className="scroll-mt-20"><AdventurePassportWeb savedProfile={savedProfile} dogId={authUser.uid} /></div>
            )}
            {panel === 'letter' &&
              (pickLetterMilestone(savedProfile) ? (
                <LetterSection savedProfile={savedProfile} userId={authUser.uid} />
              ) : (
                <p className="rounded-2xl border-2 border-brown bg-paper p-4 text-sm font-bold text-brown">
                  A letter from {name} arrives on their Gotcha Day or birthday. Add those dates in Profile, under About, and it will be ready the week they come around.
                </p>
              ))}
            {panel === 'dogday' && <DiptychSection savedProfile={savedProfile} />}

            <ToyBox title="Treat Lab" emoji="🦴" tint="bg-kraft" layout="stack">
              <TreatRow title={`Roast ${name}`} glimpse="A kind-hearted roast, built from their real profile" open={treat === 'roast'} onToggle={toggleTreat('roast')}>
                <RoastSection savedProfile={savedProfile} />
              </TreatRow>
              <TreatRow title={`Texts from ${name}`} glimpse="A thread of texts to you, in their voice" open={treat === 'texts'} onToggle={toggleTreat('texts')}>
                <TextsSection savedProfile={savedProfile} />
              </TreatRow>
              <TreatRow title="Notes-App Apology" glimpse={`The apology ${name} would type, if they could`} open={treat === 'apology'} onToggle={toggleTreat('apology')}>
                <ApologySection savedProfile={savedProfile} />
              </TreatRow>
              <TreatRow title="My Human Review" glimpse={`${name} reviews you`} open={treat === 'review'} onToggle={toggleTreat('review')}>
                <HumanReviewSection savedProfile={savedProfile} userId={authUser.uid} />
              </TreatRow>
              <TreatRow title="Dog quiz" glimpse="Pass the phone: how well do friends know them?" open={treat === 'quiz'} onToggle={toggleTreat('quiz')}>
                <DogQuizSection savedProfile={savedProfile} />
              </TreatRow>
              <TreatRow title="Employee of the Month" glimpse="A plaque for the office dog" open={treat === 'plaque'} onToggle={toggleTreat('plaque')}>
                <PlaqueCard savedProfile={savedProfile} />
              </TreatRow>
            </ToyBox>
          </>
        )}
      </div>
    </div>
  );
}
