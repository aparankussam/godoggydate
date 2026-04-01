'use client';
// web/components/BottomNav.tsx
// 4-tab app navigation. Only rendered when the user is authenticated
// AND their profile is complete (gated by AppLayoutShell).

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  unreadMessages?: number;
  unreadMatches?: number;
}

const TABS = [
  { href: '/app',           label: 'Discover',  emoji: '🐾' },
  { href: '/app/matches',   label: 'Matches',   emoji: '💛', badge: 'unreadMatches'  as const },
  { href: '/app/messages',  label: 'Messages',  emoji: '💬', badge: 'unreadMessages' as const },
  { href: '/app/profile',   label: 'Profile',   emoji: '🐕' },
] as const;

export default function BottomNav({ unreadMessages = 0, unreadMatches = 0 }: Props) {
  const pathname = usePathname();

  const badges = { unreadMessages, unreadMatches };

  function isActive(href: string) {
    // Exact match for root /app, prefix match for sub-routes
    return href === '/app' ? pathname === '/app' : pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/96 backdrop-blur-xl border-t border-border shadow-[0_-10px_30px_rgba(45,26,14,0.08)] flex z-40 pb-safe">
      {TABS.map((tab) => {
        const count = 'badge' in tab ? badges[tab.badge] : 0;
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 py-2.5 flex flex-col items-center gap-1 transition-colors relative ${
              active ? 'text-primary' : 'text-brown-light hover:text-brown'
            }`}
          >
            <span className={`relative text-2xl leading-none rounded-full px-3 py-1 transition-all ${
              active ? 'bg-primary/12 shadow-sm' : ''
            }`}>
              {tab.emoji}
              {count > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[1rem] h-4 flex items-center justify-center px-0.5 leading-none">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </span>
            <span className={`text-[10px] font-semibold ${active ? 'text-brown' : ''}`}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
