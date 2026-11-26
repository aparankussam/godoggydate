'use client';
// web/components/LostSightingForm.tsx
// "I found this dog / I saw this dog" for people WITHOUT the app. The owner gets
// a message, and optionally a photo and where the finder is. Nothing here asks
// for, or shows, the owner's phone or address. Posts to /api/lost/sighting.

import { useRef, useState } from 'react';

type Pin = { lat: number; lng: number } | null;

export default function LostSightingForm({ alertId, dogName }: { alertId: string; dogName: string }) {
  const startedAt = useRef(Date.now());
  const [pin, setPin] = useState<Pin>(null);
  const [pinState, setPinState] = useState<'idle' | 'asking' | 'denied'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function sharePin() {
    if (!navigator.geolocation) { setPinState('denied'); return; }
    setPinState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPin({ lat: p.coords.latitude, lng: p.coords.longitude }); setPinState('idle'); },
      () => setPinState('denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    form.set('alertId', alertId);
    form.set('t', String(startedAt.current));
    if (pin) { form.set('lat', String(pin.lat)); form.set('lng', String(pin.lng)); }
    try {
      const res = await fetch('/api/lost/sighting', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setDone(true);
      else setError(typeof body.error === 'string' ? body.error : 'Something went wrong. Please try again.');
    } catch {
      setError('No connection. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-xl bg-cream-dark px-4 py-4 text-[16px] font-black text-brown">
        Thank you! {dogName}&apos;s family has your message. Please stay safe and keep a calm distance: a scared dog can run.
      </p>
    );
  }

  const field = 'w-full rounded-xl border-2 border-brown bg-white px-3 py-2.5 text-[16px] text-brown';
  return (
    <form onSubmit={submit} className="space-y-3.5" encType="multipart/form-data">
      <h2 className="font-display text-[26px] leading-tight text-brown">I found / saw this dog</h2>
      <p className="text-[15px] font-extrabold text-brown-mid">
        No account needed. Your message goes to {dogName}&apos;s family. We never show their phone number or address.
      </p>

      <label className="block text-[15px] font-black text-brown">
        What did you see? Where and when?
        <textarea name="message" required minLength={3} maxLength={500} rows={4} className={`${field} mt-1`} placeholder="Black lab near the corner of Main and 4th, about 10 minutes ago" />
      </label>

      <label className="block text-[15px] font-black text-brown">
        A photo (optional)
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={`${field} mt-1`} />
      </label>

      <div>
        <button type="button" onClick={sharePin} className="btn-secondary min-h-[48px] w-full text-[16px]">
          {pin ? 'Location added ✓ (tap to refresh)' : pinState === 'asking' ? 'Finding you…' : '📍 Add where I am now (optional)'}
        </button>
        <p className="mt-1.5 text-[13px] font-extrabold text-brown-mid">
          {pinState === 'denied'
            ? 'We could not get your location. You can describe the place in your message instead.'
            : 'Only the family sees the exact spot. Everyone else sees a general area.'}
        </p>
      </div>

      <details className="rounded-xl bg-cream-dark px-3 py-2.5">
        <summary className="cursor-pointer text-[15px] font-black text-brown">Want them to reach you? (optional)</summary>
        <div className="mt-2 space-y-2.5">
          <input name="finderName" maxLength={40} className={field} placeholder="Your first name" autoComplete="given-name" />
          <input name="contact" maxLength={80} className={field} placeholder="Phone or email (sent to the family only)" autoComplete="off" />
        </div>
      </details>

      {/* Honeypot: a person never sees or fills this. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {error && <p role="alert" className="text-[15px] font-black text-rose">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary min-h-[56px] w-full text-[22px] disabled:opacity-60">
        {busy ? 'Sending…' : `Tell ${dogName}'s family`}
      </button>
    </form>
  );
}
