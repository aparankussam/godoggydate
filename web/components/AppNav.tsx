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
import { Icon } from './icons';

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

type TabIcon = 'paw' | 'tree' | 'heart' | 'puzzle' | 'dog';

const TABS = [
  { href: '/app',           label: 'Discover',  icon: 'paw'   as TabIcon },
  { href: '/app/pack',      label: 'Pack Days', icon: 'tree'  as TabIcon },
  { href: '/app/matches',  label: 'Matches',   icon: 'heart' as TabIcon, badge: 'unreadMatches'  as const },
  { href: '/app/fun',       label: 'Playroom',  icon: 'puzzle' as TabIcon },
  { href: '/app/profile',   label: 'Pupfile',   icon: 'dog'   as TabIcon },
] as const;

/** The only destination that works without a dog of your own. */
const HOUSEHOLD_TABS = TABS.filter((tab) => tab.href === '/app/profile');

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
                <Icon name={tab.icon} size={24} />
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
                <Icon name={tab.icon} size={active ? 22 : 25} />
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
