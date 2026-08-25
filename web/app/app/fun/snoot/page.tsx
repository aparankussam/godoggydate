'use client';
// web/app/app/fun/snoot/page.tsx
// Snoot Boop (web) — a shameless one-tap toy. The dog's hero photo is a
// boop-able snoot: click it, it squishes, a WebAudio "boop" plays, your phone
// buzzes, a counter climbs, and milestone titles unlock. The only number shown
// is a literal count of YOUR OWN taps (see lib/boops.ts) — nothing about the
// dog is asserted, so it's honest candy. Count is local-first + debounced; the
// network is never in the tap loop. Web port of mobile/app/fun/snoot.tsx.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import { getHeroPhoto, resolveHeroIndex, getHeroFocus } from '../../../../lib/photos';
import { shareOrDownloadCard } from '../../../../lib/shareCard';
import { feedback } from '../../../../lib/feedback';
import { trackEvent } from '../../../../lib/analytics';
import {
  loadBoops,
  saveBoopsDebounced,
  flushBoops,
  localDateStr,
  milestoneAt,
  nextMilestone,
  crossedMilestone,
  computeEnergy,
  unlockedStickers,
  freshBoops,
  MAX_ENERGY,
  type BoopState,
} from '../../../../lib/boops';

const CONFETTI = ['🐾', '🐾', '🐾', '✨', '🦴', '🎉', '🐾', '💖'];

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}

