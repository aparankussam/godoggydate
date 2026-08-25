'use client';
// web/app/app/fun/sticker-studio/page.tsx
// Sticker Studio (web) — the payoff for booping. Every milestone unlocks decals;
// here you drop them onto your dog's photo, drag them with pointer events
// (mouse + touch), and export/share the result. Pure local fun: the photo comes
// from the dog's own uploads (or a file you pick), drag is plain Pointer Events
// (no extra dep), and html2canvas flattens it. Honest by construction — the
// stickers are earned by the user's own tap count. Web port of
// mobile/app/fun/sticker-studio.tsx.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getFirebase } from '../../../../shared/utils/firebase';
import { onAuthStateChanged, getUserDogProfile } from '../../../../lib/auth';
import type { User, SavedDogProfile } from '../../../../lib/auth';
import { getHeroPhoto, getRenderablePhotos, resolveHeroIndex, getHeroFocus } from '../../../../lib/photos';
import { shareOrDownloadCard } from '../../../../lib/shareCard';
import { feedback } from '../../../../lib/feedback';
import { trackEvent } from '../../../../lib/analytics';
import { loadBoops, unlockedStickers, nextSticker, STICKERS, type Sticker } from '../../../../lib/boops';

const CANVAS = 320;
const STICKER = 56;

