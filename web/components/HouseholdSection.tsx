'use client';
// web/components/HouseholdSection.tsx
// Household — invite a partner, roommate, sitter, or walker onto your dog's
// account. They need no dog of their own. The strategy research flagged
// this as the only viral/retention mechanic that works at four total
// users — it doesn't need another dog owner to exist, it doubles the
// active humans per dog, and it turns "I'll cancel this" into a
// conversation. Free, no payment gating.

import { useState } from 'react';
import { createHouseholdInvite, removeHouseholdMember } from '../lib/household';

interface Props {
  /** The signed-in user's own dog. The invite text used to hardcode "Kaju",
   *  so every user's invite named the founder's dog instead of theirs. */
  dogName: string;
  memberIds: string[];
  memberNames?: Record<string, string>;
}

export default function HouseholdSection({ dogName, memberIds, memberNames }: Props) {
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleInvite() {
    setInviting(true);
    setError(null);
    try {
      const result = await createHouseholdInvite();
      setInvite(result);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create an invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(
        `Join ${dogName || 'my dog'}'s household on GoDoggyDate — code ${invite.code}. ${window.location.origin}/app/household/join?code=${invite.code}`,
      );
      setCopied(true);
    } catch {
      // Clipboard permission denied — the code is still visible on screen.
    }
  }

  async function handleRemove(uid: string) {
    setBusyUid(uid);
    try {
      await removeHouseholdMember(uid);
    } catch {
      // Non-critical — they can retry.
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div className="card rounded-[1.8rem] overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-bold text-brown">Household</p>
        <p className="text-xs text-brown-light">Everyone who takes care of this dog — they don&apos;t need a dog of their own.</p>
      </div>

      {memberIds.length > 0 && (
        <div className="divide-y divide-border">
          {memberIds.map((uid) => (
            <div key={uid} className="px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-brown truncate">{memberNames?.[uid] ?? 'Household member'}</p>
              <button
                type="button"
                onClick={() => handleRemove(uid)}
                disabled={busyUid === uid}
                className="text-xs text-brown-light hover:text-red-600 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3">
        {invite ? (
          <div className="rounded-2xl bg-cream-dark/60 border border-border px-4 py-3 flex flex-col gap-2">
            <p className="text-xs text-brown-light">Share this code — it expires in 7 days:</p>
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-brown text-center py-1">{invite.code}</p>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-secondary py-2 text-xs"
            >
              {copied ? 'Copied!' : '📋 Copy invite link'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviting || memberIds.length >= 3}
            className="btn-secondary w-full py-2.5 text-sm disabled:opacity-50"
          >
            {inviting ? 'Creating…' : memberIds.length >= 3 ? 'Household is full (4 max)' : '+ Invite someone'}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}
