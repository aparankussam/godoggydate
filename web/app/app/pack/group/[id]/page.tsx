'use client';
// web/app/app/pack/group/[id]/page.tsx
// A standing Pack Day group (web port of mobile/app/pack/group/[id].tsx): the
// next meetup, past meetups, members (dogs), and host tools. Meetups are ordinary
// Pack Days. Joining the group = following it. All writes go through callables.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getFirebase } from '../../../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../../../lib/auth';
import type { User } from '../../../../../lib/auth';
import { cancelPackDay } from '../../../../../lib/packDay';
import { loadAttendees, loadDogCards, toHeadsUpDogs } from '../../../../../lib/packDayAttendees';
import type { Attendee } from '../../../../../lib/packDayAttendees';
import {
  getPackGroup, joinPackGroup, leavePackGroup, listGroupOccurrences, movePackDay, packDayErrorMessage,
  removePackGroupMember, updatePackGroup,
} from '../../../../../lib/packGroup';
import { getBlockedUserIds } from '../../../../../lib/blocks';
import { isPast } from '../../../../../../shared/packDay';
import type { PackDay } from '../../../../../../shared/packDay';
import {
  PACK_GROUP_FREQUENCY_LABELS, dogMixSummary, packGroupScheduleLabel,
} from '../../../../../../shared/packGroup';
import type { PackGroup, PackGroupFrequency } from '../../../../../../shared/packGroup';
import PackDayCard from '../../../../../components/PackDayCard';
import SignInGate from '../../../../../components/SignInGate';
import { PawIcon } from '../../../../../components/PackDayFlyer';

const MEMBER_PREVIEW = 40;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NOTICE = 'rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown';
const CHIP = 'min-h-[40px] rounded-full border-2 border-brown px-3.5 py-1.5 text-[14px] font-black';
const pad = (n: number) => String(n).padStart(2, '0');

/** The next 14 days, for "Moved to...". */
function moveDays(): Array<{ value: string; label: string }> {
  const now = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1);
    return { value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, label: `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}` };
  });
}

