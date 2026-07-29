'use client';
// web/app/app/household/join/page.tsx
// Landing page for a Household invite link/code. Reads ?code= from the
// share link, requires sign-in (any account works — the invitee needs no
// dog of their own), then calls acceptHouseholdInvite.

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged } from '../../../../lib/auth';
import type { User } from '../../../../lib/auth';
import AuthModal from '../../../../components/AuthModal';
import { acceptHouseholdInvite } from '../../../../lib/household';

export default function HouseholdJoinPage() {
  // useSearchParams() opts the page out of static rendering unless wrapped
  // in Suspense — without this, `next build` fails prerendering this route
  // entirely (caught building this feature, not a pre-existing issue).
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream flex items-center justify-center"><span className="text-4xl animate-spin">🐾</span></div>}>
      <HouseholdJoinContent />
    </Suspense>
  );
}

function HouseholdJoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [code, setCode] = useState(searchParams.get('code')?.toUpperCase() ?? '');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
  }, []);

  async function handleJoin() {
    if (!code.trim()) {
      setError('Enter the invite code');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      await acceptHouseholdInvite(code.trim());
      setSuccess(true);
      setTimeout(() => router.push('/app/profile'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join — check the code and try again');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-5 py-10 gap-6">
      <span className="text-5xl">🐾</span>
      <div className="text-center max-w-xs">
        <p className="font-display text-2xl text-brown">Join a household</p>
        <p className="mt-2 text-sm text-brown-light">
          You&apos;ve been invited to help look after someone&apos;s dog — reminders, everything, no dog of your own required.
        </p>
      </div>

      {success ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-green-800">You&apos;re in! 🐾</p>
        </div>
      ) : authLoading ? (
        <span className="text-3xl animate-spin">🐾</span>
      ) : !authUser ? (
        <>
          <button onClick={() => setShowAuthModal(true)} className="btn-primary px-8 py-3 shadow-lg">
            Sign in to join
          </button>
          <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        </>
      ) : (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            maxLength={6}
            className="rounded-xl border border-border bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.2em] text-brown"
          />
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={joining}
            className="btn-primary py-3 disabled:opacity-50"
          >
            {joining ? 'Joining…' : 'Join household'}
          </button>
        </div>
      )}
    </div>
  );
}
