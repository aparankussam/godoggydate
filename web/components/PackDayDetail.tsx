'use client';
// web/components/PackDayDetail.tsx
// One Pack Day, inside the app: details, who's going (tap a dog for its card),
// a heads-up when declared limits clash, RSVP / leave / cancel, add to calendar,
// and share. Joining and leaving go through the rsvpPackDay callable, which
// enforces capacity and blocks atomically.
//
// Signed out, the event is still shown (title, place, time, how many) from the
// public summary the server page passes in: the same facts as the shareable
// flyer at /pack/[id], never who is going. Only the sign-in step is gated.

import { discoverFromPackDay } from '../lib/dogtypeDiscovery';
import { computeDogtype } from '../../shared/dogtype';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getFirebase } from '../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../lib/auth';
import type { User, SavedDogProfile } from '../lib/auth';
import {
  cancelPackDay,
  checkInToPackDay,
  getPackDay,
  listCheckins,
  joinPackDay,
  leavePackDay,
  packDayErrorMessage,
  packDayUrl,
} from '../lib/packDay';
import { setPendingPackDay } from '../lib/packDayPending';
import { loadAttendees, toHeadsUpDogs } from '../lib/packDayAttendees';
import type { Attendee } from '../lib/packDayAttendees';
import { getBlockedUserIds } from '../lib/blocks';
import { trackEvent } from '../lib/analytics';
import AuthModal from './AuthModal';
import { FlyerSheet, FlyerFacts, GoingTokens, RulesSlip, TreeIcon } from './PackDayFlyer';
import PackDayAttendeeCard from './PackDayAttendeeCard';
import ReportProfileMenu from './ReportProfileMenu';
import {
  buildPackDayIcs,
  checkedInDogCount,
  formatPackDayWhen,
  goingSummary,
  isCheckinOpen,
  isPast,
  spotsLeft,
} from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';
import { packDayHeadsUps } from '../../shared/packDayHeadsUp';
import type { PublicPackDay } from '../lib/packDayPublic';

/** A calm paper note: status, confirmations and errors. Ink on paper, never a color alone. */
const NOTICE = 'rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown';

function PawSpin() {
  return (
    <svg aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" /><ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" /><ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" /><ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" /><path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" /></svg>
  );
}

type SummaryEvent = Pick<
  PackDay,
  'format' | 'official' | 'title' | 'localDate' | 'localTime' | 'durationMinutes' | 'placeName' | 'city' | 'state' | 'note' | 'hostDogName' | 'status'
>;

/** The event's facts, as one taped flyer. Used signed in and signed out. */
function EventSummary({ event, count, capacity }: { event: SummaryEvent; count?: number; capacity?: number }) {
  return (
    <FlyerSheet>
      <FlyerFacts event={event} />
      {typeof count === 'number' && typeof capacity === 'number' && (
        <GoingTokens capacity={capacity} count={count} status={event.status} />
      )}
    </FlyerSheet>
  );
}

interface Props {
  eventId: string;
  /** The public flyer facts, loaded on the server. null when the event can't be found. */
  publicSummary: PublicPackDay | null;
}

