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
// Same emoji, labels, badges, palette, and active treatment in both forms:
// the design language is identical, only the layout adapts.
//
// Only rendered when the user is authenticated AND either their profile is
// complete or they've been invited onto someone else's dog (gated by
// AppLayoutShell, which also decides householdOnly).

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  unreadMessages?: number;
  unreadMatches?: number;
  /** The signed-in user has no dog of their own — they were invited onto
   *  someone else's via Household. Discover/Matches/Messages all require a
   *  dog to swipe with, so showing them would be four tabs of which three
   *  are guaranteed dead ends. */
  householdOnly?: boolean;
}

const TABS = [
  { href: '/app',           label: 'Discover',  emoji: '🐾' },
  { href: '/app/matches',   label: 'Matches',   emoji: '💛', badge: 'unreadMatches'  as const },
  { href: '/app/messages',  label: 'Messages',  emoji: '💬', badge: 'unreadMessages' as const },
  { href: '/app/profile',   label: 'Profile',   emoji: '🐕' },
] as const;

/** The only destination that works without a dog of your own. */
const HOUSEHOLD_TABS = TABS.filter((tab) => tab.href === '/app/profile');

/** Shared by both nav forms so a count never renders differently between them. */
function Badge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 flex items-center justify-center px-0.5 leading-none ${className}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

export default function AppNav({ unreadMessages = 0, unreadMatches = 0, householdOnly = false }: Props) {
  const pathname = usePathname();
  const badges = { unreadMessages, unreadMatches };
  const tabs: readonly (typeof TABS)[number][] = householdOnly ? HOUSEHOLD_TABS : TABS;

  function isActive(href: string) {
    // Exact match for root /app, prefix match for sub-routes
    return href === '/app' ? pathname === '/app' : pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop: left sidebar rail ───────────────────────────────────── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border bg-white/70 backdrop-blur-xl px-4 py-6">
        <Link href="/app" className="flex items-center gap-2 px-3 pb-6">
          <span className="text-2xl leading-none" aria-hidden="true">🐕</span>
          <span className="font-display text-xl text-brown">GoDoggyDate</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {tabs.map((tab) => {
            const count = 'badge' in tab ? badges[tab.badge] : 0;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                  active
                    ? 'bg-primary/12 text-brown'
                    : 'text-brown-light hover:bg-cream-dark/60 hover:text-brown'
                }`}
              >
                <span className="text-xl leading-none" aria-hidden="true">{tab.emoji}</span>
                <span className={`flex-1 text-sm ${active ? 'font-bold' : 'font-semibold'}`}>
                  {tab.label}
                </span>
                <Badge count={count} />
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Mobile: bottom tab bar (matches the native app) ──────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/96 backdrop-blur-xl border-t border-border shadow-[0_-10px_30px_rgba(45,26,14,0.08)] flex z-40 pb-safe">
        {tabs.map((tab) => {
          const count = 'badge' in tab ? badges[tab.badge] : 0;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 py-2.5 flex flex-col items-center gap-1 transition-colors relative ${
                active ? 'text-primary' : 'text-brown-light hover:text-brown'
              }`}
            >
              <span className={`relative text-2xl leading-none rounded-full px-3 py-1 transition-all ${
                active ? 'bg-primary/12 shadow-sm' : ''
              }`}>
                {tab.emoji}
                <Badge count={count} className="absolute -top-1 -right-2" />
              </span>
              <span className={`text-[10px] font-semibold ${active ? 'text-brown' : ''}`}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
