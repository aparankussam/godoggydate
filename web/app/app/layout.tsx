// web/app/app/layout.tsx
// Nested layout for all /app/* routes.
// Injects AppNav (via AppLayoutShell) only when auth + complete.
// Logo/back taps inside /app/* routes use Link href="/app" — never "/".

import type { Metadata } from 'next';
import AppLayoutShell from '../../components/AppLayoutShell';

// Signed-in app screens: not for search, and distinct from the marketing title.
export const metadata: Metadata = {
  title: 'GoDoggyDate — your dog\'s app',
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
