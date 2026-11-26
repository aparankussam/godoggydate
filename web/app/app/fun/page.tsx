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
import { useRouter } from 'next/navigation';
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
import LifeStageCard from '../../../components/LifeStageCard';
import SignInGate from '../../../components/SignInGate';
import DiptychSection, { DIPTYCH_MIN_PHOTOS } from '../../../components/DiptychSection';
import LetterSection from '../../../components/LetterSection';
import ZoomieCard from '../../../components/playroom/ZoomieCard';
import ToyBox from '../../../components/playroom/ToyBox';
import { usePlayroomGlimpses } from '../../../lib/playroomGlimpses';
import { pickLetterMilestone } from '../../../lib/letter';
import { getHeroPhoto, getRenderablePhotos, resolveHeroIndex } from '../../../lib/photos';
import { Icon } from '../../../components/icons';
import TodayCard from '../../../components/playroom/TodayCard';
import { useCharms } from '../../../lib/charms';
import { CHARM_LIST, pickOfDay, type CharmInfo } from '../../../../shared/charms';

// Charms whose toy is its own page; the rest open in place on this one.
const CHARM_PAGES: Record<string, string> = {
  barkle: '/barkle',
  snoot: '/app/fun/snoot',
  'sticker-studio': '/app/fun/sticker-studio',
  card: '/app/profile?share=1',
  excuse: '/excuse',
};