export default function SnootPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);

  const [state, setState] = useState<BoopState>(() => freshBoops());
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0); // remount confetti to replay
  const [, setTick] = useState(0); // 1s heartbeat so the energy meter refills visibly

  const snootRef = useRef<HTMLButtonElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Escalating-pitch streak: rapid consecutive boops raise the boop's pitch.
  const lastBoopMs = useRef(0);
  const streak = useRef(0);

  const dogId = authUser?.uid ?? '';
  const dogName = profile?.name?.trim() || 'Your dog';
  const photo = getHeroPhoto(profile?.photos, resolveHeroIndex(profile ?? undefined));

  // ── Auth observer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Load profile once we know the user ──────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    getUserDogProfile(authUser.uid)
      .then((p) => { if (active) setProfile(p); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, [authUser]);

  // ── Load the boop count (local-first) once we have a dogId ──────────────────
  useEffect(() => {
    if (!dogId) return;
    setState(loadBoops(dogId));
    setReady(true);
    trackEvent('snoot_open', {});
    // Flush pending boops when the page is hidden/closed — catches the mobile
    // swipe-away case where an unmount cleanup may not run.
    const onHide = () => flushBoops();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushBoops(); });
    return () => {
      window.removeEventListener('pagehide', onHide);
      flushBoops();
    };
  }, [dogId]);

  // 1s heartbeat so the zoomies-energy meter visibly refills while you watch.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function boop() {
    if (!ready) return;
    const now = Date.now();
    const cur = stateRef.current;

    // Zoomies energy gate — out of energy is a playful breather, not an error.
    const curEnergy = computeEnergy(cur.energy, cur.energyAtMs, now);
    if (curEnergy <= 0) {
      vibrate([4, 40, 4]);
      streak.current = 0;
      return;
    }

    const before = cur.allTime;
    const after = before + 1;
    // Recompute the day each tap so a session left open across midnight rolls
    // the daily counter over instead of crediting today's boops to yesterday.
    const today = localDateStr(now);
    const sameDay = cur.todayDate === today;
    const next: BoopState = {
      allTime: after,
      todayCount: (sameDay ? cur.todayCount : 0) + 1,
      todayDate: today,
      energy: curEnergy - 1,
      energyAtMs: now,
    };
    setState(next);
    saveBoopsDebounced(dogId, next);

    // Squish + spring back — retrigger the CSS animation reliably.
    const el = snootRef.current;
    if (el) {
      el.style.animation = 'none';
      // Force reflow so the animation restarts even on rapid taps.
      void el.offsetWidth;
      el.style.animation = 'snoot-squish 260ms cubic-bezier(0.34, 1.56, 0.64, 1)';
    }

    // Rising "beat": rapid consecutive boops escalate the pitch; a pause resets.
    if (now - lastBoopMs.current < 600) streak.current = Math.min(streak.current + 1, 12);
    else streak.current = 0;
    lastBoopMs.current = now;

    const milestone = crossedMilestone(before, after);
    if (milestone) {
      feedback.success();
      vibrate([15, 30, 15, 30, 25]);
      setConfettiKey((k) => k + 1);
      trackEvent('snoot_milestone', { count: milestone.count, title: milestone.title });
    } else {
      // Pitch climbs with the streak for a satisfying rally.
      feedback.boop(400 + streak.current * 28);
      vibrate(10);
    }
  }

  async function shareBadge() {
    if (sharing || !badgeRef.current) return;
    setSharing(true);
    feedback.pop();
    trackEvent('snoot_share_click', { all_time: state.allTime });
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        badgeRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-boops.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `${dogName}'s snoot — ${state.allTime} boops`,
          shareText: `I've booped ${dogName}'s snoot ${state.allTime.toLocaleString()} times 🐽 Boop your own dog on GoDoggyDate.`,
        },
      );
      trackEvent('snoot_shared', { all_time: state.allTime, method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setSharing(false);
    }
  }

  // ── Auth gates (match other /app pages) ─────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <span className="text-4xl animate-spin">🐾</span>
      </div>
    );
  }
  if (!authUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 py-24 text-center">
        <span className="text-6xl">🐽</span>
        <p className="font-display text-2xl text-brown">Sign in to boop your dog&apos;s snoot</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  const title = milestoneAt(state.allTime);
  const next = nextMilestone(state.allTime);
  const energy = ready ? computeEnergy(state.energy, state.energyAtMs, Date.now()) : MAX_ENERGY;
  const energyPct = Math.round((energy / MAX_ENERGY) * 100);
  const outOfZoomies = energy <= 0;
  const stickerCount = unlockedStickers(state.allTime).length;
  const remaining = next ? next.count - state.allTime : 0;

  return (
    <div className="min-h-screen bg-cream">
      {/* Component-scoped keyframes — keeps this file self-contained. */}
      <style>{`
        @keyframes snoot-squish {
          0%   { transform: scale(1); }
          22%  { transform: scale(0.86); }
          100% { transform: scale(1); }
        }
        @keyframes snoot-confetti {
          0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translate(var(--tx), -170px) scale(1.25); opacity: 0; }
        }
        @keyframes snoot-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>

      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center justify-between">
        <Link href="/app/fun" className="text-sm font-bold text-primary hover:opacity-80">‹ Playroom</Link>
        <span className="font-display text-xl text-brown">🐽 Snoot Boop</span>
        <span className="w-16" />
      </header>

      <div className="p-4 lg:max-w-lg lg:mx-auto lg:px-8 lg:py-8 flex flex-col items-center gap-5">
        <p className="font-display text-2xl text-brown-mid mt-2">Boop the snoot 👆</p>

        {/* Stage: confetti overlay + the boop-able snoot */}
        <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
          {confettiKey > 0 && (
            <div key={confettiKey} className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              {CONFETTI.map((emoji, i) => {
                const tx = (i - CONFETTI.length / 2) * 30;
                return (
                  <span
                    key={i}
                    className="absolute text-3xl"
                    style={{
                      // custom prop feeds the keyframe's horizontal drift
                      ['--tx' as string]: `${tx}px`,
                      animation: `snoot-confetti 950ms ${i * 35}ms ease-out forwards`,
                    }}
                  >
                    {emoji}
                  </span>
                );
              })}
            </div>
          )}

          <button
            ref={snootRef}
            type="button"
            onClick={boop}
            disabled={!ready}
            aria-label={`Boop ${dogName}'s snoot. ${state.allTime} boops so far.`}
            className="relative rounded-full overflow-hidden bg-white border-4 border-white shadow-[0_10px_30px_rgba(45,26,14,0.18)] active:cursor-pointer select-none touch-manipulation disabled:opacity-60"
            style={{ width: 240, height: 240, WebkitTapHighlightColor: 'transparent' }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={dogName}
                draggable={false}
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: getHeroFocus(profile ?? undefined) }}
              />
            ) : (
              <span className="flex items-center justify-center w-full h-full text-[120px] leading-none">🐽</span>
            )}
          </button>
        </div>

        {/* Milestone title */}
        <div key={`title-${title?.count ?? 0}`} style={{ animation: title ? 'snoot-pop 500ms ease-out' : undefined }}>
          {title ? (
            <p className="font-display text-2xl text-primary-dark text-center">{title.emoji} {title.title}</p>
          ) : (
            <p className="text-sm text-brown-light text-center">Boop to earn your first title…</p>
          )}
        </div>

        {/* Counters */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="font-display text-4xl text-brown leading-none">{state.todayCount.toLocaleString()}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-light">today</p>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center">
            <p className="font-display text-4xl text-brown leading-none">{state.allTime.toLocaleString()}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brown-light">all time</p>
          </div>
        </div>

        {next && (
          <p className="text-[13px] text-brown-light text-center">
            {remaining.toLocaleString()} more boop{remaining === 1 ? '' : 's'} to {next.emoji} {next.title}
          </p>
        )}

        {/* Zoomies energy meter */}
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-brown-mid">⚡ Zoomies</span>
            <span className="text-xs text-brown-light">{energy}/{MAX_ENERGY}</span>
          </div>
          <div className="h-2 rounded-full bg-cream-dark overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${energyPct}%`, backgroundColor: outOfZoomies ? '#9B7560' : '#E8633A' }}
            />
          </div>
          {outOfZoomies && (
            <p className="mt-2 text-xs text-brown-mid text-center">🥱 {dogName} needs a breather — zoomies refill over time.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={shareBadge}
            disabled={sharing || state.allTime === 0}
            className="btn-primary px-6 py-3 disabled:opacity-60"
          >
            {sharing ? 'Rendering…' : '📤 Share count'}
          </button>
          {stickerCount > 0 && (
            <Link
              href="/app/fun/sticker-studio"
              onClick={() => feedback.tap()}
              className="rounded-full border border-primary px-5 py-3 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
            >
              🎨 Sticker Studio · {stickerCount}
            </Link>
          )}
        </div>

        <p className="text-[11px] text-brown-light text-center max-w-xs leading-relaxed">
          Every number here is a literal count of your own taps — nothing about {dogName} is claimed. Just candy. 🍬
        </p>
      </div>

      {/* Off-screen capturable badge (inline hex, no oklch/backdrop-blur, no
          crossOrigin on the img — shareCard's html2canvas re-fetches with
          useCORS during capture). */}
      <div style={{ position: 'absolute', left: -99999, top: 0 }} aria-hidden="true">
        <div
          ref={badgeRef}
          style={{
            width: 300,
            height: 380,
            borderRadius: 24,
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 36,
            paddingLeft: 20,
            paddingRight: 20,
            background: 'linear-gradient(160deg, #5C3D2E 0%, #B45309 60%, #E8633A 100%)',
            fontFamily: 'Georgia, serif',
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={dogName}
              style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover', border: '3px solid rgba(255,255,255,0.35)', objectPosition: getHeroFocus(profile ?? undefined) }}
            />
          ) : (
            <span style={{ fontSize: 96 }}>🐽</span>
          )}
          <div style={{ fontSize: 68, color: '#ffffff', marginTop: 12, lineHeight: 1 }}>{state.allTime.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>
            boops and counting
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', marginTop: 14, textAlign: 'center', fontWeight: 600 }}>
            {dogName}&apos;s snoot{title ? ` · ${title.title}` : ''}
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 18,
              left: 20,
              right: 20,
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.2)',
              paddingTop: 10,
            }}
          >
            <span style={{ fontSize: 13, color: '#ffffff' }}>GoDoggyDate</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>godoggydate.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}
