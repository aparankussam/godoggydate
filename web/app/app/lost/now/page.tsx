'use client';
// web/app/app/lost/now/page.tsx
// "My dog is lost", for someone in a panic. One question (where was the dog last
// seen), then one big button. Everything else comes from what the owner already
// saved: the lost-dog kit if they made one, otherwise the Pupfile photo and
// details, so an unfinished kit never blocks an alert. After sending, a short
// checklist of what to do next, since nobody remembers it in the moment.
// Reached from Neighbarkhood, the Pupfile header and the installed-app shortcut.
// Mirrors mobile/app/lost/now.tsx.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import { getHeroPhoto, resolveHeroIndex } from '../../../../lib/photos';
import { trackEvent } from '../../../../lib/analytics';
import { onReminders } from '../../../../lib/reminders';
import { LOST_LIMITS, createLostAlert, getLostKit, medicineNeeds, onMyActiveAlert, type LostAlert, type LostKit } from '../../../../lib/lostDog';
import { LOST_CHECKLIST } from '../../../../../shared/lostDog';
import { CONTENT_FILTER_MESSAGE, checkContent } from '../../../../../shared/contentFilter';
import type { Reminder } from '../../../../../shared/types';
import SignInGate from '../../../../components/SignInGate';

export default function LostNowPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null | undefined>(undefined);
  const [kit, setKit] = useState<LostKit>({});
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [active, setActive] = useState<LostAlert | null | undefined>(undefined);
  const [lastSeen, setLastSeen] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => { setAuthUser(user); setAuthLoading(false); });
  }, []);

  const uid = authUser?.uid;
  useEffect(() => {
    if (!uid) return;
    getUserDogProfile(uid).then(setProfile).catch(() => setProfile(null));
    getLostKit(uid).then(setKit).catch(() => {});
    const offReminders = onReminders(uid, setReminders);
    const offAlert = onMyActiveAlert(uid, setActive);
    return () => { offReminders(); offAlert(); };
  }, [uid]);

  // Already lost and not just sent from here: go straight to the open alert.
  useEffect(() => { if (active && !sent) router.replace('/app/lost'); }, [active, sent, router]);

  const medicines = useMemo(() => medicineNeeds(reminders), [reminders]);
  const dogName = profile?.name?.trim() || 'Your dog';
  const photo = kit.photoUrl || (profile ? getHeroPhoto(profile.photos, resolveHeroIndex(profile)) : null) || undefined;

  async function send() {
    if (!uid || sending) return;
    setError('');
    if (lastSeen.trim() && !checkContent(lastSeen).ok) { setError(CONTENT_FILTER_MESSAGE); return; }
    setSending(true);
    try {
      await createLostAlert(uid, {
        dogName,
        breed: profile?.breed,
        size: profile?.size,
        markings: kit.markings,
        photoUrl: photo,
        microchipped: !!kit.microchip?.trim(),
        medicines,
        lastSeen,
        city: profile?.city,
        state: profile?.state,
      });
      trackEvent('lost_alert_created', { from: 'panic', hadKit: !!(kit.photoUrl || kit.markings) });
      setSent(true);
    } catch {
      setError('Could not send the alert. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (authLoading) return <div className="py-24 text-center text-3xl">🐾</div>;
  if (!authUser) return <SignInGate emoji="🚨" title="Sign in to alert your neighbors" />;
  if (profile === null) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <p className="rounded-xl bg-cream-dark px-4 py-3 text-[15px] font-extrabold text-brown">
          Create your dog&apos;s profile first, so we have a photo to show neighbors. <Link href="/app/profile" className="underline">Open Pupfile</Link>
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-4 lg:py-8">
        <p role="status" className="rounded-xl border-2 border-emerald-700 bg-paper px-4 py-3 text-[15px] font-black text-brown">
          Neighbors near {profile?.city || 'you'} are being alerted about {dogName}.
        </p>
        <h1 className="font-display text-[28px] leading-none text-brown">What to do now</h1>
        <ol className="space-y-3">
          {LOST_CHECKLIST.map((step, i) => (
            <li key={step.title} className="card space-y-1 rounded-[1.2rem] px-4 py-3">
              <p className="text-[16px] font-black text-brown">{i + 1}. {step.title}</p>
              <p className="text-[14px] font-bold leading-snug text-brown-mid">{step.body}</p>
              {step.title.startsWith('Call your microchip') && kit.microchip && (
                <p className="text-[14px] font-black text-brown">Chip number: {kit.microchip}</p>
              )}
            </li>
          ))}
        </ol>
        <Link href="/app/lost" className="flex min-h-[60px] items-center justify-center rounded-full border-2 border-brown bg-red-600 px-4 font-display text-[22px] text-white">
          Open the alert: poster and sightings
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 lg:py-8">
      <Link href="/app/pack?view=feed" className="text-[15px] font-black text-brown underline">← Back</Link>
      <h1 className="font-display text-[32px] leading-none text-brown">{dogName} is lost</h1>
      <p className="text-[16px] font-bold leading-snug text-brown">Take a breath. We&apos;ll alert your neighbors with {dogName}&apos;s photo and details.</p>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={`Photo of ${dogName}`} className="h-56 w-full rounded-[1.1rem] border-2 border-brown object-cover" />
      )}
      <label className="block text-[18px] font-black text-brown">
        Where did you last see {dogName}?
        <input
          value={lastSeen}
          onChange={(e) => setLastSeen(e.target.value)}
          maxLength={LOST_LIMITS.lastSeen}
          placeholder="e.g. Beaver Park, near the creek"
          className="mt-1.5 w-full rounded-xl border-2 border-brown bg-white px-4 py-3.5 text-[17px] text-brown"
        />
      </label>
      {error && <p role="alert" className="text-[15px] font-black text-rose">{error}</p>}
      <button
        type="button"
        onClick={send}
        disabled={sending || profile === undefined}
        className="flex min-h-[60px] w-full items-center justify-center rounded-full border-2 border-brown bg-red-600 px-4 font-display text-[24px] text-white disabled:opacity-60"
      >
        {sending ? 'Sending…' : 'Alert my neighbors'}
      </button>
      <p className="text-center text-[13px] font-semibold leading-snug text-brown">
        Makes a public poster with a link. Your phone number and address are never shown.
        {!(kit.photoUrl || kit.markings) ? ' You can add markings and a newer photo later.' : ''}
      </p>
    </div>
  );
}