interface Placed { key: string; emoji: string; x: number; y: number; }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function StickerStudioPage() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<SavedDogProfile | null>(null);

  const [allTime, setAllTime] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [seq, setSeq] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [capturing, setCapturing] = useState(false); // hides handles during export

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  // Active drag: pointer id + starting pointer/position, keyed by sticker.
  const drag = useRef<{ key: string; pointerId: number; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const dogId = authUser?.uid ?? '';
  const dogName = profile?.name?.trim() || 'Your dog';
  const hero = getHeroPhoto(profile?.photos, resolveHeroIndex(profile ?? undefined));
  const gallery = getRenderablePhotos(profile?.photos);

  // ── Auth observer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ── Load profile + boop count ───────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    getUserDogProfile(authUser.uid)
      .then((p) => { if (active) setProfile(p); })
      .catch(() => { if (active) setProfile(null); });
    setAllTime(loadBoops(authUser.uid).allTime);
    trackEvent('sticker_studio_open', {});
    return () => { active = false; };
  }, [authUser]);

  // Default the canvas photo to the hero once the profile resolves (unless the
  // user already picked one).
  useEffect(() => {
    if (!photoUri && hero) setPhotoUri(hero);
  }, [hero, photoUri]);

  // Revoke any object URL we created on unmount.
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const stickers = unlockedStickers(allTime);
  const next = nextSticker(allTime);

  function addSticker(s: Sticker) {
    feedback.pop();
    const key = `${s.id}-${seq}`;
    setSeq((n) => n + 1);
    // Drop slightly off-center so stacking several stays visible.
    const jitter = (placed.length % 5) * 16 - 32;
    setPlaced((prev) => [
      ...prev,
      { key, emoji: s.emoji, x: clamp(CANVAS / 2 - STICKER / 2 + jitter, 0, CANVAS - STICKER), y: clamp(CANVAS / 2 - STICKER / 2 + jitter, 0, CANVAS - STICKER) },
    ]);
  }

  function removePlaced(key: string) {
    feedback.tap();
    setPlaced((prev) => prev.filter((p) => p.key !== key));
  }

  // ── Pointer-event drag ──────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent, p: Placed) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { key: p.key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const nx = clamp(d.origX + (e.clientX - d.startX), -STICKER / 2, CANVAS - STICKER / 2);
    const ny = clamp(d.origY + (e.clientY - d.startY), -STICKER / 2, CANVAS - STICKER / 2);
    setPlaced((prev) => prev.map((p) => (p.key === d.key ? { ...p, x: nx, y: ny } : p)));
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag.current && drag.current.pointerId === e.pointerId) drag.current = null;
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPhotoUri(url);
    feedback.tap();
    e.target.value = '';
  }

  async function handleShare() {
    if (sharing || !canvasRef.current) return;
    setSharing(true);
    setCapturing(true);
    feedback.pop();
    trackEvent('sticker_studio_share_click', { stickers: placed.length });
    try {
      // Let React drop the remove-handles + hint before html2canvas snapshots.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://godoggydate.com';
      const result = await shareOrDownloadCard(
        canvasRef.current,
        `${dogName.toLowerCase().replace(/\s+/g, '-')}-stickered.png`,
        {
          publicUrl: origin,
          dogName,
          shareTitle: `${dogName}, decorated`,
          shareText: `I decorated ${dogName} with stickers I earned by booping 🐾 Make your own on GoDoggyDate.`,
        },
      );
      trackEvent('sticker_studio_shared', { stickers: placed.length, method: result });
    } catch {
      /* non-critical — let them retry */
    } finally {
      setCapturing(false);
      setSharing(false);
    }
  }

  // ── Auth gates ──────────────────────────────────────────────────────────────
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
        <span className="text-6xl">🎨</span>
        <p className="font-display text-2xl text-brown">Sign in to decorate your dog</p>
        <Link href="/app" className="btn-primary px-8 py-3">Go to Discover</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center justify-between">
        <Link href="/app/fun" className="text-sm font-bold text-primary hover:opacity-80">‹ Playroom</Link>
        <span className="font-display text-xl text-brown">🎨 Sticker Studio</span>
        <span className="w-16" />
      </header>

      <div className="p-4 lg:max-w-lg lg:mx-auto lg:px-8 lg:py-8 flex flex-col items-center gap-4">
        {/* Canvas — this is what gets captured to PNG. */}
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative rounded-3xl overflow-hidden bg-cream-dark shadow-[0_6px_24px_rgba(45,26,14,0.14)] touch-none select-none"
          style={{ width: CANVAS, height: CANVAS }}
        >
          {photoUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUri}
              alt={dogName}
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: photoUri === hero ? getHeroFocus(profile ?? undefined) : 'center' }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[72px]">🐕</div>
          )}

          {placed.map((p) => (
            <div
              key={p.key}
              onPointerDown={(e) => onPointerDown(e, p)}
              className="absolute flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
              style={{ width: STICKER, height: STICKER, left: p.x, top: p.y }}
            >
              <span className="text-[46px] leading-none pointer-events-none" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))' }}>
                {p.emoji}
              </span>
              {!capturing && (
                <button
                  type="button"
                  aria-label="Remove sticker"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); removePlaced(p.key); }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white/95 border border-border text-brown text-[11px] leading-none flex items-center justify-center shadow"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Brand baked into the captured region so a repost keeps the back-link. */}
          <div className="absolute bottom-2 right-2.5 pointer-events-none">
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.9)', fontFamily: 'system-ui, sans-serif' }}>
              GoDoggyDate · godoggydate.com
            </span>
          </div>
        </div>

        {!capturing && (
          <p className="text-xs text-brown-light text-center">Tap a sticker to add it · drag to move · tap ✕ to remove</p>
        )}

        {/* Photo controls */}
        {gallery.length > 0 && (
          <div className="w-full">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-mid mb-1.5">Photo</p>
            <div className="flex flex-wrap gap-2 items-center">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setPhotoUri(src); feedback.tap(); }}
                  className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-colors ${photoUri === src ? 'border-primary' : 'border-border'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${dogName} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-12 h-12 rounded-xl border-2 border-dashed border-border text-brown-light text-xl flex items-center justify-center hover:border-primary/50"
                aria-label="Upload a photo"
              >
                +
              </button>
            </div>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />

        {/* Sticker tray or locked state */}
        {stickers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="text-4xl">🔒</span>
            <p className="text-sm text-brown-light leading-relaxed max-w-xs">
              Boop {dogName}&apos;s snoot to earn your first stickers — the first two unlock at 10 boops.
            </p>
            <Link href="/app/fun/snoot" onClick={() => feedback.tap()} className="btn-primary px-6 py-3">Go boop 🐽</Link>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brown-mid">
              Your stickers ({stickers.length})
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {STICKERS.map((s) => {
                const unlocked = allTime >= s.unlockAt;
                return unlocked ? (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addSticker(s)}
                    className="w-[62px] h-[70px] rounded-2xl bg-white border border-border flex flex-col items-center justify-center gap-0.5 hover:border-primary/40 transition-colors"
                  >
                    <span className="text-2xl">{s.emoji}</span>
                    <span className="text-[9px] text-brown-light">{s.label}</span>
                  </button>
                ) : (
                  <div
                    key={s.id}
                    className="w-[62px] h-[70px] rounded-2xl bg-cream-dark/60 border border-border flex flex-col items-center justify-center gap-0.5 opacity-70"
                    title={`Unlocks at ${s.unlockAt} boops`}
                  >
                    <span className="text-2xl grayscale">🔒</span>
                    <span className="text-[9px] font-bold text-brown-light">{s.unlockAt}</span>
                  </div>
                );
              })}
            </div>

            {next && (
              <p className="text-[12px] text-brown-light text-center">
                Next: {next.emoji} {next.label} at {next.unlockAt.toLocaleString()} boops
                {' · '}
                <Link href="/app/fun/snoot" className="text-primary font-bold hover:underline">keep booping</Link>
              </p>
            )}

            <div className="flex gap-2">
              {placed.length > 0 && (
                <button type="button" onClick={() => { setPlaced([]); feedback.tap(); }} className="btn-secondary flex-1 py-3 text-sm">
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleShare}
                disabled={sharing}
                className="btn-primary flex-1 py-3 disabled:opacity-60"
              >
                {sharing ? 'Rendering…' : '📤 Share your masterpiece'}
              </button>
            </div>
          </div>
        )}

        <p className="text-[11px] text-brown-light text-center max-w-xs leading-relaxed">
          Stickers are genuinely earned by your own boops — no shortcuts, no fabricated stats. 🐾
        </p>
      </div>
    </div>
  );
}
