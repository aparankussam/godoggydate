'use client';
// web/app/app/pack/new/page.tsx
// Host a Pack Day. The server (createPackDay) re-validates everything; the
// checks here are only so mistakes show up before the round trip.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import { createPackDay, packDayErrorMessage } from '../../../../lib/packDay';
import { trackEvent } from '../../../../lib/analytics';
import {
  PACK_DAY_FORMATS,
  PACK_DAY_FORMAT_KEYS,
  PACK_DAY_LIMITS,
  PACK_DAY_RULES,
  packDayStartTimeProblem,
  packDayStartTimes,
} from '../../../../../shared/packDay';
import type { PackDayFormat } from '../../../../../shared/packDay';
import { checkContentFields, CONTENT_FILTER_MESSAGE } from '../../../../../shared/contentFilter';
import SignInGate from '../../../../components/SignInGate';

// 6:00 AM to 9:45 PM in 15-minute steps: the hours public parks are open, and the
// same chips the iPhone form offers. createPackDay enforces the same window.
const START_TIMES = packDayStartTimes();

const CAPACITIES = Array.from(
  { length: PACK_DAY_LIMITS.maxCapacity - PACK_DAY_LIMITS.minCapacity + 1 },
  (_, i) => PACK_DAY_LIMITS.minCapacity + i,
);

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Today in the browser's local calendar, 'YYYY-MM-DD', for the date input's min. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NewPackDayPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<PackDayFormat>('pack-walk');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState<number>(PACK_DAY_LIMITS.defaultDurationMinutes);
  const [placeName, setPlaceName] = useState('');
  const [note, setNote] = useState('');
  const [capacity, setCapacity] = useState<number>(PACK_DAY_LIMITS.defaultCapacity);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    getUserDogProfile(authUser.uid)
      .then((p) => { if (active) setProfile(p); })
      .catch(() => { if (active) setProfile(null); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [authUser]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (!title.trim() || !placeName.trim()) {
      setError('Add a title and a place.');
      return;
    }
    const startsAt = new Date(`${date}T${time}`);
    if (!date || !time || Number.isNaN(startsAt.getTime())) {
      setError('Pick a date and time.');
      return;
    }
    const timeProblem = packDayStartTimeProblem(time);
    if (timeProblem) {
      setError(timeProblem);
      return;
    }
    // A wall-clock time that a daylight-saving jump skips (2:30 AM the night the
    // clocks go forward) silently becomes an hour later in JS, so the event
    // would be saved as "2:30 AM" but start at 3:30. Catch it before saving.
    if (`${pad(startsAt.getHours())}:${pad(startsAt.getMinutes())}` !== time.slice(0, 5)) {
      setError("That time doesn't exist on that date because the clocks change. Pick another start time.");
      return;
    }
    if (startsAt.getTime() < Date.now() + PACK_DAY_LIMITS.minLeadMinutes * 60_000) {
      setError('Start time must be at least an hour from now, so people have notice.');
      return;
    }
    // Same filter the server runs in createPackDay; checked here so the host
    // keeps their text and sees why before the round trip.
    if (!checkContentFields([title, placeName, note]).ok) {
      setError(CONTENT_FILTER_MESSAGE);
      return;
    }
    if (!accepted) {
      setError('Please agree to the Pack Day rules.');
      return;
    }

    setBusy(true);
    try {
      const eventId = await createPackDay({
        title: title.trim(),
        format,
        startsAtMs: startsAt.getTime(),
        durationMinutes: duration,
        localDate: date,
        localTime: time,
        placeName: placeName.trim(),
        note: note.trim(),
        capacity,
        acceptedRules: true,
      });
      trackEvent('packday_created', { format, capacity });
      router.push(`/app/pack/${eventId}?new=1`);
    } catch (err) {
      setError(packDayErrorMessage(err, "We couldn't create your Pack Day. Try again."));
      setBusy(false);
    }
  }

  if (authLoading || (authUser && profileLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }

  if (!authUser) {
    return <SignInGate emoji="🐶" title="Sign in to host a Pack Day" />;
  }

  if (!isProfileComplete(profile)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🐶</span>
        <p className="font-display text-2xl text-brown">Add your dog first</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-border bg-white px-4 py-2.5 text-brown text-base focus:border-primary focus:outline-none';
  const labelClass = 'block text-sm font-bold text-brown mb-1';

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center gap-3">
        <Link href="/app/pack" aria-label="Back to Pack Days" className="text-xl text-brown -m-2.5 p-2.5">←</Link>
        <span className="font-display text-xl text-brown">Host a Pack Day</span>
      </header>

      <form onSubmit={handleSubmit} className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-5">
        <div>
          <label htmlFor="pd-title" className={labelClass}>Title</label>
          <input
            id="pd-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={PACK_DAY_LIMITS.maxTitleLength}
            placeholder="Saturday morning loop"
            required
          />
        </div>

        <fieldset>
          <legend className={labelClass}>Format</legend>
          <div className="space-y-2">
            {PACK_DAY_FORMAT_KEYS.map((key) => {
              const f = PACK_DAY_FORMATS[key];
              return (
                <label
                  key={key}
                  className={`flex items-start gap-3 rounded-xl border-2 bg-white px-4 py-3 cursor-pointer ${
                    format === key ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={key}
                    checked={format === key}
                    onChange={() => setFormat(key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-bold text-brown">{f.emoji} {f.label}</span>
                    <span className="block text-xs text-brown-mid">{f.blurb}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pd-date" className={labelClass}>Date</label>
            <input
              id="pd-date"
              type="date"
              className={inputClass}
              value={date}
              min={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="pd-time" className={labelClass}>Start time</label>
            <select
              id="pd-time"
              className={inputClass}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            >
              {START_TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pd-duration" className={labelClass}>How long</label>
            <select
              id="pd-duration"
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {PACK_DAY_LIMITS.durationOptions.map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pd-capacity" className={labelClass}>Max dogs</label>
            <select
              id="pd-capacity"
              className={inputClass}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            >
              {CAPACITIES.map((n) => <option key={n} value={n}>{n} dogs</option>)}
            </select>
          </div>
        </div>

        <p className="-mt-2 text-xs text-brown-light">
          Start times run 6:00 AM to 9:45 PM, when public parks are open.
        </p>

        <div>
          <label htmlFor="pd-place" className={labelClass}>Where</label>
          <input
            id="pd-place"
            className={inputClass}
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            maxLength={PACK_DAY_LIMITS.maxPlaceLength}
            placeholder="Cedar Park, main entrance"
            required
          />
          <p className="mt-1 text-xs text-brown-light">
            A park, trail or other public spot. Never your home address. Meets in {profile?.city || 'your city'}.
          </p>
        </div>

        <div>
          <label htmlFor="pd-note" className={labelClass}>Note <span className="font-normal text-brown-light">(optional)</span></label>
          <textarea
            id="pd-note"
            className={inputClass}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={PACK_DAY_LIMITS.maxNoteLength}
            placeholder="Where to park, which gate, bring water…"
          />
          <p className="mt-1 text-xs text-brown-light">
            No links or phone numbers. Members who match after you meet can message each other in the app.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-brown">House rules</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-brown-mid list-disc pl-5">
            {PACK_DAY_RULES.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
          <label className="mt-1 flex items-start gap-2 py-2.5 text-sm text-brown cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1"
            />
            <span>I&apos;ll follow these rules and remind people who join.</span>
          </label>
          <p className="mt-2 text-[11px] text-brown-light">
            GoDoggyDate doesn&apos;t verify dogs or owners, and the host isn&apos;t responsible for other people&apos;s dogs.
          </p>
        </section>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
          {busy ? 'Creating…' : 'Create Pack Day'}
        </button>
      </form>
    </div>
  );
}
