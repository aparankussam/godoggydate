'use client';
// web/app/app/pack/group/new/page.tsx
// Start a standing Pack Day group (web port of mobile/app/pack/group/new.tsx): a
// Pack Day that repeats weekly, every two weeks or monthly. Creating it posts the
// first meetup right away. createPackGroup re-validates everything; the checks
// here are only so mistakes show up before the round trip.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getFirebase } from '../../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile, isProfileComplete } from '../../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../../lib/auth';
import { createPackGroup, packDayErrorMessage } from '../../../../../lib/packGroup';
import { trackEvent } from '../../../../../lib/analytics';
import { PACK_DAY_LIMITS, packDayStartTimeProblem, packDayStartTimes } from '../../../../../../shared/packDay';
import {
  PACK_GROUP_FREQUENCY_LABELS,
  PACK_GROUP_LIMITS,
  PACK_GROUP_TAG_SUGGESTIONS,
} from '../../../../../../shared/packGroup';
import type { PackGroupFrequency } from '../../../../../../shared/packGroup';
import { checkContentFields, CONTENT_FILTER_MESSAGE } from '../../../../../../shared/contentFilter';
import SignInGate from '../../../../../components/SignInGate';
import { PawIcon, RulesSlip } from '../../../../../components/PackDayFlyer';

const START_TIMES = packDayStartTimes();
const CAPACITIES = Array.from(
  { length: PACK_DAY_LIMITS.maxCapacity - PACK_DAY_LIMITS.minCapacity + 1 },
  (_, i) => PACK_DAY_LIMITS.minCapacity + i,
);

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const inputClass =
  'w-full min-h-[44px] rounded-xl border-2 border-brown bg-cream px-4 py-2.5 text-brown text-base font-extrabold focus:outline-none focus:ring-2 focus:ring-brown focus:ring-offset-2 focus:ring-offset-sky';
const labelClass = 'block text-[15px] font-black text-brown mb-1';

