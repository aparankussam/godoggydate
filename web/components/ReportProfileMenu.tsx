'use client';
// web/components/ReportProfileMenu.tsx
// Report / block for someone you haven't necessarily matched with, so a profile
// can be flagged from the swipe card and the dog page, not only inside chat.

import { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebase } from '../shared/utils/firebase';
import { blockUser } from '../lib/blocks';
import { trackEvent } from '../lib/analytics';

type Reason = 'block' | 'spam' | 'inappropriate';

interface Props {
  targetUserId: string;
  matchId?: string;
  className?: string;
  onBlocked?: () => void;
}

export default function ReportProfileMenu({ targetUserId, matchId, className, onBlocked }: Props) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const uid = getFirebase().auth.currentUser?.uid;

  if (!uid || uid === targetUserId) return null;

  async function submit(reason: Reason) {
    const { db } = getFirebase();
    setOpen(false);
    try {
      // Block first and independently, as in chat: the safety action must not
      // depend on the report write.
      if (reason === 'block') await blockUser(uid!, targetUserId);
      await setDoc(doc(db, 'reports', `${uid}_${targetUserId}_${Date.now()}`), {
        reporterId: uid,
        targetUserId,
        ...(matchId ? { matchId } : {}),
        reason,
        source: 'profile',
        createdAt: serverTimestamp(),
      });
      trackEvent('report_submitted', { reason, source: 'profile' });
      setNotice(reason === 'block' ? 'Blocked.' : 'Report sent. Thank you.');
      if (reason === 'block') onBlocked?.();
    } catch (error) {
      console.error('Report failed', error);
      setNotice('That didn\u2019t go through. Please try again.');
    }
  }

  return (
    <div
      className={className}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setNotice(null); }}
        aria-label="Report or block"
        aria-expanded={open}
        className="rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-brown shadow-[0_6px_18px_rgba(0,0,0,0.12)] backdrop-blur-sm transition-colors hover:bg-white"
      >
        Report
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-white text-left shadow-lg">
          <button type="button" onClick={() => submit('inappropriate')} className="block w-full px-4 py-3 text-sm text-brown hover:bg-cream">Inappropriate</button>
          <button type="button" onClick={() => submit('spam')} className="block w-full px-4 py-3 text-sm text-brown hover:bg-cream">Spam or fake</button>
          <button type="button" onClick={() => submit('block')} className="block w-full px-4 py-3 text-sm font-semibold text-red-600 hover:bg-cream">Block</button>
        </div>
      )}
      {notice && <p role="status" className="absolute right-0 mt-2 w-44 rounded-xl bg-white px-3 py-2 text-xs text-brown shadow-lg">{notice}</p>}
    </div>
  );
}
