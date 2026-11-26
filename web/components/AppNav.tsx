'use client';
// web/components/AppNav.tsx
// The 4-destination app navigation, in two forms driven purely by CSS
// breakpoints (no JS viewport detection — that would flash the wrong nav on
// first paint and risk a hydration mismatch).
//
//   < lg  → the bottom tab bar, unchanged from the native app. Mobile web and
//           the iOS build should be indistinguishable here.
//   ≥ lg  → a left sidebar rail. The bottom bar was capped at max-w-md, so on
//           a desktop viewport it floated as a phone-sized strip in the middle
//           of an empty page — the single biggest reason the signed-in app
//           read as a web form rather than a product.
//
// Same filled icons, labels, badges, palette, and active treatment in both
// forms: selected = ink pill with a paper icon. Only the layout adapts.
//
// Only rendered when the user is authenticated AND either their profile is
// complete or they've been invited onto someone else's dog (gated by
// AppLayoutShell, which also decides householdOnly).

import Link from 'next/link';
import BrandLogo from './BrandLogo';
import { usePathname } from 'next/navigation';

interface Props {
  /** New matches not opened yet plus chats with an unread message: one number,
   *  like the iPhone Matches tab. */
  unreadMatches?: number;
  /** The signed-in user has no dog of their own — they were invited onto
   *  someone else's via Household. Discover/Pack Day/Matches/Playroom all
   *  require a dog to swipe with, so showing them would be tabs that are
   *  guaranteed dead ends. */
  householdOnly?: boolean;
  /** Hide the phone tab bar (an open chat thread uses the full screen). The
   *  desktop sidebar is unaffected. */
  hideBottomBar?: boolean;
}

type TabIcon = 'paw' | 'tree' | 'heart' | 'ball' | 'dog';

const TABS = [
  { href: '/app',           label: 'Discover',  icon: 'paw'   as TabIcon },
  { href: '/app/pack',      label: 'Pack Days', icon: 'tree'  as TabIcon },
  { href: '/app/matches',  label: 'Matches',   icon: 'heart' as TabIcon, badge: 'unreadMatches'  as const },
  { href: '/app/fun',       label: 'Playroom',  icon: 'ball'  as TabIcon },
  { href: '/app/profile',   label: 'Pupfile',   icon: 'dog'   as TabIcon },
] as const;

/** The only destination that works without a dog of your own. */
const HOUSEHOLD_TABS = TABS.filter((tab) => tab.href === '/app/profile');

/** Filled chunky icons from the design kit. They take the surrounding text
 *  colour (ink normally, paper on the selected ink pill); the small "holes"
 *  on the speech bubble and dog face use the `hole` colour. */
function TabGlyph({ icon, size = 24, hole }: { icon: TabIcon; size?: number; hole: string }) {
  const common = { 'aria-hidden': true as const, width: size, height: size, viewBox: '0 0 24 24', className: 'block flex-none' };
  switch (icon) {
    case 'paw':
      return (
        <svg {...common} fill="currentColor">
          <ellipse cx="5.2" cy="10.4" rx="2.1" ry="2.8" transform="rotate(-20 5.2 10.4)" />
          <ellipse cx="9.3" cy="5.9" rx="2.2" ry="3" transform="rotate(-8 9.3 5.9)" />
          <ellipse cx="14.7" cy="5.9" rx="2.2" ry="3" transform="rotate(8 14.7 5.9)" />
          <ellipse cx="18.8" cy="10.4" rx="2.1" ry="2.8" transform="rotate(20 18.8 10.4)" />
          <path d="M12 11.2c-3.3 0-6.1 2.9-6.1 5.9 0 2 1.5 3.1 3.3 3.1 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.8 0 3.3-1.1 3.3-3.1 0-3-2.8-5.9-6.1-5.9z" />
        </svg>
      );
    case 'tree':
      return (
        <svg {...common} fill="currentColor">
          <circle cx="12" cy="5.8" r="4.3" /><circle cx="7.2" cy="7.8" r="4" /><circle cx="16.8" cy="7.8" r="4" />
          <circle cx="5.8" cy="12" r="3.9" /><circle cx="18.2" cy="12" r="3.9" /><circle cx="12" cy="11" r="5.5" />
          <path d="M10.3 14h3.4v5.3l2.6 3.2H7.7l2.6-3.2z" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 21s-8.5-5.2-8.5-11.5A4.8 4.8 0 0 1 12 6.5a4.8 4.8 0 0 1 8.5 3C20.5 15.8 12 21 12 21z" />
        </svg>
      );
    case 'ball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" fill="currentColor" />
          <path d="M3.5 9.2c5.2 1.2 11.8 1.2 17 0M3.5 14.8c5.2-1.2 11.8-1.2 17 0" stroke={hole} strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'dog':
      return (
        <svg {...common}>
          <ellipse cx="4.9" cy="10.5" rx="3.1" ry="5.6" transform="rotate(16 4.9 10.5)" fill="currentColor" />
          <ellipse cx="19.1" cy="10.5" rx="3.1" ry="5.6" transform="rotate(-16 19.1 10.5)" fill="currentColor" />
          <ellipse cx="12" cy="12.5" rx="7.3" ry="8" fill="currentColor" />
          <circle cx="9.2" cy="10.8" r="1.25" fill={hole} /><circle cx="14.8" cy="10.8" r="1.25" fill={hole} />
          <ellipse cx="12" cy="15.8" rx="3.6" ry="2.9" fill={hole} />
          <ellipse cx="12" cy="14.9" rx="1.6" ry="1.15" fill="currentColor" />
        </svg>
      );
  }
}

