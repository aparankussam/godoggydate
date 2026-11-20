'use client';
// web/app/app/pack/[id]/page.tsx
// One Pack Day, inside the app: details, who's going, RSVP / leave / cancel,
// add to calendar, and share. Joining and leaving go through the rsvpPackDay
// callable, which enforces capacity and blocks atomically.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import {
  cancelPackDay,
  getPackDay,
  joinPackDay,
  leavePackDay,
  packDayErrorMessage,
  packDayUrl,
} from '../../../../lib/packDay';
import { setPendingPackDay } from '../../../../lib/packDayPending';
import { getBlockedUserIds } from '../../../../lib/blocks';
import { getHeroPhoto, resolveHeroIndex } from '../../../../lib/photos';
import { trackEvent } from '../../../../lib/analytics';
import ReportProfileMenu from '../../../../components/ReportProfileMenu';
import {
  PACK_DAY_FORMATS,
  PACK_DAY_RULES,
  buildPackDayIcs,
  formatPackDayWhen,
  isPast,
  mapsSearchUrl,
  spotsLeft,
} from '../../../../../shared/packDay';
import type { PackDay } from '../../../../../shared/packDay';

interface Attendee {
  uid: string;
  name: string;
  photo: string | null;
  founding: boolean;
}

async function loadAttendees(event: PackDay, foundingUids: string[]): Promise<Attendee[]> {
  const { db } = getFirebase();
  const rows = await Promise.all(
    event.attendeeUids.map(async (uid): Promise<Attendee | null> => {
      try {
        const snap = await getDoc(doc(db, 'dogs', uid));
        if (!snap.exists()) return null;
        const dog = snap.data() as SavedDogProfile;
        return {
          uid,
          name: dog.name?.trim() || 'A dog',
          photo: getHeroPhoto(dog.photos, resolveHeroIndex(dog)),
          founding: foundingUids.includes(uid),
        };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((row): row is Attendee => row !== null);
}

export default function PackDayDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const eventId = params?.id ?? '';
  const justCreated = search?.get('new') === '1';

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  const reload = useCallback(async () => {
    try {
      const result = await getPackDay(eventId);
      if (!result) {
        setLoadState('missing');
        return;
      }
      setEvent(result.event);
      setAttendees(await loadAttendees(result.event, result.foundingUids));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [eventId]);

  useEffect(() => {
    if (!authUser || !eventId) return;
    trackEvent('packday_view', { eventId });
    void reload();
    getUserDogProfile(authUser.uid).then(setProfile).catch(() => setProfile(null));
    getBlockedUserIds(authUser.uid).then(setBlocked).catch(() => undefined);
  }, [authUser, eventId, reload]);

  async function run(action: () => Promise<void>, success: string, failure: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      await reload();
    } catch (err) {
      setError(packDayErrorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  function handleJoin() {
    trackEvent('packday_rsvp', { eventId });
    void run(() => joinPackDay(eventId), "You're in! We'll remind you before it starts.", "We couldn't save your spot. Try again.");
  }

  function handleLeave() {
    void run(() => leavePackDay(eventId), "You've left this Pack Day.", "We couldn't update your RSVP. Try again.");
  }

  function handleCancel() {
    if (!window.confirm('Cancel this Pack Day? Everyone who signed up will be notified.')) return;
    void run(() => cancelPackDay(eventId), 'Pack Day cancelled.', "We couldn't cancel it. Try again.");
  }

  async function handleShare() {
    if (!event) return;
    const url = packDayUrl(event.id);
    const text = `${event.title}: ${formatPackDayWhen(event)} at ${event.placeName}. Bring your dog!`;
    trackEvent('packday_share', { eventId });
    setError(null);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: event.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage('Link copied. Send it to a neighbor!');
    } catch (err) {
      // A dismissed share sheet rejects; that's not an error worth showing.
      if (err instanceof Error && err.name === 'AbortError') return;
      // No share sheet and no clipboard (in-app browsers, insecure origins):
      // show the link so they can still copy it by hand.
      setMessage(null);
      setError(`We couldn't copy the link. Copy it from here: ${url}`);
    }
  }

  function handleCalendar() {
    if (!event) return;
    const ics = buildPackDayIcs(event, packDayUrl(event.id));
    if (!ics) return;
    trackEvent('packday_calendar', { eventId });
    const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = 'pack-day.ics';
    link.click();
    URL.revokeObjectURL(href);
  }

  if (authLoading || (authUser && loadState === 'loading')) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🌳</span>
        <p className="font-display text-2xl text-brown">Sign in to see this Pack Day</p>
        <p className="text-sm text-brown-mid">We&apos;ll bring you right back to it.</p>
        <Link
          href="/"
          onClick={() => setPendingPackDay(eventId)}
          className="btn-primary px-8 py-3"
        >
          Sign in or sign up
        </Link>
      </div>
    );
  }

  if (loadState === 'missing' || loadState === 'error' || !event) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🐕</span>
        <p className="font-display text-2xl text-brown">
          {loadState === 'error' ? "We couldn't load this Pack Day" : "This Pack Day isn't here anymore"}
        </p>
        <Link href="/app/pack" className="btn-primary px-8 py-3">See Pack Days</Link>
      </div>
    );
  }

  const uid = authUser.uid;
  const isHost = event.hostUid === uid;
  const going = event.attendeeUids.includes(uid);
  const cancelled = event.status === 'cancelled';
  const over = isPast(event, Date.now());
  const left = spotsLeft(event);
  const format = PACK_DAY_FORMATS[event.format];
  const hasDog = isProfileComplete(profile);
  const visibleAttendees = attendees.filter((a) => !blocked.has(a.uid));

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/app/pack" aria-label="Back to Pack Days" className="text-xl text-brown -m-2.5 p-2.5">←</Link>
          <span className="font-display text-xl text-brown truncate">Pack Day</span>
        </div>
        {/* eventId lets onReportCreated snapshot this event as evidence. */}
        {!isHost && <ReportProfileMenu targetUserId={event.hostUid} eventId={event.id} />}
      </header>

      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-5">
        {justCreated && isHost && (
          <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-brown">
            Your Pack Day is live. Share the link with neighbors. Six dogs makes a great one. 🎉
          </p>
        )}
        {cancelled && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">This Pack Day was cancelled.</p>
        )}
        {!cancelled && over && (
          <p className="rounded-xl bg-cream-dark px-4 py-3 text-sm font-semibold text-brown-mid">This Pack Day is over.</p>
        )}

        <article className="card overflow-hidden">
          <div className="bg-gradient-to-br from-primary/15 to-gold/15 px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              {event.official ? '⭐ Official · ' : ''}{format.emoji} {format.label}
            </p>
            <h1 className="mt-1 font-display text-2xl text-brown leading-tight break-words">{event.title}</h1>
          </div>
          <div className="px-5 py-4 space-y-3 text-sm">
            <p className="font-semibold text-brown">📅 {formatPackDayWhen(event)} · {event.durationMinutes} min</p>
            <p className="text-brown break-words">
              📍 <span className="font-semibold">{event.placeName}</span>, {event.city}
              <a
                href={mapsSearchUrl(event)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 px-1.5 py-3 text-primary font-semibold underline"
              >
                Map
              </a>
            </p>
            <p className="text-brown-mid">{format.blurb}</p>
            {event.note && <p className="text-brown break-words">&ldquo;{event.note}&rdquo;</p>}
            <p className="text-xs text-brown-light">
              Hosted by {event.hostDogName || 'a neighbor'}&apos;s human
            </p>
          </div>
        </article>

        {/* ── Who's going ───────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light">
            {event.attendeeUids.length} of {event.capacity} dogs going{left === 0 ? ' · Full' : ''}
          </h2>
          <ul className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
            {visibleAttendees.map((a) => (
              <li key={a.uid} className="card overflow-hidden text-center">
                {a.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.photo} alt={a.name} className="h-24 w-full object-cover" />
                ) : (
                  <div className="h-24 flex items-center justify-center text-4xl bg-cream-dark" aria-hidden="true">🐕</div>
                )}
                <p className="px-2 py-1.5 text-xs font-bold text-brown truncate">
                  {a.founding ? '⭐ ' : ''}{a.name}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {message && <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {!cancelled && !over && !going && (
          <section className="rounded-2xl border border-border bg-white px-5 py-4 space-y-3">
            {!hasDog ? (
              <>
                <p className="text-sm text-brown-mid">Add your dog&apos;s profile to save a spot.</p>
                <Link href="/app" onClick={() => setPendingPackDay(eventId)} className="btn-primary block text-center py-3">
                  Set up my dog
                </Link>
              </>
            ) : left === 0 ? (
              <p className="text-sm font-semibold text-brown-mid">This Pack Day is full.</p>
            ) : (
              <>
                <h2 className="text-sm font-bold text-brown">House rules</h2>
                <ul className="space-y-1.5 text-sm text-brown-mid list-disc pl-5">
                  {PACK_DAY_RULES.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
                <label className="flex items-start gap-2 py-2.5 text-sm text-brown cursor-pointer">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
                  <span>I&apos;ll follow these rules.</span>
                </label>
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={busy || !accepted}
                  className="btn-primary w-full py-3 disabled:opacity-60"
                >
                  {busy ? 'Saving…' : `I'm in, ${profile?.name?.trim() || 'my dog'} too 🐾`}
                </button>
                <p className="text-[11px] text-brown-light">
                  GoDoggyDate doesn&apos;t verify dogs or owners. Read the{' '}
                  <Link href="/playdate-safety" className="underline">first-meeting guide</Link>.
                </p>
              </>
            )}
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          {!cancelled && !over && (
            <>
              <button type="button" onClick={handleShare} className="btn-secondary px-5 py-2 text-sm">Share 🔗</button>
              {going && (
                <button type="button" onClick={handleCalendar} className="btn-secondary px-5 py-2 text-sm">
                  Add to calendar 📅
                </button>
              )}
            </>
          )}
          {going && !isHost && !over && !cancelled && (
            <button type="button" onClick={handleLeave} disabled={busy} className="btn-secondary px-5 py-2 text-sm disabled:opacity-60">
              Can&apos;t make it
            </button>
          )}
          {isHost && !cancelled && !over && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-full border border-red-200 bg-white px-5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Cancel Pack Day
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
