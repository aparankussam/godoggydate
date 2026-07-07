'use client';
// Dismissible one-tap banner offering browser notifications. Rendered on
// the matches page — the moment a user has matches is when a missed
// message actually costs them (and us) something.

import { useEffect, useState } from 'react';
import { dismissPushBanner, enablePushNotifications, shouldOfferPush } from '../lib/push';
import { trackEvent } from '../lib/analytics';

export default function EnablePushBanner({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    shouldOfferPush().then((offer) => {
      if (!cancelled && offer) setVisible(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 rounded-[1.25rem] border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
      <span className="text-2xl shrink-0">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brown">Never miss a match</p>
        <p className="text-xs text-brown-light">
          Get notified when someone matches with your dog or sends a message.
        </p>
      </div>
      <button
        onClick={async () => {
          setBusy(true);
          trackEvent('push_enable_click');
          const enabled = await enablePushNotifications(userId);
          trackEvent(enabled ? 'push_enabled' : 'push_enable_failed');
          setBusy(false);
          setVisible(false);
        }}
        disabled={busy}
        className="shrink-0 rounded-full bg-primary text-white text-xs font-bold px-4 py-2 hover:scale-105 transition-transform disabled:opacity-50"
      >
        {busy ? '…' : 'Enable'}
      </button>
      <button
        onClick={() => { dismissPushBanner(); setVisible(false); }}
        className="shrink-0 text-brown-light text-lg leading-none px-1"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
