'use client';
// web/app/app/lost/page.tsx
// Lost dog, owner side (mirror of mobile/app/lost/index.tsx): the private kit, the
// one-tap "My dog is lost", and while an alert is open the poster with its QR, the
// sightings and "Found". FREE for everyone. The microchip number and vet phone stay
// in the private kit; only a "Needs <label> daily" line from the Daily medicine
// reminders goes on the public poster.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFirebase } from '../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../lib/auth';
import type { User, SavedDogProfile } from '../../../lib/auth';
import { getHeroPhoto, resolveHeroIndex } from '../../../lib/photos';
import { uploadDogPhoto } from '../../../lib/storage';
import { trackEvent } from '../../../lib/analytics';
import { onReminders } from '../../../lib/reminders';
import {
  LOST_LIMITS,
  getLostKit,
  lostAlertUrl,
  lostFacts,
  markDogFound,
  medicineNeeds,
  onMyActiveAlert,
  onSightings,
  saveLostKit,
  type LostAlert,
  type Sighting,
} from '../../../lib/lostDog';
import { timeAgo } from '../../../../shared/lostDog';
import { CONTENT_FILTER_MESSAGE, checkContent } from '../../../../shared/contentFilter';
import type { Reminder } from '../../../../shared/types';
import QrSvg from '../../../components/QrSvg';
import SignInGate from '../../../components/SignInGate';
import { FlyerSheet, PawIcon } from '../../../components/PackDayFlyer';

const field = 'w-full rounded-xl border-2 border-brown bg-white px-3 py-2.5 text-[16px] text-brown';

