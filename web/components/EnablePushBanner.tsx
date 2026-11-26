'use client';
// Dismissible one-tap banner offering browser notifications. Rendered on
// the matches page — the moment a user has matches is when a missed
// message actually costs them (and us) something.

import { useEffect, useState } from 'react';
import {
  dismissBlockedPushBanner,
  dismissPushBanner,
  enablePushNotifications,
  getPushBannerState,
  type PushBannerState,
} from '../lib/push';
import { trackEvent } from '../lib/analytics';
import { Icon } from './icons';

export default function EnablePushBanner({ userId }: { userId: string }) {
  const [state, setState] = useState<PushBannerState>('none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushBannerState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'none') return null;

  if (state === 'blocked') {
    return (
      <div className="mb-4 rounded-[1.25rem] border border-brown/60 bg-cream px-4 py-3 flex items-center gap-3">
        <Icon name="bell-off" size={24} className="text-brown" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-brown">Notifications are blocked</p>
          <p className="text-xs text-brown-mid">
            You&apos;ll miss match &amp; message alerts. Click the icon next to the address bar,
            switch Notifications to &quot;Ask&quot; or &quot;Allow,&quot; then reload the page.
          </p>
        </div>
        <button
          onClick={() => { dismissBlockedPushBanner(); setState('none'); }}
          className="shrink-0 text-brown-mid text-lg leading-none p-3 -m-2"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-[1.25rem] border-2 border-brown bg-note px-4 py-3 flex items-center gap-3">
      <Icon name="bell" size={24} className="text-brown" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brown">Never miss a match</p>
        <p className="text-xs text-brown-mid">
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
          setState(enabled ? 'none' : await getPushBannerState());
        }}
        disabled={busy}
        className="shrink-0 rounded-full bg-brown text-cream text-sm font-black px-4 py-3 hover:scale-105 transition-transform disabled:opacity-50"
      >
        {busy ? '…' : 'Enable'}
      </button>
      <button
        onClick={() => { dismissPushBanner(); setState('none'); }}
        className="shrink-0 text-brown-mid text-lg leading-none p-3 -m-2"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