export default function PackGroupPage() {
  const params = useParams<{ id: string }>();
  const groupId = params?.id ?? '';

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [group, setGroup] = useState<PackGroup | null>(null);
  const [events, setEvents] = useState<PackDay[]>([]);
  const [members, setMembers] = useState<Attendee[]>([]);
  const [mix, setMix] = useState('');
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'schedule' | 'move'>('none');
  const [freqDraft, setFreqDraft] = useState<PackGroupFrequency>('weekly');
  const [hourDraft, setHourDraft] = useState(9);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  const reload = useCallback(async () => {
    try {
      const g = await getPackGroup(groupId);
      if (!g) return setLoadState('missing');
      setGroup(g);
      const [occ, memberCards] = await Promise.all([listGroupOccurrences(groupId), loadDogCards(g.memberUids.slice(0, MEMBER_PREVIEW))]);
      setEvents(occ);
      setMembers(memberCards);
      const next = occ.find((e) => e.status === 'open' && !isPast(e, Date.now()));
      if (next) {
        const going = await loadAttendees(next, []);
        setMix(dogMixSummary(toHeadsUpDogs(going).map((d) => d.profile)));
      } else setMix('');
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [groupId]);

  useEffect(() => {
    if (!authUser) return;
    void reload();
    getBlockedUserIds(authUser.uid).then(setBlocked).catch(() => undefined);
  }, [authUser, reload]);

  async function run(action: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setPanel('none');
      await reload();
    } catch (err) {
      setError(packDayErrorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <header className="px-4 h-14 flex items-center gap-2">
      <Link
        href="/app/pack"
        aria-label="Back to Pack Days"
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-brown bg-cream text-xl font-black text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
      >
        <span aria-hidden="true">←</span>
      </Link>
      <h1 className="font-display text-[26px] leading-none text-brown">Group</h1>
    </header>
  );

  if (authLoading || (authUser && loadState === 'loading')) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={36} /></span>
      </div>
    );
  }
  if (!authUser) return <SignInGate title="Sign in to see this group" />;

  if (loadState !== 'ready' || !group) {
    return (
      <div className="min-h-screen">
        {header}
        <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
          <p className="font-display text-3xl text-brown">{loadState === 'error' ? "We couldn't load this group" : "This group isn't here anymore"}</p>
          {loadState === 'error' && (
            <button type="button" className="btn-secondary min-h-[44px] px-6" onClick={() => { setLoadState('loading'); void reload(); }}>Try again</button>
          )}
        </div>
      </div>
    );
  }

  const uid = authUser.uid;
  const isHost = group.hostUid === uid;
  const isMember = group.memberUids.includes(uid);
  const removed = group.removedUids.includes(uid);
  const now = Date.now();
  const upcoming = events.filter((e) => e.status === 'open' && !isPast(e, now));
  const next = upcoming[0] ?? null;
  const past = events.filter((e) => !upcoming.includes(e)).reverse().slice(0, 8);
  const visibleMembers = members.filter((m) => !blocked.has(m.uid));

  return (
    <div className="min-h-screen">
      {header}
      <div className="p-4 lg:max-w-2xl lg:mx-auto lg:px-8 lg:py-8 space-y-5">
        <section className="card px-5 py-4 space-y-2">
          <h2 className="font-display text-[28px] leading-tight text-brown break-words">{group.name}</h2>
          <p className="text-[15px] font-black text-brown">📅 {packGroupScheduleLabel(group)}</p>
          <p className="text-[15px] font-black text-brown">📍 {group.placeName}, {group.city}</p>
          {group.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {group.tags.map((t) => <li key={t} className="rounded-full border-2 border-brown bg-note px-2.5 py-0.5 text-[13px] font-black text-brown">{t}</li>)}
            </ul>
          )}
          {group.note && <p className="text-[15px] font-extrabold text-brown break-words">{group.note}</p>}
          <p className="text-[13px] font-extrabold text-brown-mid">
            Hosted by {group.hostDogName ? `${group.hostDogName}'s human` : 'the host'} · {group.memberUids.length} following
          </p>
        </section>

        {group.status === 'paused' && <p className={NOTICE}>This group is paused. No new meetups are posted until the host resumes it.</p>}
        {error && <p role="alert" className={NOTICE}>{error}</p>}

        {!isHost && !removed && (
          isMember ? (
            <button type="button" disabled={busy} className="btn-secondary min-h-[52px] w-full py-3 disabled:opacity-60" onClick={() => void run(() => leavePackGroup(groupId), "We couldn't update that. Try again.")}>
              Following · tap to leave
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} className="btn-primary min-h-[52px] w-full py-3 disabled:opacity-60" onClick={() => void run(() => joinPackGroup(groupId), "We couldn't join. Try again.")}>
                Follow this group
              </button>
              <p className="text-[13px] font-extrabold text-brown-mid">
                Following means a nudge each time the next meetup is posted. You still save a spot for each one yourself.
              </p>
            </>
          )
        )}

        <section className="space-y-3" aria-labelledby="pg-next">
          <h2 id="pg-next" className="font-display text-[22px] leading-none text-brown">Next meetup</h2>
          {next ? (
            <>
              <PackDayCard event={next} badge={next.hostUid === uid ? 'hosting' : next.attendeeUids.includes(uid) ? 'going' : undefined} />
              {mix && <p className="text-[14px] font-black text-brown">{mix}</p>}
              {group.smallDogsOnly && <p className="text-[13px] font-extrabold text-brown-mid">Small dogs only.</p>}
            </>
          ) : (
            <p className={NOTICE}>{group.status === 'paused' ? 'Paused.' : 'The next one is posted shortly after the last one ends.'}</p>
          )}
        </section>

        {isHost && (
          <section className="card px-5 py-4 space-y-3" aria-labelledby="pg-host">
            <h2 id="pg-host" className="font-display text-[22px] leading-none text-brown">Host tools</h2>
            {next && (
              <>
                <p className="text-[13px] font-extrabold text-brown-mid">This week&apos;s meetup. One tap tells everyone who signed up.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} className="btn-secondary min-h-[44px] px-5 text-[15px]" onClick={() => setPanel(panel === 'move' ? 'none' : 'move')}>Moved</button>
                  <button
                    type="button"
                    disabled={busy}
                    className="btn-secondary min-h-[44px] px-5 text-[15px]"
                    onClick={() => {
                      if (window.confirm('Cancel this meetup? Everyone who signed up is notified. The next one in the schedule is posted automatically.')) {
                        void run(() => cancelPackDay(next.id), "We couldn't cancel it. Try again.");
                      }
                    }}
                  >
                    Cancelled
                  </button>
                </div>
                {panel === 'move' && (
                  <>
                    <p className="text-[15px] font-black text-brown">Moved to (same start time)</p>
                    <div className="flex flex-wrap gap-2">
                      {moveDays().map((d) => (
                        <button key={d.value} type="button" disabled={busy} className={`${CHIP} bg-cream text-brown`} onClick={() => void run(() => movePackDay(next.id, d.value), "We couldn't move it. Try again.")}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="btn-secondary min-h-[44px] px-5 text-[15px]"
                onClick={() => {
                  setFreqDraft(group.frequency);
                  setHourDraft(Number(group.localTime.slice(0, 2)));
                  setPanel(panel === 'schedule' ? 'none' : 'schedule');
                }}
              >
                Edit schedule
              </button>
              <button
                type="button"
                disabled={busy}
                className="btn-secondary min-h-[44px] px-5 text-[15px]"
                onClick={() => void run(() => updatePackGroup(groupId, { status: group.status === 'active' ? 'paused' : 'active' }), "We couldn't update the group. Try again.")}
              >
                {group.status === 'active' ? 'Pause group' : 'Resume group'}
              </button>
            </div>
            {panel === 'schedule' && (
              <>
                <p className="text-[15px] font-black text-brown">How often</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How often">
                  {(Object.keys(PACK_GROUP_FREQUENCY_LABELS) as PackGroupFrequency[]).map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={freqDraft === f} className={`${CHIP} ${freqDraft === f ? 'bg-brown text-cream' : 'bg-cream text-brown'}`} onClick={() => setFreqDraft(f)}>
                      {PACK_GROUP_FREQUENCY_LABELS[f]}
                    </button>
                  ))}
                </div>
                <p className="text-[15px] font-black text-brown">Start time (on the same minutes)</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Start hour">
                  {Array.from({ length: 16 }, (_, i) => 6 + i).map((h) => (
                    <button key={h} type="button" role="radio" aria-checked={hourDraft === h} className={`${CHIP} ${hourDraft === h ? 'bg-brown text-cream' : 'bg-cream text-brown'}`} onClick={() => setHourDraft(h)}>
                      {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}
                    </button>
                  ))}
                </div>
                <p className="text-[13px] font-extrabold text-brown-mid">Applies to meetups posted from now on. Ones already posted keep their time.</p>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-primary min-h-[52px] w-full py-3 disabled:opacity-60"
                  onClick={() => void run(
                    () => updatePackGroup(groupId, { frequency: freqDraft, localTime: `${pad(hourDraft)}:${group.localTime.slice(3)}` }),
                    "We couldn't save the schedule. Try again.",
                  )}
                >
                  Save schedule
                </button>
              </>
            )}
          </section>
        )}

        <section className="space-y-3" aria-labelledby="pg-members">
          <h2 id="pg-members" className="font-display text-[22px] leading-none text-brown">Members</h2>
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {visibleMembers.map((m) => (
              <li key={m.uid} className="card flex flex-col items-center overflow-hidden !rounded-2xl text-center">
                {m.photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={m.photo} alt="" className="h-24 w-full object-cover" />
                  : <div className="h-24 w-full bg-note" aria-hidden="true" />}
                <span className="w-full truncate px-2 py-1.5 text-[13px] font-black text-brown">{m.name}</span>
                {isHost && m.uid !== uid && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${m.name}`}
                    className="min-h-[44px] text-[12px] font-black text-brown underline"
                    onClick={() => {
                      if (window.confirm(`Remove ${m.name}? They leave the group, come off upcoming meetups, and can't rejoin.`)) {
                        void run(() => removePackGroupMember(groupId, m.uid), "We couldn't remove them. Try again.");
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {group.memberUids.length > MEMBER_PREVIEW && <p className="text-[13px] font-extrabold text-brown-mid">and {group.memberUids.length - MEMBER_PREVIEW} more</p>}
        </section>

        {past.length > 0 && (
          <section className="space-y-3" aria-labelledby="pg-past">
            <h2 id="pg-past" className="font-display text-[22px] leading-none text-brown">Past meetups</h2>
            {past.map((e) => <PackDayCard key={e.id} event={e} />)}
          </section>
        )}
      </div>
    </div>
  );
}