export default function PackDayDetail({ eventId, publicSummary }: Props) {
  const search = useSearchParams();
  const justCreated = search?.get('new') === '1';
  // The host's QR code opens this page with ?checkin=1.
  const fromQr = search?.get('checkin') === '1';

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [openDogUid, setOpenDogUid] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [checkins, setCheckins] = useState<Array<{ uid: string; dogId: string }>>([]);
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
      setCheckins(await listCheckins(eventId).catch(() => []));
      const loaded = await loadAttendees(result.event, result.foundingUids);
      setAttendees(loaded);
      // A finished Pack Day you went to: the dogs there count as met (their Dogtypes join your collection).
      const me = getFirebase().auth.currentUser?.uid;
      if (me && isPast(result.event, Date.now()) && result.event.status !== 'cancelled' && result.event.attendeeUids.includes(me)) {
        discoverFromPackDay(
          me,
          loaded.flatMap((a) => {
            const code = a.uid !== me ? computeDogtype(a.dog)?.code : undefined;
            return code ? [{ code, dogId: a.uid, dogName: a.name, at: result.event.startsAtMs }] : [];
          }),
        );
      }
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

  const visibleAttendees = useMemo(() => attendees.filter((a) => !blocked.has(a.uid)), [attendees, blocked]);
  const headsUps = useMemo(
    () => (event && event.status === 'open' ? packDayHeadsUps(toHeadsUpDogs(visibleAttendees), { viewerUid: authUser?.uid }) : []),
    [event, visibleAttendees, authUser],
  );
  const headsUpCount = headsUps.length;
  useEffect(() => {
    if (headsUpCount > 0) trackEvent('packday_headsup_shown', { eventId, count: headsUpCount });
  }, [eventId, headsUpCount]);

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

  function openSignIn() {
    // Sign-in can end in a full-page redirect (Apple) or a new account that
    // sets up a dog first; either way they come back to this event.
    setPendingPackDay(eventId);
    trackEvent('packday_gate_signin', { eventId });
    setSignInOpen(true);
  }

  if (authLoading || (authUser && loadState === 'loading')) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawSpin /></span>
      </div>
    );
  }

  if (!authUser) {
    const summary = publicSummary?.event ?? null;
    const gone = summary ? isPast({ startsAtMs: summary.startsAtMs, durationMinutes: summary.durationMinutes }, Date.now()) : false;
    const cancelled = summary?.status === 'cancelled';
    const closed = cancelled || gone;
    return (
      <div className="min-h-screen">
        <AuthModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
        <div className="p-4 pt-8 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-10 space-y-5">
          {summary ? (
            <>
              {cancelled && (
                <p className={NOTICE}>This Pack Day was cancelled.</p>
              )}
              {!cancelled && gone && (
                <p className={NOTICE}>This Pack Day is over.</p>
              )}
              <EventSummary event={summary} count={publicSummary?.attendeeCount ?? 0} capacity={summary.capacity} />
            </>
          ) : (
            <div className="text-center space-y-2 py-6">
              <span className="inline-flex text-brown" aria-hidden="true"><TreeIcon size={56} /></span>
              <h1 className="font-display text-3xl text-brown">Sign in to see this Pack Day</h1>
            </div>
          )}
          {!closed && (
            <section className="card px-5 py-4 space-y-3 text-center">
              <h2 className="font-display text-2xl text-brown">Join in, it&apos;s free</h2>
              <p className="text-[15px] font-extrabold text-brown-mid leading-snug">
                Sign in, then set up your dog&apos;s profile: about 5 minutes and 3 photos of your dog.
                Then you can save your spot. We&apos;ll bring you right back to this Pack Day.
              </p>
              <button type="button" onClick={openSignIn} className="btn-primary min-h-[52px] w-full py-3">
                Sign in or sign up
              </button>
            </section>
          )}
          <p className="text-center text-sm">
            <Link href="/" className="inline-flex min-h-[44px] items-center font-black text-brown underline decoration-2 underline-offset-4">What is GoDoggyDate?</Link>
          </p>
        </div>
      </div>
    );
  }

  if (loadState === 'missing' || loadState === 'error' || !event) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <p className="font-display text-3xl text-brown">
          {loadState === 'error' ? "We couldn't load this Pack Day" : "This Pack Day isn't here anymore"}
        </p>
        <Link href="/app/pack" className="btn-primary px-8 py-3 min-h-[52px] inline-flex items-center">See Pack Days</Link>
      </div>
    );
  }

  const uid = authUser.uid;
  const isHost = event.hostUid === uid;
  const going = event.attendeeUids.includes(uid);
  const cancelled = event.status === 'cancelled';
  const over = isPast(event, Date.now());
  const left = spotsLeft(event);
  const checkedIn = checkins.some((c) => c.uid === uid);
  const canCheckIn = going && !checkedIn && isCheckinOpen(event, Date.now());
  const hasDog = isProfileComplete(profile);
  const openDog = openDogUid ? visibleAttendees.find((a) => a.uid === openDogUid) ?? null : null;

  return (
    <div className="min-h-screen">
      <header className="px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/app/pack"
            aria-label="Back to Pack Days"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-brown bg-cream text-xl font-black text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
          >
            <span aria-hidden="true">←</span>
          </Link>
          <span className="font-display text-[26px] leading-none text-brown truncate">Pack Day</span>
        </div>
        {/* eventId lets onReportCreated snapshot this event as evidence. */}
        {!isHost && <ReportProfileMenu targetUserId={event.hostUid} eventId={event.id} />}
      </header>

      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-5">
        {justCreated && isHost && (
          <p className={NOTICE}>
            Your Pack Day is live. Share the link with neighbors. Six dogs makes a great one.
          </p>
        )}
        {cancelled && (
          <p role="status" className={NOTICE}>
            This Pack Day was cancelled.
          </p>
        )}
        {!cancelled && over && (
          <p className={NOTICE}>This Pack Day is over.</p>
        )}

        <EventSummary event={event} />

        {/* ── Who's going (a cancelled event says Cancelled above, not a head count) ── */}
        {!cancelled && (
          <section aria-labelledby="pd-going">
            <h2 id="pd-going" className="font-display text-[22px] leading-none text-brown">
              {goingSummary(event)}
            </h2>
            <ul className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
              {visibleAttendees.map((a) => (
                <li key={a.uid}>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent('packday_attendee_card_open', { eventId });
                      setOpenDogUid(a.uid);
                    }}
                    aria-label={`${a.name}${a.uid === event.hostUid ? ', host' : ''}: see their card`}
                    className="card flex h-full w-full flex-col overflow-hidden text-center !rounded-2xl transition-shadow hover:shadow-lg motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-brown"
                  >
                    {a.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photo} alt="" className="h-24 w-full object-cover" />
                    ) : (
                      <div className="h-24 flex items-center justify-center bg-note text-brown" aria-hidden="true"><PawSpin /></div>
                    )}
                    <span className="block px-2 pt-1.5 text-[14px] font-black text-brown truncate">
                      {a.name}
                    </span>
                    <span className="block px-2 pb-1.5 text-[12px] font-black text-brown-mid min-h-[1.25rem]">
                      {a.uid === event.hostUid ? 'Host' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {visibleAttendees.length > 0 && (
              <p className="mt-2 text-[13px] font-extrabold text-brown">Tap a dog to see who you&apos;ll meet.</p>
            )}
          </section>
        )}

        {/* ── Heads-up: declared limits that clash among the dogs going ─── */}
        {!cancelled && !over && headsUps.length > 0 && (
          <section aria-labelledby="pd-headsup" className="rounded-xl border-l-4 border-amber bg-cream px-4 py-3 shadow-[0_0_0_1.5px_#2A1F4A]">
            <h2 id="pd-headsup" className="text-[15px] font-black text-brown">Heads-up</h2>
            <ul className="mt-1.5 space-y-1 text-[15px] font-extrabold text-brown list-disc pl-5">
              {headsUps.map((note) => <li key={note.id} className="break-words">{note.text}</li>)}
            </ul>
            <p className="mt-2 text-[13px] font-extrabold leading-snug text-brown-mid">
              From what owners shared. It doesn&apos;t stop anyone from joining; you know your dog best.
            </p>
          </section>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {message && <p role="status" className={NOTICE}>{message}</p>}
        {error && <p role="alert" className={NOTICE}>{error}</p>}

        {!cancelled && !over && !going && (
          <section className="card px-5 py-4 space-y-3">
            {!hasDog ? (
              <>
                <p className="text-[15px] font-extrabold text-brown">Add your dog&apos;s profile to save a spot.</p>
                <Link href="/app" onClick={() => setPendingPackDay(eventId)} className="btn-primary flex min-h-[52px] items-center justify-center text-center py-3">
                  Set up my dog
                </Link>
              </>
            ) : left === 0 ? (
              <p className="text-[15px] font-black text-brown">This Pack Day is full.</p>
            ) : (
              <>
                <RulesSlip />
                <label className="flex min-h-[44px] items-start gap-2 py-2.5 text-[15px] font-extrabold text-brown cursor-pointer">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-5 w-5 accent-[#2A1F4A]" />
                  <span>I&apos;ll follow these rules.</span>
                </label>
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={busy || !accepted}
                  className="btn-primary min-h-[52px] w-full py-3 disabled:opacity-60"
                >
                  {busy ? 'Saving…' : `I'm in, ${profile?.name?.trim() || 'my dog'} too`}
                </button>
                <p className="text-[13px] font-extrabold text-brown-mid">
                  GoDoggyDate doesn&apos;t verify dogs or owners. Read the{' '}
                  <Link href="/playdate-safety" className="font-black text-brown underline decoration-2 underline-offset-2">first-meeting guide</Link>.
                </p>
              </>
            )}
          </section>
        )}

        {event.foundingHost && !cancelled && <p className={NOTICE}>⭐ Founding Host: their first Pack Day</p>}

        {event.groupId && (
          <Link href={`/app/pack/group/${event.groupId}`} className="inline-flex min-h-[44px] items-center text-[15px] font-black text-brown underline decoration-2 underline-offset-4">
            Part of a standing group · See the group
          </Link>
        )}

        {/* The chat is free and opens with the RSVP; it stays readable 48 hours after the event. */}
        {going && (
          <Link href={`/app/pack/chat/${event.id}`} className="btn-secondary flex min-h-[52px] items-center justify-center py-3 text-center">
            Open the Pack Day chat
          </Link>
        )}

        {/* ── Check-in: "I'm here" appears from the host's QR link, 30 min before start ── */}
        {!cancelled && checkins.length > 0 && (
          <p className="text-[15px] font-black text-brown">{checkedInDogCount(checkins)} checked in</p>
        )}
        {going && checkedIn && <p className={NOTICE}>You&apos;re checked in ✓</p>}
        {canCheckIn && fromQr && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => checkInToPackDay(eventId, uid, uid, 'qr'), 'You’re checked in.', 'We couldn’t check you in. Try again.')}
            className="btn-primary min-h-[52px] w-full py-3 disabled:opacity-60"
          >
            I&apos;m here
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          {!cancelled && !over && (
            <>
              <button type="button" onClick={handleShare} className="btn-secondary min-h-[44px] px-5 py-2 text-[15px]">Share</button>
              {going && (
                <button type="button" onClick={handleCalendar} className="btn-secondary min-h-[44px] px-5 py-2 text-[15px]">
                  Add to calendar
                </button>
              )}
            </>
          )}
          {going && !isHost && !over && !cancelled && (
            <button type="button" onClick={handleLeave} disabled={busy} className="btn-secondary min-h-[44px] px-5 py-2 text-[15px] disabled:opacity-60">
              Can&apos;t make it
            </button>
          )}
          {isHost && !cancelled && !over && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="btn-secondary min-h-[44px] px-5 py-2 text-[15px] disabled:opacity-60"
            >
              Cancel Pack Day
            </button>
          )}
        </div>
      </div>

      {openDog && (
        <PackDayAttendeeCard
          attendee={openDog}
          eventId={event.id}
          isHost={openDog.uid === event.hostUid}
          isYou={openDog.uid === uid}
          onClose={() => setOpenDogUid(null)}
          onBlocked={(blockedUid) => setBlocked((prev) => new Set(prev).add(blockedUid))}
        />
      )}
    </div>
  );
}
