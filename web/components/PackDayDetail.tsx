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

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getFirebase } from '../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../lib/auth';
import type { User, SavedDogProfile } from '../lib/auth';
import {
  cancelPackDay,
  getPackDay,
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
import PackDayAttendeeCard from './PackDayAttendeeCard';
import ReportProfileMenu from './ReportProfileMenu';
import {
  PACK_DAY_FORMATS,
  PACK_DAY_RULES,
  buildPackDayIcs,
  formatPackDayWhen,
  goingSummary,
  isPast,
  mapsSearchUrl,
  spotsLeft,
} from '../../shared/packDay';
import type { PackDay } from '../../shared/packDay';
import { packDayHeadsUps } from '../../shared/packDayHeadsUp';
import type { PublicPackDay } from '../lib/packDayPublic';

type SummaryEvent = Pick<
  PackDay,
  'format' | 'official' | 'title' | 'localDate' | 'localTime' | 'durationMinutes' | 'placeName' | 'city' | 'state' | 'note' | 'hostDogName' | 'status'
>;

/** The event's facts, as one card. Used signed in and signed out. */
function EventSummary({ event }: { event: SummaryEvent }) {
  const format = PACK_DAY_FORMATS[event.format];
  const cancelled = event.status === 'cancelled';
  return (
    <article className="card overflow-hidden">
      <div className={`px-5 py-4 ${cancelled ? 'bg-cream-dark' : 'bg-gradient-to-br from-primary/15 to-gold/15'}`}>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rose">
          {event.official ? '⭐ Official · ' : ''}{format.emoji} {format.label}
          {cancelled && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-red-700">Cancelled</span>}
        </p>
        <h1 className={`mt-1 font-display text-2xl leading-tight break-words ${cancelled ? 'text-brown-mid line-through decoration-1' : 'text-brown'}`}>
          {event.title}
        </h1>
      </div>
      <div className="px-5 py-4 space-y-3 text-sm">
        <p className="font-semibold text-brown">📅 {formatPackDayWhen(event)} · {event.durationMinutes} min</p>
        <p className="text-brown break-words">
          📍 <span className="font-semibold">{event.placeName}</span>, {event.city}
          <a
            href={mapsSearchUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 px-1.5 py-3 text-rose font-semibold underline"
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

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [openDogUid, setOpenDogUid] = useState<string | null>(null);
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
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    const summary = publicSummary?.event ?? null;
    const gone = summary ? isPast({ startsAtMs: summary.startsAtMs, durationMinutes: summary.durationMinutes }, Date.now()) : false;
    const cancelled = summary?.status === 'cancelled';
    const closed = cancelled || gone;
    return (
      <div className="min-h-screen bg-cream">
        <AuthModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
        <div className="p-4 pt-8 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-10 space-y-5">
          {summary ? (
            <>
              {cancelled && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">This Pack Day was cancelled.</p>
              )}
              {!cancelled && gone && (
                <p className="rounded-xl bg-cream-dark px-4 py-3 text-sm font-semibold text-brown-mid">This Pack Day is over.</p>
              )}
              <EventSummary event={summary} />
              <p className="text-sm font-semibold text-brown-mid">
                {goingSummary({ capacity: summary.capacity, status: summary.status, attendeeCount: publicSummary?.attendeeCount ?? 0 })}
              </p>
            </>
          ) : (
            <div className="text-center space-y-2 py-6">
              <span className="text-6xl" aria-hidden="true">🌳</span>
              <h1 className="font-display text-2xl text-brown">Sign in to see this Pack Day</h1>
            </div>
          )}
          {!closed && (
            <section className="rounded-2xl border border-border bg-white px-5 py-4 space-y-3 text-center">
              <h2 className="font-display text-lg text-brown">Join in, it&apos;s free</h2>
              <p className="text-sm text-brown-mid leading-relaxed">
                Sign in, then set up your dog&apos;s profile: about 5 minutes and 3 photos of your dog.
                Then you can save your spot. We&apos;ll bring you right back to this Pack Day.
              </p>
              <button type="button" onClick={openSignIn} className="btn-primary w-full py-3">
                Sign in or sign up
              </button>
            </section>
          )}
          <p className="text-center text-sm">
            <Link href="/" className="font-semibold text-brown-light underline underline-offset-2">What is GoDoggyDate?</Link>
          </p>
        </div>
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
  const hasDog = isProfileComplete(profile);
  const openDog = openDogUid ? visibleAttendees.find((a) => a.uid === openDogUid) ?? null : null;

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
          <p role="status" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            This Pack Day was cancelled.
          </p>
        )}
        {!cancelled && over && (
          <p className="rounded-xl bg-cream-dark px-4 py-3 text-sm font-semibold text-brown-mid">This Pack Day is over.</p>
        )}

        <EventSummary event={event} />

        {/* ── Who's going (a cancelled event says Cancelled above, not a head count) ── */}
        {!cancelled && (
          <section aria-labelledby="pd-going">
            <h2 id="pd-going" className="text-xs font-bold uppercase tracking-[0.14em] text-brown-light">
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
                    className="card flex h-full w-full flex-col overflow-hidden text-center transition-shadow hover:shadow-lg motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {a.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.photo} alt="" className="h-24 w-full object-cover" />
                    ) : (
                      <div className="h-24 flex items-center justify-center text-4xl bg-cream-dark" aria-hidden="true">🐕</div>
                    )}
                    <span className="block px-2 pt-1.5 text-xs font-bold text-brown truncate">
                      {a.founding ? '⭐ ' : ''}{a.name}
                    </span>
                    <span className="block px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose min-h-[1.25rem]">
                      {a.uid === event.hostUid ? 'Host' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {visibleAttendees.length > 0 && (
              <p className="mt-2 text-xs text-brown-light">Tap a dog to see who you&apos;ll meet.</p>
            )}
          </section>
        )}

        {/* ── Heads-up: declared limits that clash among the dogs going ─── */}
        {!cancelled && !over && headsUps.length > 0 && (
          <section aria-labelledby="pd-headsup" className="rounded-2xl border border-gold/50 bg-gold/10 px-4 py-3">
            <h2 id="pd-headsup" className="text-sm font-bold text-brown">Heads-up</h2>
            <ul className="mt-1.5 space-y-1 text-sm text-brown list-disc pl-5">
              {headsUps.map((note) => <li key={note.id} className="break-words">{note.text}</li>)}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-brown-light">
              From what owners shared. It doesn&apos;t stop anyone from joining; you know your dog best.
            </p>
          </section>
        )}

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