export default function LostDogPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [markings, setMarkings] = useState('');
  const [microchip, setMicrochip] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [active, setActive] = useState<LostAlert | null | undefined>(undefined);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [busy, setBusy] = useState<'' | 'kit' | 'lost' | 'found' | 'photo'>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  const uid = authUser?.uid;

  useEffect(() => {
    if (!uid) return;
    getUserDogProfile(uid).then(setProfile).catch(() => {});
    getLostKit(uid).then((kit) => {
      setPhotoUrl(kit.photoUrl || undefined);
      setMarkings(kit.markings ?? '');
      setMicrochip(kit.microchip ?? '');
      setVetPhone(kit.vetPhone ?? '');
    }).catch(() => {});
    const offReminders = onReminders(uid, setReminders);
    const offAlert = onMyActiveAlert(uid, setActive);
    return () => { offReminders(); offAlert(); };
  }, [uid]);

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) { setSightings([]); return; }
    return onSightings(activeId, setSightings);
  }, [activeId]);

  const medicines = useMemo(() => medicineNeeds(reminders), [reminders]);
  const dogName = profile?.name?.trim() || 'Your dog';
  const heroPhoto = getHeroPhoto(profile?.photos, resolveHeroIndex(profile)) ?? undefined;
  const kitPhoto = photoUrl || heroPhoto;

  async function pickPhoto(file: File | undefined) {
    if (!uid || !file) return;
    setBusy('photo');
    setError('');
    try {
      setPhotoUrl(await uploadDogPhoto(uid, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the photo. Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function saveKit(quiet = false): Promise<boolean> {
    if (!uid) return false;
    setError('');
    for (const t of [markings]) {
      if (t.trim() && !checkContent(t).ok) { setError(CONTENT_FILTER_MESSAGE); return false; }
    }
    setBusy('kit');
    try {
      await saveLostKit(uid, { photoUrl: kitPhoto, markings, microchip, vetPhone });
      if (!quiet) { setNote('Saved. It stays private until you need it.'); trackEvent('lost_kit_saved', {}); }
      return true;
    } catch {
      setError('Could not save. Please try again.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function found() {
    if (!uid || !active || busy) return;
    if (!window.confirm(`Is ${active.dogName} home?\n\nThis closes the alert.`)) return;
    setBusy('found');
    setError('');
    try {
      await markDogFound(uid, active.id);
      trackEvent('lost_alert_found', { sightings: sightings.length });
    } catch {
      setError('Could not close the alert. Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function copyLink() {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(lostAlertUrl(active.id));
      setNote('Link copied. Post it where your neighbors will see it.');
      trackEvent('lost_poster_shared', {});
    } catch {
      setNote(lostAlertUrl(active.id));
    }
  }

  if (authLoading || (authUser && active === undefined)) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={36} /></span>
      </div>
    );
  }
  if (!authUser) return <SignInGate emoji="🐾" title="Sign in to set up your lost-dog kit" />;
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <p className="card px-5 py-4 text-[16px] font-extrabold text-brown">
          Create your dog&apos;s Pupfile first, then set up their lost-dog kit. <Link href="/app/profile" className="underline">Go to Pupfile</Link>
        </p>
      </div>
    );
  }

  // ── An alert is open ────────────────────────────────────────────────────────
  if (active) {
    const url = lostAlertUrl(active.id);
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12 pt-6">
        <p role="status" className="print:hidden rounded-xl bg-cream-dark px-4 py-3 text-[16px] font-black text-rose">
          People near {active.city || 'you'} have been alerted. Share the poster to reach more neighbors.
        </p>

        <FlyerSheet>
          <p className="text-center font-display text-[56px] leading-none tracking-wide text-rose">LOST</p>
          <p className="text-center text-[17px] font-black text-brown">HAVE YOU SEEN THIS DOG?</p>
          {active.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.photoUrl} alt={`${active.dogName}, the missing dog`} className="mx-auto mt-3 aspect-square w-full max-w-[280px] rounded-2xl border-[3px] border-brown object-cover" />
          )}
          <h1 className="mt-3 text-center font-display text-[36px] leading-tight text-brown">{active.dogName}</h1>
          <ul className="mt-2 space-y-1 text-[16px] font-extrabold text-brown">
            {lostFacts(active).map((line) => <li key={line} className="flex gap-2"><span aria-hidden="true">🐾</span>{line}</li>)}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <QrSvg text={url} size={116} label="QR code that opens the lost dog page" />
            <p className="text-[14px] font-extrabold text-brown">Scan or visit<br /><span className="break-all">{url.replace(/^https?:\/\//, '')}</span></p>
          </div>
        </FlyerSheet>

        <div className="print:hidden flex gap-3">
          <button type="button" onClick={copyLink} className="btn-primary min-h-[48px] flex-1 text-[17px]">Copy the link</button>
          <button type="button" onClick={() => window.print()} className="btn-secondary min-h-[48px] flex-1 text-[17px]">Print the poster</button>
        </div>
        {note && <p role="status" className="print:hidden text-[14px] font-extrabold text-brown-mid">{note}</p>}
        {error && <p role="alert" className="print:hidden text-[15px] font-black text-rose">{error}</p>}

        <section className="print:hidden space-y-3">
          <h2 className="font-display text-[26px] text-brown">Sightings ({sightings.length})</h2>
          {sightings.length === 0 && <p className="text-[14px] font-extrabold text-brown-mid">No reports yet. They appear here as soon as someone sends one.</p>}
          {sightings.map((s) => (
            <div key={s.id} className="card space-y-1.5 px-4 py-3 text-[15px] font-extrabold text-brown">
              <p className="text-[13px] font-black text-rose">{timeAgo(s.createdAtMs, Date.now())}{s.finderName ? ` · ${s.finderName}` : ''}</p>
              <p>{s.message}</p>
              {s.contact && <p>Contact: {s.contact}</p>}
              {s.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.photoUrl} alt="Photo from the person who saw your dog" className="h-44 w-full rounded-xl object-cover" />
              )}
              {typeof s.lat === 'number' && typeof s.lng === 'number' && (
                <a className="font-black underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`}>
                  Open the exact spot on a map
                </a>
              )}
            </div>
          ))}
        </section>

        <button type="button" onClick={found} disabled={busy === 'found'} className="print:hidden btn-secondary min-h-[52px] text-[19px] disabled:opacity-60">
          {busy === 'found' ? 'Closing…' : `${active.dogName} is found 🎉`}
        </button>
      </div>
    );
  }

  // ── No alert: the kit, and the one big button ──────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-12 pt-6">
      <h1 className="font-display text-[34px] leading-tight text-brown">Lost dog kit</h1>
      <p className="text-[16px] font-extrabold text-brown">
        Free for everyone. Fill this in now, while all is calm. If {dogName} ever goes missing, one tap alerts your Pack and
        neighbors and makes a poster with a link anyone can use, no app needed.
      </p>

      <div className="card space-y-3 px-4 py-4">
        <h2 className="font-display text-[22px] text-brown">Recent photo</h2>
        <div className="flex items-center gap-3">
          {kitPhoto
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={kitPhoto} alt={`${dogName}'s photo for the poster`} className="h-20 w-20 rounded-xl border-2 border-brown object-cover" />
            : <div className="h-20 w-20 rounded-xl border-2 border-brown bg-cream-dark" aria-hidden="true" />}
          <label className="btn-secondary min-h-[44px] flex-1 cursor-pointer text-center text-[16px]">
            {busy === 'photo' ? 'Adding…' : 'Change photo'}
            <input type="file" accept="image/*" className="sr-only" disabled={busy === 'photo'} onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>

        <label className="block text-[15px] font-black text-brown">
          Markings
          <input className={`${field} mt-1`} value={markings} onChange={(e) => setMarkings(e.target.value)} maxLength={LOST_LIMITS.markings} placeholder="White chest, one brown ear, collar with a blue tag" />
        </label>
        <label className="block text-[15px] font-black text-brown">
          Microchip number <span className="font-bold text-brown-mid">(private)</span>
          <input className={`${field} mt-1`} value={microchip} onChange={(e) => setMicrochip(e.target.value)} maxLength={LOST_LIMITS.microchip} inputMode="numeric" placeholder="Only you see this" />
        </label>
        <label className="block text-[15px] font-black text-brown">
          Vet phone <span className="font-bold text-brown-mid">(private)</span>
          <input className={`${field} mt-1`} value={vetPhone} onChange={(e) => setVetPhone(e.target.value)} maxLength={LOST_LIMITS.vetPhone} inputMode="tel" placeholder="Only you see this" />
        </label>

        <div>
          <p className="text-[15px] font-black text-brown">Medicine</p>
          {medicines.length > 0
            ? medicines.map((m) => <p key={m} className="text-[15px] font-extrabold text-brown">• {m}</p>)
            : <p className="text-[13px] font-extrabold text-brown-mid">None. Add a Daily medicine reminder on your Pupfile, under Dates, and it appears here and on the poster.</p>}
        </div>

        <button type="button" onClick={() => saveKit()} disabled={busy === 'kit'} className="btn-secondary min-h-[48px] w-full text-[17px] disabled:opacity-60">
          {busy === 'kit' ? 'Saving…' : 'Save the kit'}
        </button>
        {note && <p role="status" className="text-[13px] font-extrabold text-brown-mid">{note}</p>}
      </div>

      {!profile.city && (
        <p className="rounded-xl bg-cream-dark px-4 py-3 text-[14px] font-extrabold text-brown">
          Add your city to {dogName}&apos;s profile so neighbors nearby can be alerted. <Link href="/app/profile" className="underline">Open Pupfile</Link>
        </p>
      )}
      {error && <p role="alert" className="text-[15px] font-black text-rose">{error}</p>}

      {/* One emergency flow: save what's here, then the one-question alert page. */}
      <button
        type="button"
        onClick={async () => { if (await saveKit(true)) router.push('/app/lost/now'); }}
        className="btn-primary min-h-[56px] w-full text-[22px]"
      >
        My dog is lost
      </button>
      <Link href="/app" className="text-center text-[15px] font-extrabold text-brown underline">Not now</Link>
    </div>
  );
}
