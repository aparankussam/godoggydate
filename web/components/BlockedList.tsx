'use client';
// web/components/BlockedList.tsx
// "Blocked members" in Profile: who you have blocked, by their dog's name, with an
// Unblock for each. Before this, blocking was one tap with no way back on web.
// Only YOUR list is shown. People who blocked you are never listed, here or
// anywhere (the blockedBy mirror exists so feeds can hide them, not to tell you).
// Unblocking deletes blocks/{you}/blocked/{them}; the onBlockWrite function then
// removes the mirror on their side.

import { useCallback, useEffect, useState } from 'react';
import { BLOCKS_CHANGED_EVENT, listBlockedMembers, unblockUser, type BlockedMember } from '../lib/blocks';
import { Icon } from './icons';

interface Props {
  userId: string;
}

export default function BlockedList({ userId }: Props) {
  const [members, setMembers] = useState<BlockedMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await listBlockedMembers(userId));
      setLoadFailed(false);
    } catch (error) {
      console.error('Could not load blocked members', error);
      setLoadFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
    // A block made elsewhere on the page's life (an Undo, another tab's action in
    // this tab) shows up without a reload.
    window.addEventListener(BLOCKS_CHANGED_EVENT, load);
    return () => window.removeEventListener(BLOCKS_CHANGED_EVENT, load);
  }, [load]);

  async function unblock(member: BlockedMember) {
    setBusyId(member.targetUserId);
    setFailedId(null);
    try {
      await unblockUser(userId, member.targetUserId);
      setMembers((current) => (current ?? []).filter((m) => m.targetUserId !== member.targetUserId));
      setConfirmId(null);
      setNotice(`Unblocked ${member.dogName ?? 'them'}.`);
    } catch (error) {
      console.error('Unblock failed', error);
      setFailedId(member.targetUserId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card rounded-[1.8rem] overflow-hidden" id="blocked-members">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-bold text-brown">Blocked members</p>
        <p className="mt-0.5 text-xs leading-relaxed text-brown-mid">
          People you block can’t see you or message you, and you won’t see them. They aren’t told.
        </p>
      </div>

      <div className="divide-y divide-border">
        {members === null && !loadFailed && (
          <p className="px-4 py-4 text-sm text-brown-mid" role="status">Loading…</p>
        )}

        {loadFailed && (
          <div className="px-4 py-4">
            <p role="alert" className="text-sm text-brown">Couldn’t load your blocked members.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-1 min-h-[40px] text-sm font-semibold text-brown underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {members !== null && members.length === 0 && (
          <p className="px-4 py-4 text-sm text-brown-mid">You haven’t blocked anyone.</p>
        )}

        {(members ?? []).map((m) => {
          const name = m.dogName ?? 'A former member';
          const confirming = confirmId === m.targetUserId;
          return (
            <div key={m.targetUserId} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[0.9rem] bg-note text-brown flex items-center justify-center">
                  {m.dogPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.dogPhoto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="dog" size={22} className="text-brown" />
                  )}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-brown">{name}</p>
                {!confirming && (
                  <button
                    type="button"
                    onClick={() => { setConfirmId(m.targetUserId); setFailedId(null); setNotice(null); }}
                    aria-label={`Unblock ${name}`}
                    className="shrink-0 min-h-[44px] rounded-full border-2 border-brown bg-cream px-4 text-xs font-bold text-brown hover:bg-cream-dark"
                  >
                    Unblock
                  </button>
                )}
              </div>
              {confirming && (
                <div className="mt-2 rounded-xl bg-cream px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-brown-mid">
                    {m.dogName ?? 'They'} will be able to see you and message you again.
                  </p>
                  {failedId === m.targetUserId && (
                    <p role="alert" className="mt-1 text-xs font-semibold text-brown">
                      That didn’t go through. Check your connection and try again.
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void unblock(m)}
                      disabled={busyId === m.targetUserId}
                      className="min-h-[44px] rounded-full bg-brown px-4 text-xs font-bold text-cream disabled:opacity-50"
                    >
                      {busyId === m.targetUserId ? 'Unblocking…' : `Unblock ${name}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="min-h-[44px] rounded-full px-3 text-xs font-semibold text-brown-mid"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {notice && <p role="status" className="border-t border-border px-4 py-3 text-xs font-semibold text-brown">{notice}</p>}
    </div>
  );
}
