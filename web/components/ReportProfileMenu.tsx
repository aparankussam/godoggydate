'use client';
// web/components/ReportProfileMenu.tsx
// Report / block for someone you haven't necessarily matched with, so a profile
// can be flagged from the swipe card, the dog page, chat and a Pack Day event.
// Writes the same report documents as the iPhone app (mobile/lib/reports.ts),
// with more reasons: reports/{reporterId}_{targetUserId}_{ms} is create-only and
// onReportCreated forwards it to the ops channel, where `reason` is free text.
//
// Blocking is never one tap. It always goes through a sheet that says what
// happens next, and it ends with an Undo toast (lib/undoToast.ts, which outlives
// this component: the card or chat that raised it is usually gone by then).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { blockUser, unblockUser } from '../lib/blocks';
import { trackEvent } from '../lib/analytics';
import { showUndoToast } from '../lib/undoToast';

// 'spam' and 'inappropriate' (and 'block') are what older builds and the iPhone
// app write; the rest are new. Ops reads `reason` as free text.
export type ReportReason =
  | 'unsafe_dog'
  | 'no_show'
  | 'felt_unsafe'
  | 'harassment'
  | 'inappropriate'
  | 'spam'
  | 'other';

export const REPORT_REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'unsafe_dog', label: 'Aggressive or unsafe dog' },
  { value: 'no_show', label: 'No-show / cancelled on me' },
  { value: 'felt_unsafe', label: 'Made me feel unsafe' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'spam', label: 'Spam or fake' },
  { value: 'other', label: 'Other' },
];

export const MAX_REPORT_NOTE_LENGTH = 500;

type Step = 'menu' | 'report' | 'block' | 'sent';

export interface SafetySheetProps {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  /** The dog's name, for the wording. Looked up from their profile when not given. */
  targetName?: string | null;
  matchId?: string;
  /** Set on a Pack Day event page, so the server snapshots that event as evidence. */
  eventId?: string;
  source: 'chat' | 'profile' | 'packday';
  /** Runs after a block went through, e.g. to leave the screen or drop the card. */
  onBlocked?: () => void;
}

const FOCUSABLE = 'button:not([disabled]), textarea, a[href], input:not([disabled])';