/** Shared by both nav forms so a count never renders differently between them.
 *  Ink with a paper ring: readable on paper and on the selected ink pill. */
function Badge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`bg-brown text-cream ring-2 ring-cream text-[12px] font-black rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1 leading-none ${className}`}
    >
      <span className="sr-only">{count} unread</span>
      <span aria-hidden="true">{count > 9 ? '9+' : count}</span>
    </span>
  );
}

export default function AppNav({ unreadMatches = 0, householdOnly = false, hideBottomBar = false }: Props) {
  const pathname = usePathname();
  const badges = { unreadMatches };
  const tabs: readonly (typeof TABS)[number][] = householdOnly ? HOUSEHOLD_TABS : TABS;

  function isActive(href: string) {
    // Exact match for root /app, prefix match for sub-routes. A chat
    // (/app/messages/<id>) belongs to the Matches tab, as on the iPhone.
    if (href === '/app') return pathname === '/app';
    if (href === '/app/matches') return pathname.startsWith('/app/matches') || pathname.startsWith('/app/messages');
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop: left sidebar rail ───────────────────────────────────── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r-[2.5px] border-brown bg-cream px-4 py-6">
        <Link href="/app" className="flex min-h-[44px] items-center px-3 pb-6">
          <BrandLogo height={44} />
        </Link>

        <nav aria-label="Main" className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const count = 'badge' in tab ? badges[tab.badge] : 0;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[44px] items-center gap-3 rounded-full px-4 py-2 transition-colors ${
                  active ? 'bg-brown text-cream' : 'text-brown hover:bg-cream-dark'
                }`}
              >
                <TabGlyph icon={tab.icon} hole={active ? '#2A1F4A' : '#FFF9EC'} />
                <span className={`flex-1 text-[15px] ${active ? 'font-black' : 'font-extrabold'}`}>
                  {tab.label}
                </span>
                <Badge count={count} />
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile: bottom tab bar ───────────────────────────────────────── */}
      <nav
        aria-label="Main"
        className={`lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-cream border-t-[2.5px] border-brown rounded-t-[20px] px-1.5 pt-px ${hideBottomBar ? 'hidden' : 'flex'} z-40 pb-[max(0.25rem,env(safe-area-inset-bottom))]`}
      >
        {tabs.map((tab) => {
          const count = 'badge' in tab ? badges[tab.badge] : 0;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-px text-[12px] leading-[1.2] text-brown ${
                active ? 'font-black' : 'font-extrabold'
              }`}
            >
              <span
                className={`relative flex h-[26px] w-[46px] items-center justify-center rounded-full ${
                  active ? 'bg-brown text-cream' : 'text-brown'
                }`}
              >
                <TabGlyph icon={tab.icon} size={active ? 20 : 24} hole={active ? '#2A1F4A' : '#FFF9EC'} />
                <Badge count={count} className="absolute -top-2 -right-1" />
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
