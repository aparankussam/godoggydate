'use client';
// web/app/app/pack/chat/[eventId]/page.tsx
// The Pack Day group chat (web port of mobile/app/pack/chat/[eventId].tsx). It
// opens when you RSVP (members are the event's RSVP list), is free for everyone,
// and turns read-only 48 hours after the event (firestore.rules enforces that;
// this page just says so). After the event it leads with the shared photo album,
// the "Class photo" and "Who did <dog> play with?".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from '../../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../../lib/auth';
import { getBlockedUserIds } from '../../../../../lib/blocks';
import { recordSwipe } from '../../../../../lib/matching';
import { trackEvent } from '../../../../../lib/analytics';
import { getPackDay, listCheckins, packDayErrorMessage } from '../../../../../lib/packDay';
import { loadAttendees } from '../../../../../lib/packDayAttendees';
import type { Attendee } from '../../../../../lib/packDayAttendees';
import {
  ChatContentError,
  EMPTY_CONTROL,
  packDayHostAction,
  sendPackDayPhoto,
  sendPackDayQuick,
  sendPackDayRainCheck,
  sendPackDayText,
  subscribePackDayControl,
  subscribePackDayMessages,
} from '../../../../../lib/packDayChat';
import type { HostAction, PackDayChatControl, PackDayMessage } from '../../../../../lib/packDayChat';
import { CONTENT_FILTER_MESSAGE } from '../../../../../../shared/contentFilter';
import { formatPackDayWhen } from '../../../../../../shared/packDay';
import type { PackDay } from '../../../../../../shared/packDay';
import {
  CHAT_MAX_TEXT,
  CHAT_QUICK_MESSAGES,
  canPostPhoto,
  canPostText,
  chatPhase,
  classPhotoUids,
  visibleChatMessages,
  whoPlayedCandidates,
} from '../../../../../../shared/packDayChat';
import ChatBubble from '../../../../../components/ChatBubble';
import SignInGate from '../../../../../components/SignInGate';
import { SafetySheet } from '../../../../../components/ReportProfileMenu';
import { PawIcon } from '../../../../../components/PackDayFlyer';
import { Icon } from '../../../../../components/icons';

type Tab = 'chat' | 'album';
type PlayState = 'saving' | 'pack' | 'match';