/** The report / block sheet. Controlled: render it and flip `open`. */
export function SafetySheet({
  open, onClose, targetUserId, targetName, matchId, eventId, source, onBlocked,
}: SafetySheetProps) {
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  const [blockBackTo, setBlockBackTo] = useState<'menu' | 'sent'>('menu');
  // A report was filed in this sheet already (so a block after it is a follow-up).
  const [reportFiled, setReportFiled] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Fresh sheet each time it opens.
  useEffect(() => {
    if (!open) return;
    setStep('menu');
    setBlockBackTo('menu');
    setReportFiled(false);
    setReason(null);
    setNote('');
    setError(null);
    setBusy(false);
    busyRef.current = false;
  }, [open]);

  // The name is only for wording; a missing profile just means generic wording.
  useEffect(() => {
    if (!open || targetName || fetchedName) return;
    let cancelled = false;
    getDoc(doc(getFirebase().db, 'dogs', targetUserId))
      .then((snap) => {
        const name = snap.exists() ? (snap.data() as { name?: unknown }).name : null;
        if (!cancelled && typeof name === 'string' && name.trim()) setFetchedName(name.trim());
      })
      .catch(() => { /* wording only */ });
    return () => { cancelled = true; };
  }, [open, targetName, fetchedName, targetUserId]);

  // Escape closes; Tab stays inside the sheet; the first control gets focus on
  // each step so a keyboard or screen-reader user lands inside it.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyRef.current) { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open, step]);

  if (!open || typeof document === 'undefined') return null;

  const uid = getFirebase().auth.currentUser?.uid;
  if (!uid || uid === targetUserId) return null;

  const name = (targetName ?? fetchedName ?? '').trim();
  const who = name || 'this person';
  const reasonLabel = REPORT_REASONS.find((r) => r.value === reason)?.label ?? '';

  async function writeReport(reasonValue: ReportReason | 'block', noteText?: string) {
    const { db } = getFirebase();
    const cleanNote = (noteText ?? '').trim().slice(0, MAX_REPORT_NOTE_LENGTH);
    await setDoc(doc(db, 'reports', `${uid}_${targetUserId}_${Date.now()}`), {
      reporterId: uid,
      targetUserId,
      ...(matchId ? { matchId } : {}),
      ...(eventId ? { eventId } : {}),
      reason: reasonValue,
      ...(cleanNote ? { note: cleanNote } : {}),
      source,
      createdAt: serverTimestamp(),
    });
  }

  async function sendReport() {
    if (!reason || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await writeReport(reason, reason === 'other' ? note : undefined);
      trackEvent('report_submitted', {
        reason,
        source,
        has_note: reason === 'other' && note.trim().length > 0,
        ...(matchId ? { match_id: matchId } : {}),
      });
      setReportFiled(true);
      setStep('sent');
    } catch (err) {
      console.error('Report failed', err);
      setError('That didn’t go through. Check your connection and try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function confirmBlock() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const afterReport = reportFiled;
    try {
      // Block first and on its own: the safety action must not depend on the
      // report write.
      await blockUser(uid!, targetUserId);
    } catch (err) {
      console.error('Block failed', err);
      setError('That didn’t go through. Check your connection and try again.');
      busyRef.current = false;
      setBusy(false);
      return;
    }
    trackEvent('block_user', {
      source,
      after_report: afterReport,
      ...(matchId ? { match_id: matchId } : {}),
    });
    // The apps have always filed a 'block' report next to a block, so ops (and the
    // thread evidence snapshot) see it. Best effort, and skipped when the person
    // has just filed a real report about the same thing.
    if (!afterReport) {
      writeReport('block').catch((err) => console.error('Block report failed', err));
    }
    busyRef.current = false;
    setBusy(false);
    onClose();
    onBlocked?.();
    const label = name || 'them';
    showUndoToast({
      message: `Blocked ${label}.`,
      onAction: () => unblockUser(uid!, targetUserId),
      doneMessage: `Unblocked ${label}.`,
    });
  }

  const titleId = 'safety-sheet-title';
  const btn = 'w-full min-h-[48px] rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors';

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => { e.stopPropagation(); if (!busy) onClose(); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:rounded-3xl sm:pb-6"
      >
        {step === 'menu' && (
          <>
            <h2 id={titleId} className="text-center font-display text-xl text-brown">
              {name ? `Report or block ${name}` : 'Report or block'}
            </h2>
            <p className="mt-1 mb-4 text-center text-xs leading-relaxed text-brown-light">
              Reports go to a person at GoDoggyDate, not to {name || 'the other member'}.
            </p>
            <div className="flex flex-col gap-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => { setReason(r.value); setStep('report'); setError(null); }}
                  className={`${btn} bg-cream text-brown hover:bg-cream-dark`}
                >
                  {r.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setBlockBackTo('menu'); setStep('block'); setError(null); }}
                className={`${btn} mt-1 bg-red-50 text-red-600 hover:bg-red-100`}
              >
                Just block {who} instead
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] w-full py-2 text-sm text-brown-light hover:text-brown"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'report' && (
          <>
            <h2 id={titleId} className="text-center font-display text-xl text-brown">
              Report: {reasonLabel}
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-brown-mid">
              <li>A person reviews reports.</li>
              {matchId && <li>Because you are reporting from a match, the recent messages are included so we can see what happened.</li>}
              <li>Reporting does not block {who}. Blocking takes effect immediately, and you can do it after you send this.</li>
            </ul>
            {reason === 'other' && (
              <label className="mt-4 block">
                <span className="text-xs font-semibold text-brown-mid">Anything we should know? (optional)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={MAX_REPORT_NOTE_LENGTH}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-border bg-cream px-3 py-2 text-sm text-brown outline-none focus:border-primary/40"
                />
                <span className="block text-right text-[10px] text-brown-light">{note.length}/{MAX_REPORT_NOTE_LENGTH}</span>
              </label>
            )}
            {error && <p role="alert" className="mt-3 text-center text-xs font-semibold text-red-600">{error}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={sendReport}
                disabled={busy}
                className="btn-primary min-h-[48px] w-full py-3 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send report'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('menu'); setError(null); }}
                disabled={busy}
                className="min-h-[44px] w-full py-2 text-sm text-brown-light hover:text-brown"
              >
                Back
              </button>
            </div>
          </>
        )}

        {step === 'block' && (
          <>
            <h2 id={titleId} className="text-center font-display text-xl text-brown">
              Block {who}?
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-brown-mid">
              <li>They won’t see you or be able to message you.</li>
              <li>You won’t see them anywhere on GoDoggyDate.</li>
              <li>They aren’t told that you blocked them.</li>
              <li>Changed your mind? Unblock any time in Profile, under Blocked members.</li>
            </ul>
            {error && <p role="alert" className="mt-3 text-center text-xs font-semibold text-red-600">{error}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmBlock}
                disabled={busy}
                className="min-h-[48px] w-full rounded-full bg-red-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Blocking…' : `Block ${who}`}
              </button>
              <button
                type="button"
                onClick={() => { setStep(blockBackTo); setError(null); }}
                disabled={busy}
                className="min-h-[44px] w-full py-2 text-sm text-brown-light hover:text-brown"
              >
                Not now
              </button>
            </div>
          </>
        )}

        {step === 'sent' && (
          <>
            <h2 id={titleId} className="text-center font-display text-xl text-brown">Report sent. Thank you.</h2>
            <p className="mt-2 text-center text-sm leading-relaxed text-brown-mid">
              A person reviews reports. If you want {who} to stop contacting you, blocking takes effect immediately.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setBlockBackTo('sent'); setStep('block'); setError(null); }}
                className={`${btn} bg-red-50 text-center text-red-600 hover:bg-red-100`}
              >
                Block {who}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary min-h-[48px] w-full py-3"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  targetUserId: string;
  matchId?: string;
  /** Set on a Pack Day event page, so the server snapshots that event as evidence. */
  eventId?: string;
  className?: string;
  onBlocked?: () => void;
  /** 'dots' is the 44px paper "..." button used on Discover; default is the text pill. */
  variant?: 'pill' | 'dots';
  /** The dog's name, for the sheet wording and the button's accessible name. */
  targetName?: string | null;
}

export default function ReportProfileMenu({ targetUserId, matchId, eventId, className, onBlocked, variant = 'pill', targetName }: Props) {
  const [open, setOpen] = useState(false);
  const uid = getFirebase().auth.currentUser?.uid;

  if (!uid || uid === targetUserId) return null;

  return (
    <div
      className={className}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={variant === 'dots' && targetName ? `Report or block ${targetName}` : 'Report or block'}
        aria-haspopup="dialog"
        className={
          variant === 'dots'
            ? 'flex h-11 w-11 items-center justify-center rounded-full border-2 border-brown bg-cream shadow-[inset_0_-3px_0_#E3D6BA] transition-all hover:brightness-95 active:translate-y-px'
            : 'rounded-full bg-white/80 px-3.5 py-2.5 text-[11px] font-bold tracking-[0.08em] uppercase text-brown shadow-[0_6px_18px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-colors hover:bg-white'
        }
      >
        {variant === 'dots' ? (
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="#2A1F4A">
            <circle cx="5" cy="12" r="2.1" /><circle cx="12" cy="12" r="2.1" /><circle cx="19" cy="12" r="2.1" />
          </svg>
        ) : 'Report'}
      </button>
      <SafetySheet
        open={open}
        onClose={() => setOpen(false)}
        targetUserId={targetUserId}
        targetName={targetName}
        matchId={matchId}
        eventId={eventId}
        source={eventId ? 'packday' : 'profile'}
        onBlocked={onBlocked}
      />
    </div>
  );
}