export default function NewPackGroupPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [frequency, setFrequency] = useState<PackGroupFrequency>('weekly');
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

  // The "Small dogs only" tag is the switch: it makes every meetup small-dogs-only.
  const smallDogsOnly = tags.includes('Small dogs only');

  function toggleTag(tag: string) {
    setTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : cur.length < PACK_GROUP_LIMITS.maxTags ? [...cur, tag] : cur,
    );
  }

  function addCustomTag() {
    const tag = customTag.trim();
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()) && tags.length < PACK_GROUP_LIMITS.maxTags) {
      setTags([...tags, tag]);
    }
    setCustomTag('');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim() || !placeName.trim()) {
      setError('Add a group name and a place.');
      return;
    }
    const startsAt = new Date(`${date}T${time}`);
    if (!date || Number.isNaN(startsAt.getTime())) {
      setError('Pick the first date.');
      return;
    }
    const timeProblem = packDayStartTimeProblem(time);
    if (timeProblem) {
      setError(timeProblem);
      return;
    }
    // A wall-clock time a daylight-saving jump skips would silently shift an hour.
    if (`${pad(startsAt.getHours())}:${pad(startsAt.getMinutes())}` !== time.slice(0, 5)) {
      setError("That time doesn't exist on that date because the clocks change. Pick another start time.");
      return;
    }
    if (startsAt.getTime() < Date.now() + PACK_DAY_LIMITS.minLeadMinutes * 60_000) {
      setError('The first meetup must be at least an hour from now, so people have notice.');
      return;
    }
    if (!accepted) {
      setError('Please agree to the Pack Day rules.');
      return;
    }
    if (!checkContentFields([name, placeName, note, ...tags]).ok) {
      setError(CONTENT_FILTER_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const { groupId } = await createPackGroup({
        name: name.trim(),
        tags,
        smallDogsOnly,
        frequency,
        firstLocalDate: date,
        localTime: time,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        durationMinutes: duration,
        placeName: placeName.trim(),
        note: note.trim(),
        capacity,
        acceptedRules: true,
      });
      trackEvent('packgroup_created', { frequency, smallDogsOnly });
      router.push(`/app/pack/group/${groupId}`);
    } catch (err) {
      setError(packDayErrorMessage(err, "We couldn't create your group. Try again."));
      setBusy(false);
    }
  }

  if (authLoading || (authUser && profileLoading)) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={36} /></span>
      </div>
    );
  }
  if (!authUser) return <SignInGate title="Sign in to start a group" />;
  if (!isProfileComplete(profile)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <p className="font-display text-3xl text-brown">Add your dog first</p>
        <Link href="/app" className="btn-primary inline-flex min-h-[52px] items-center px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  const today = new Date();
  const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + PACK_DAY_LIMITS.maxLeadDays);
  const customTags = tags.filter((t) => !(PACK_GROUP_TAG_SUGGESTIONS as readonly string[]).includes(t));
  const pill = (active: boolean) =>
    `min-h-[40px] rounded-full border-2 border-brown px-3.5 py-1.5 text-[14px] font-black ${active ? 'bg-brown text-cream' : 'bg-cream text-brown'}`;

  return (
    <div className="min-h-screen">
      <header className="px-4 h-14 flex items-center gap-2">
        <Link
          href="/app/pack"
          aria-label="Back to Pack Days"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-brown bg-cream text-xl font-black text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="font-display text-[26px] leading-none text-brown">Start a group</h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-5">
        <p className="text-[15px] font-extrabold text-brown-mid">
          A Pack Day that repeats. Neighbors join the group and get a nudge each time the next one is posted.
        </p>

        <div>
          <label htmlFor="pg-name" className={labelClass}>Group name</label>
          <input id="pg-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={PACK_GROUP_LIMITS.maxNameLength} placeholder="Riverside Sunday Pack" required />
        </div>

        <fieldset>
          <legend className={labelClass}>Tags <span className="font-extrabold text-brown-mid">(up to {PACK_GROUP_LIMITS.maxTags})</span></legend>
          <div className="flex flex-wrap gap-2">
            {PACK_GROUP_TAG_SUGGESTIONS.map((t) => (
              <button key={t} type="button" aria-pressed={tags.includes(t)} className={pill(tags.includes(t))} onClick={() => toggleTag(t)}>{t}</button>
            ))}
            {customTags.map((t) => (
              <button key={t} type="button" aria-pressed className={pill(true)} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
              maxLength={PACK_GROUP_LIMITS.maxTagLength}
              placeholder="Your own, like Corgis"
              aria-label="Add your own tag"
            />
            <button type="button" className="btn-secondary min-h-[44px] px-5" onClick={addCustomTag}>Add</button>
          </div>
          {smallDogsOnly && <p className="mt-1 text-[13px] font-extrabold text-brown-mid">Only small dogs will be able to save a spot.</p>}
        </fieldset>

        <fieldset>
          <legend className={labelClass}>How often</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(Object.keys(PACK_GROUP_FREQUENCY_LABELS) as PackGroupFrequency[]).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={frequency === f} className={pill(frequency === f)} onClick={() => setFrequency(f)}>
                {PACK_GROUP_FREQUENCY_LABELS[f]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[13px] font-extrabold text-brown-mid">
            It repeats on the same weekday as your first date{frequency === 'monthly' ? ', in the same week of the month' : ''}.
          </p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pg-date" className={labelClass}>First meetup</label>
            <input id="pg-date" type="date" className={inputClass} value={date} min={localDate(today)} max={localDate(maxDate)} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="pg-time" className={labelClass}>Start time</label>
            <select id="pg-time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} required>
              {START_TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pg-duration" className={labelClass}>How long</label>
            <select id="pg-duration" className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {PACK_DAY_LIMITS.durationOptions.map((m) => <option key={m} value={m}>{m} minutes</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pg-capacity" className={labelClass}>Max dogs</label>
            <select id="pg-capacity" className={inputClass} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
              {CAPACITIES.map((n) => <option key={n} value={n}>{n} dogs</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="pg-place" className={labelClass}>Where</label>
          <input id="pg-place" className={inputClass} value={placeName} onChange={(e) => setPlaceName(e.target.value)} maxLength={PACK_DAY_LIMITS.maxPlaceLength} placeholder="Riverside Park, main entrance" required />
          <p className="mt-1 text-[13px] font-extrabold text-brown-mid">A public spot, never your home. Meets in {profile?.city || 'your city'}.</p>
        </div>

        <div>
          <label htmlFor="pg-note" className={labelClass}>Note <span className="font-extrabold text-brown-mid">(optional)</span></label>
          <textarea id="pg-note" className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={PACK_DAY_LIMITS.maxNoteLength} placeholder="Where to park, which gate, bring water…" />
          <p className="mt-1 text-[13px] font-extrabold text-brown-mid">No links or phone numbers.</p>
        </div>

        <section>
          <RulesSlip />
          <label className="mt-1 flex min-h-[44px] items-start gap-2 py-2.5 text-[15px] font-extrabold text-brown cursor-pointer">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-5 w-5 accent-[#2A1F4A]" />
            <span>I&apos;ll follow these rules and remind people who join.</span>
          </label>
          <p className="mt-2 text-[13px] font-extrabold text-brown-mid">
            GoDoggyDate doesn&apos;t verify dogs or owners, and the host isn&apos;t responsible for other people&apos;s dogs.
          </p>
        </section>

        {error && <p role="alert" className="rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary min-h-[52px] w-full py-3 disabled:opacity-60">
          {busy ? 'Creating…' : 'Start the group'}
        </button>
      </form>
    </div>
  );
}