const NOTICE = 'rounded-xl border-2 border-brown bg-cream px-4 py-3 text-[15px] font-black text-brown';
const CHIP = 'min-h-[44px] rounded-full border-2 border-b-4 border-brown bg-cream px-4 text-[14px] font-black text-brown disabled:opacity-40';

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function PackDayChatPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId ?? '';

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);
  const [event, setEvent] = useState<PackDay | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<PackDayMessage[]>([]);
  const [control, setControl] = useState<PackDayChatControl>(EMPTY_CONTROL);
  const [tab, setTab] = useState<Tab | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [actionFor, setActionFor] = useState<PackDayMessage | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [checkinUids, setCheckinUids] = useState<string[]>([]);
  const [played, setPlayed] = useState<Record<string, PlayState>>({});
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  const uid = authUser?.uid ?? '';

  const reload = useCallback(async () => {
    try {
      const result = await getPackDay(eventId);
      if (!result) return setLoad('missing');
      setEvent(result.event);
      setAttendees(await loadAttendees(result.event, result.foundingUids));
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, [eventId]);

  useEffect(() => {
    if (!uid || !eventId) return;
    void reload();
    getBlockedUserIds(uid).then(setBlocked).catch(() => undefined);
    getUserDogProfile(uid).then(setProfile).catch(() => undefined);
    trackEvent('packday_chat_view', { eventId });
  }, [uid, eventId, reload]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const member = Boolean(event && event.attendeeUids.includes(uid));

  // Only a member may read (firestore.rules), so don't subscribe before we know.
  useEffect(() => {
    if (!member) return undefined;
    const offMessages = subscribePackDayMessages(eventId, setMessages, () => undefined);
    const offControl = subscribePackDayControl(eventId, setControl);
    return () => { offMessages(); offControl(); };
  }, [member, eventId]);

  const phase = event ? chatPhase(event, now) : 'before';
  const afterEvent = phase === 'after' || phase === 'readonly';
  const activeTab: Tab = tab ?? (afterEvent ? 'album' : 'chat');
  const isHost = Boolean(event && event.hostUid === uid);
  const muted = control.mutedUids.includes(uid);
  const byUid = useMemo(() => new Map(attendees.map((a) => [a.uid, a])), [attendees]);
  const nameOf = (id: string) => byUid.get(id)?.name ?? 'A dog';
  const visible = useMemo(() => visibleChatMessages(messages, blocked), [messages, blocked]);
  const photos = visible.filter((m) => m.kind === 'photo' && m.photoUrl && !m.moderated);

  useEffect(() => {
    if (activeTab === 'chat') endRef.current?.scrollIntoView({ block: 'end' });
  }, [visible.length, activeTab]);

  // After the event, the class photo needs to know who checked in.
  useEffect(() => {
    if (member && afterEvent) listCheckins(eventId).then((c) => setCheckinUids(c.map((x) => x.uid))).catch(() => setCheckinUids([]));
  }, [member, afterEvent, eventId]);

  // Who I already added: a "like" swipe on their dog.
  useEffect(() => {
    if (!member || !afterEvent || !event) return;
    const { db } = getFirebase();
    const others = whoPlayedCandidates(event.attendeeUids, uid, blocked);
    void Promise.all(others.map(async (other) => {
      const snap = await getDoc(doc(db, 'swipes', uid, 'decisions', other)).catch(() => null);
      return snap?.exists() && snap.data()?.action === 'like' ? other : null;
    })).then((liked) => setPlayed((p) => {
      const next = { ...p };
      for (const id of liked) if (id && !next[id]) next[id] = 'pack';
      return next;
    }));
  }, [member, afterEvent, event, uid, blocked]);

  async function run(action: () => Promise<void>, failure: string) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ChatContentError ? CONTENT_FILTER_MESSAGE : packDayErrorMessage(err, failure));
    } finally {
      setSending(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const draft = text.trim();
    if (!draft) return;
    setText('');
    await run(async () => {
      try {
        await sendPackDayText(eventId, uid, draft);
      } catch (err) {
        setText(draft); // never lose a draft
        throw err;
      }
    }, 'Check your connection and try again.');
  }

  async function handlePhoto(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    trackEvent('packday_photo_add', { eventId });
    await run(() => sendPackDayPhoto(eventId, uid, file), "The photo didn't upload.");
  }

  async function handleHost(action: HostAction, target: { messageId?: string; targetUid?: string }) {
    setActionFor(null);
    setError(null);
    try {
      await packDayHostAction(eventId, action, target);
      if (action === 'remove') await reload();
    } catch (err) {
      setError(packDayErrorMessage(err, 'Try again in a moment.'));
    }
  }

  async function handleAddToPack(other: Attendee) {
    setPlayed((p) => ({ ...p, [other.uid]: 'saving' }));
    try {
      const result = await recordSwipe({
        currentUserId: uid,
        currentDogId: uid,
        targetUserId: other.uid,
        targetDogId: other.uid,
        action: 'like',
      });
      trackEvent('packday_played_with', { eventId, matched: result.isMatch });
      setPlayed((p) => ({ ...p, [other.uid]: result.isMatch ? 'match' : 'pack' }));
    } catch {
      setPlayed((p) => Object.fromEntries(Object.entries(p).filter(([id]) => id !== other.uid)));
      setError('Check your connection and try again.');
    }
  }

  if (authLoading || (authUser && load === 'loading')) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-brown animate-spin motion-reduce:animate-none" role="status" aria-label="Loading"><PawIcon size={36} /></span>
      </div>
    );
  }
  if (!authUser) return <SignInGate title="Sign in to open this chat" />;

  if (load !== 'ready' || !event || !member) {
    const message = load === 'missing' ? "This Pack Day isn't here anymore."
      : load === 'error' ? "We couldn't load this chat."
        : 'The chat opens when you RSVP to this Pack Day.';
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <p className="font-display text-3xl text-brown">{message}</p>
        {load === 'error' && <button type="button" onClick={() => void reload()} className="btn-secondary min-h-[44px] px-6">Try again</button>}
        <Link href={`/app/pack/${eventId}`} className="btn-primary inline-flex min-h-[52px] items-center px-8 py-3">See the Pack Day</Link>
      </div>
    );
  }

  const pinned = control.pinned && !blocked.has(control.pinned.fromUserId) ? control.pinned : null;
  const readOnlyReason = event.status === 'cancelled' ? 'This Pack Day was cancelled, so the chat is read-only.'
    : 'This chat closed 48 hours after the Pack Day. You can still read it and see the photos.';
  const candidates = whoPlayedCandidates(event.attendeeUids, uid, blocked)
    .map((id) => byUid.get(id))
    .filter((a): a is Attendee => Boolean(a));
  const classDogs = classPhotoUids(checkinUids, event.attendeeUids)
    .filter((id) => !blocked.has(id) || id === uid)
    .map((id) => byUid.get(id))
    .filter((a): a is Attendee => Boolean(a));
  const myDog = profile?.name?.trim() || 'your dog';
  const quickText = (kind: string) => CHAT_QUICK_MESSAGES[kind as 'here' | 'late'];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-4 h-14 flex items-center gap-2">
        <Link
          href={`/app/pack/${eventId}`}
          aria-label="Back to the Pack Day"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 border-brown bg-cream text-xl font-black text-brown shadow-[0_3px_0_rgba(42,31,74,0.28)]"
        >
          <span aria-hidden="true">←</span>
        </Link>
        <h1 className="font-display text-[24px] leading-none text-brown truncate">{event.title}</h1>
      </header>

      <div className="w-full lg:max-w-2xl lg:mx-auto px-4 flex-1 flex flex-col gap-3 pb-4">
        <div role="tablist" className="flex gap-2">
          {(['chat', 'album'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={activeTab === t}
              onClick={() => setTab(t)}
              className={`flex-1 min-h-[44px] rounded-full border-2 border-brown text-[14px] font-black text-brown ${activeTab === t ? 'bg-note' : 'bg-cream'}`}
            >
              {t === 'chat' ? 'Chat' : `Album${photos.length ? ` · ${photos.length}` : ''}`}
            </button>
          ))}
        </div>

        {pinned && (
          <div className="flex items-center gap-2 rounded-xl border-2 border-brown bg-note px-3 py-2.5">
            <span aria-hidden="true">📌</span>
            <p className="flex-1 text-[14px] font-black text-brown break-words">
              {pinned.kind === 'here' || pinned.kind === 'late' ? `${nameOf(pinned.fromUserId)}: ${quickText(pinned.kind)}` : pinned.text}
            </p>
            {isHost && <button type="button" onClick={() => void handleHost('unpin', {})} className="min-h-[44px] px-2 text-[14px] font-black text-brown underline">Unpin</button>}
          </div>
        )}

        {error && <p role="alert" className={NOTICE}>{error}</p>}

        {activeTab === 'chat' ? (
          <>
            <div className="flex-1 flex flex-col gap-2 py-2" aria-live="polite">
              {visible.length === 0 && <p className="text-center text-[15px] font-extrabold text-brown-mid">No messages yet. Say hi to the pack 🐾</p>}
              {visible.map((m) => {
                const mine = m.fromUserId === uid;
                if (m.kind === 'headsup') {
                  return (
                    <div key={m.id} className={NOTICE}>
                      <span aria-hidden="true">☔ </span>{m.text}
                      <span className="block text-[12px] font-extrabold text-brown-mid">{m.fromUserId === 'system' ? 'Morning of' : `Host · ${time(m.createdAt)}`}</span>
                    </div>
                  );
                }
                const menu = (
                  <button type="button" onClick={() => setActionFor(m)} aria-label="Message options" className="min-h-[44px] min-w-[44px] text-brown-mid font-black">⋯</button>
                );
                if (m.kind === 'here' || m.kind === 'late') {
                  return (
                    <div key={m.id} className="self-center flex items-center gap-1">
                      <span className="rounded-full border-2 border-brown bg-note px-3.5 py-1.5 text-[14px] font-black text-brown">
                        {mine ? 'You' : nameOf(m.fromUserId)}: {quickText(m.kind)} <span className="text-[12px] text-brown-mid">{time(m.createdAt)}</span>
                      </span>
                      {menu}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={`flex items-center gap-1 ${mine ? 'self-end flex-row-reverse' : 'self-start'}`}>
                    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      {!mine && <span className="px-1 text-[12px] font-black text-brown-mid">{nameOf(m.fromUserId)}</span>}
                      {m.kind === 'photo' && m.photoUrl && !m.moderated ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photoUrl} alt={`Photo from ${mine ? 'you' : nameOf(m.fromUserId)}`} className="h-52 w-52 rounded-2xl border-2 border-brown object-cover" />
                      ) : (
                        <ChatBubble text={m.moderated ? 'Message removed' : m.text} fromMe={mine} time={time(m.createdAt)} />
                      )}
                    </div>
                    {menu}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {canPostText(phase) && !muted ? (
              <div className="sticky bottom-0 space-y-2 border-t-2 border-brown bg-cream -mx-4 px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={CHIP} disabled={sending} onClick={() => void run(() => sendPackDayQuick(eventId, uid, 'here'), 'Try again.')}>{CHAT_QUICK_MESSAGES.here}</button>
                  <button type="button" className={CHIP} disabled={sending} onClick={() => void run(() => sendPackDayQuick(eventId, uid, 'late'), 'Try again.')}>{CHAT_QUICK_MESSAGES.late}</button>
                  {isHost && <button type="button" className={CHIP} disabled={sending} onClick={() => void run(() => sendPackDayRainCheck(eventId, uid), 'Try again.')}>Rain? ☔</button>}
                  {canPostPhoto(phase) && <button type="button" className={CHIP} disabled={sending} onClick={() => fileRef.current?.click()}><Icon name="camera" /> Add photo</button>}
                </div>
                <form onSubmit={handleSend} className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={CHAT_MAX_TEXT}
                    rows={1}
                    placeholder="Message the pack…"
                    aria-label="Message the pack"
                    className="flex-1 min-h-[46px] max-h-32 rounded-3xl border-2 border-brown bg-white px-4 py-2.5 text-base font-extrabold text-brown focus:outline-none focus:ring-2 focus:ring-brown"
                  />
                  <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="h-[46px] w-[46px] rounded-full border-2 border-brown bg-note text-xl font-black text-brown disabled:opacity-40">↑</button>
                </form>
              </div>
            ) : (
              <p className={`${NOTICE} text-center`}>{muted ? 'The host has muted you in this chat.' : readOnlyReason}</p>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {canPostPhoto(phase) ? (
              <button type="button" className="btn-secondary min-h-[44px] w-full" disabled={sending || muted} onClick={() => fileRef.current?.click()}>
                {sending ? 'Uploading…' : 'Add a photo'}
              </button>
            ) : (
              <p className={NOTICE}>{phase === 'before' ? 'Photos open when the Pack Day starts.' : readOnlyReason}</p>
            )}
            {photos.length === 0 ? (
              <p className="text-center text-[15px] font-extrabold text-brown-mid">No photos yet.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-1.5">
                {photos.map((p) => (
                  <li key={p.id} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.photoUrl as string} alt={`Photo from ${nameOf(p.fromUserId)}`} className="h-full w-full rounded-lg border-2 border-brown object-cover" />
                    <button type="button" onClick={() => setActionFor(p)} aria-label="Photo options" className="absolute right-0.5 top-0.5 h-8 w-8 rounded-full bg-cream/90 font-black text-brown">⋯</button>
                  </li>
                ))}
              </ul>
            )}

            {afterEvent && event.status !== 'cancelled' && (
              <>
                <section className="card px-5 py-4 space-y-3" aria-label="Class photo">
                  <h2 className="font-display text-[22px] leading-none text-brown">Class photo</h2>
                  <p className="text-[13px] font-extrabold text-brown-mid">{event.title} · {formatPackDayWhen(event)}</p>
                  <ul className="grid grid-cols-4 gap-2">
                    {classDogs.map((d) => (
                      <li key={d.uid} className="text-center">
                        {d.photo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={d.photo} alt="" className="aspect-square w-full rounded-full border-2 border-brown object-cover" />
                          : <div className="aspect-square w-full rounded-full border-2 border-brown bg-note" />}
                        <span className="block truncate text-[12px] font-black text-brown">{d.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {candidates.length > 0 && (
                  <section className="space-y-2" aria-labelledby="pd-played">
                    <h2 id="pd-played" className="font-display text-[22px] leading-none text-brown">Who did {myDog} play with?</h2>
                    {candidates.map((other) => {
                      const state = played[other.uid];
                      return (
                        <div key={other.uid} className="card flex items-center gap-3 px-3 py-2.5">
                          {other.photo
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={other.photo} alt="" className="h-12 w-12 rounded-full border-2 border-brown object-cover" />
                            : <div className="h-12 w-12 rounded-full border-2 border-brown bg-note" />}
                          <span className="flex-1 truncate text-[16px] font-black text-brown">{other.name}</span>
                          {state === 'match' ? (
                            <span className="text-[14px] font-black text-brown">It&apos;s a match 🎉</span>
                          ) : state === 'pack' ? (
                            <span className="text-[14px] font-black text-brown">In your Pack ✓</span>
                          ) : (
                            <button type="button" disabled={state === 'saving'} onClick={() => void handleAddToPack(other)} className="btn-secondary min-h-[44px] px-4 text-[14px] disabled:opacity-60">
                              Add to my Pack
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-center text-[13px] font-extrabold text-brown-mid">If they add your dog back, it becomes a match.</p>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => void handlePhoto(e.target.files?.[0])} />

      {/* Per-message options: report/block for anyone, host tools for the host. */}
      {actionFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setActionFor(null)}>
          <div role="dialog" aria-label="Message options" className="w-full max-w-md rounded-t-3xl border-2 border-brown bg-cream p-4 pb-8 space-y-1" onClick={(e) => e.stopPropagation()}>
            <p className="font-display text-[22px] text-brown">{actionFor.fromUserId === uid ? 'Your message' : nameOf(actionFor.fromUserId)}</p>
            {actionFor.fromUserId !== uid && (
              <button type="button" className="block min-h-[48px] w-full text-left text-[16px] font-black text-brown" onClick={() => { setReportFor(actionFor.fromUserId); setActionFor(null); }}>Report or block…</button>
            )}
            {isHost && actionFor.kind !== 'photo' && !actionFor.moderated && (
              <button type="button" className="block min-h-[48px] w-full text-left text-[16px] font-black text-brown" onClick={() => void handleHost('pin', { messageId: actionFor.id })}>Pin message</button>
            )}
            {isHost && actionFor.fromUserId !== uid && actionFor.fromUserId !== 'system' && (
              <>
                <button
                  type="button"
                  className="block min-h-[48px] w-full text-left text-[16px] font-black text-brown"
                  onClick={() => void handleHost(control.mutedUids.includes(actionFor.fromUserId) ? 'unmute' : 'mute', { targetUid: actionFor.fromUserId })}
                >
                  {control.mutedUids.includes(actionFor.fromUserId) ? 'Unmute' : 'Mute'} {nameOf(actionFor.fromUserId)}
                </button>
                <button
                  type="button"
                  className="block min-h-[48px] w-full text-left text-[16px] font-black text-brown underline"
                  onClick={() => {
                    if (window.confirm("Remove from this Pack Day? They lose their spot and the chat, and can't rejoin.")) void handleHost('remove', { targetUid: actionFor.fromUserId });
                    else setActionFor(null);
                  }}
                >
                  Remove {nameOf(actionFor.fromUserId)} from the Pack Day
                </button>
              </>
            )}
            <button type="button" className="block min-h-[48px] w-full text-left text-[16px] font-black text-brown-mid" onClick={() => setActionFor(null)}>Cancel</button>
          </div>
        </div>
      )}

      {reportFor && (
        <SafetySheet
          open
          onClose={() => setReportFor(null)}
          targetUserId={reportFor}
          targetName={nameOf(reportFor)}
          eventId={eventId}
          source="packday"
          onBlocked={() => getBlockedUserIds(uid).then(setBlocked).catch(() => undefined)}
        />
      )}
    </div>
  );
}