export default function FunPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [savedProfile, setSavedProfile] = useState<SavedDogProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();
  const { earned, earn } = useCharms(authUser?.uid);
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

  // An opened card renders below its box, often under the bottom nav: bring it into view, as the iPhone Playroom does.
  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => document.getElementById('playroom-open')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [open]);

  // ── Auth loading ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Icon name="paw" size={40} className="animate-spin text-brown" />
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
  // The Adventure Passport's panel is 'passport'; its charm is 'adventures'.
  const toggle = (key: string) => () => {
    trackEvent('playroom_card_open', { feature: key });
    earn(key === 'passport' ? 'adventures' : key);
    setOpen((cur) => (cur === key ? null : key));
  };
  const track = (feature: string) => () => {
    trackEvent('playroom_card_open', { feature });
    earn(feature);
  };
  const pickCharm = (charm: CharmInfo) => {
    trackEvent('playroom_card_open', { feature: charm.id, via: 'today' });
    earn(charm.id);
    const page = CHARM_PAGES[charm.id];
    if (page) router.push(page);
    else setOpen(charm.id === 'adventures' ? 'passport' : charm.id);
  };
  const streakLine =
    g.streak.current > 0
      ? `${g.streak.current}-day streak${g.streak.best > g.streak.current ? ` · best ${g.streak.best}` : ''}`
      : g.streak.yesterdaySolved === false
        ? 'Yesterday got away from you. Start a new streak today.'
        : 'Guess the dog in six tries';
  const stamp = g.stampTotal > 0 ? `${g.stamped} of ${g.stampTotal} stamped` : 'A bucket list of real-world quests';
  const photoCount = savedProfile ? getRenderablePhotos(savedProfile.photos).length : 0;
  const openPanel = (node: React.ReactNode) => node && <div id="playroom-open" className="scroll-mt-20">{node}</div>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-sky/95 backdrop-blur px-5 h-14 flex items-center">
        <h1 className="font-display text-[26px] leading-none text-brown">Playroom</h1>
      </header>

      <div className="mx-auto max-w-2xl space-y-5 p-4 lg:px-8 lg:py-8">
        {profileLoading && !savedProfile && (
          <div className="flex items-center justify-center py-16">
            <Icon name="paw" size={32} className="animate-spin text-brown" />
          </div>
        )}

        {/* No dog yet — send them to build one first. */}
        {!profileLoading && !savedProfile && (
          <div className="rounded-2xl border-2 border-brown bg-cream p-6 text-center">
            <span className="text-5xl">🐶</span>
            <p className="mt-3 font-display text-xl text-brown">Add your dog first</p>
            <p className="mt-1 text-sm text-brown-mid leading-relaxed">
              Set up your dog&apos;s Pupfile first. The Playroom is built from it.
            </p>
            <Link href="/app/profile" className="btn-primary inline-block mt-4 px-6 py-2.5">Go to Pupfile</Link>
          </div>
        )}

        {savedProfile && (
          <>
            <TodayCard
              dogName={name}
              streakLine={streakLine}
              onPlayBarkle={() => { trackEvent('fun_hub_click', { source: 'playroom', target: 'barkle' }); earn('barkle'); }}
              pick={pickOfDay(CHARM_LIST, earned, ['barkle'])}
              onTryPick={pickCharm}
              earned={earned}
            />

            {/* Zoomies: everything you play. Treat Lab: keepsakes you make and
                share. Adventures: real-world quests. One card open at a time,
                and it opens below its own box, same as the iPhone Playroom. */}
            <ToyBox title="Zoomies" icon="tennis-ball" tint="bg-gold-light" layout="grid">
              <ZoomieCard
                label="Snoot Boop"
                glyph="gesture-tap"
                glimpse={g.boops > 0 ? `${g.boops} boops${g.nextStickerAt ? ` · next sticker at ${g.nextStickerAt}` : ''}` : `Boop ${name}'s snoot to earn stickers`}
                isNew={!earned.includes('snoot')}
                href="/app/fun/snoot"
                onClick={track('snoot')}
              />
              <ZoomieCard label={`Roast ${name}`} glyph="fire" glimpse="A kind-hearted roast from their real profile" active={open === 'roast'} isNew={!earned.includes('roast')} onClick={toggle('roast')} />
              <ZoomieCard label={`Texts from ${name}`} glyph="message-text" glimpse="A thread of texts to you, in their voice" active={open === 'texts'} isNew={!earned.includes('texts')} onClick={toggle('texts')} />
              <ZoomieCard label="Dog quiz" glyph="help-circle" glimpse="Pass the phone: how well do friends know them?" active={open === 'quiz'} isNew={!earned.includes('quiz')} onClick={toggle('quiz')} />
              <ZoomieCard label="Notes-App Apology" glyph="note-text" glimpse={`The apology ${name} would type`} active={open === 'apology'} isNew={!earned.includes('apology')} onClick={toggle('apology')} />
              <ZoomieCard label="My Human Review" glyph="star" glimpse={`${name} reviews you`} active={open === 'review'} isNew={!earned.includes('review')} onClick={toggle('review')} />
              <ZoomieCard label="Excuse Note" glyph="note-edit" glimpse="A “my dog ate it” note, made to share" isNew={!earned.includes('excuse')} href="/excuse" onClick={track('excuse')} />
            </ToyBox>

            {openPanel(
              (open === 'roast' && <RoastSection savedProfile={savedProfile} />) ||
              (open === 'texts' && <TextsSection savedProfile={savedProfile} />) ||
              (open === 'apology' && <ApologySection savedProfile={savedProfile} />) ||
              (open === 'review' && <HumanReviewSection savedProfile={savedProfile} userId={authUser.uid} />) ||
              (open === 'quiz' && <DogQuizSection savedProfile={savedProfile} />),
            )}

            <ToyBox title="Treat Lab" icon="bone" tint="bg-kraft" layout="grid">
              <ZoomieCard label="Wanted Poster" glyph="card-account-details-star" thumb={thumb} glimpse={`Make ${name} a wanted poster`} active={open === 'wanted'} isNew={!earned.includes('wanted')} onClick={toggle('wanted')} />
              <ZoomieCard label="Trading card" glyph="card-account-details-star" thumb={thumb} glimpse={`Share ${name}’s card and public page`} isNew={!earned.includes('card')} href="/app/profile?share=1" onClick={track('card')} />
              <ZoomieCard label="Employee of the Month" glyph="medal" glimpse="A plaque for the office dog" active={open === 'plaque'} isNew={!earned.includes('plaque')} onClick={toggle('plaque')} />
              <ZoomieCard label="Life stage" glyph="cake-variant" glimpse={`Where ${name} is in life, and what this stage needs`} active={open === 'lifestage'} isNew={!earned.includes('lifestage')} onClick={toggle('lifestage')} />
              <ZoomieCard
                label="Sticker Studio"
                glyph="sticker-emoji"
                glimpse={g.stickers > 0 ? `${g.stickers} sticker${g.stickers === 1 ? '' : 's'} earned` : 'Earn stickers by booping, then stick them on photos'}
                isNew={!earned.includes('sticker-studio')}
                href="/app/fun/sticker-studio"
                onClick={track('sticker-studio')}
              />
              <ZoomieCard label={`A letter from ${name}`} glyph="email" glimpse={g.letterLine} active={open === 'letter'} isNew={!earned.includes('letter')} onClick={toggle('letter')} />
              {photoCount >= DIPTYCH_MIN_PHOTOS && (
                <ZoomieCard label="National Dog Day" glyph="image-multiple" glimpse="Then and now, side by side" active={open === 'dogday'} onClick={toggle('dogday')} />
              )}
            </ToyBox>

            {openPanel(
              (open === 'wanted' && <WantedPosterWeb savedProfile={savedProfile} dogId={authUser.uid} />) ||
              (open === 'plaque' && <PlaqueCard savedProfile={savedProfile} />) ||
              (open === 'lifestage' && <LifeStageCard savedProfile={savedProfile} onEditProfile={() => router.push('/app/profile')} />) ||
              (open === 'letter' &&
                (pickLetterMilestone(savedProfile) ? (
                  <LetterSection savedProfile={savedProfile} userId={authUser.uid} />
                ) : (
                  <p className="rounded-2xl border-2 border-brown bg-paper p-4 text-sm font-bold text-brown">
                    A letter from {name} arrives on their Gotcha Day or birthday. Add those dates in Pupfile, under About, and it will be ready the week they come around.
                  </p>
                ))) ||
              (open === 'dogday' && <DiptychSection savedProfile={savedProfile} />),
            )}

            <ToyBox title="Adventures" icon="map" tint="bg-note" layout="grid">
              <ZoomieCard label="Adventure Passport" glyph="map-marker-path" glimpse={stamp} active={open === 'passport'} isNew={!earned.includes('adventures')} onClick={toggle('passport')} />
            </ToyBox>
            {openPanel(open === 'passport' && <AdventurePassportWeb savedProfile={savedProfile} dogId={authUser.uid} />)}
          </>
        )}
      </div>
    </div>
  );
}
