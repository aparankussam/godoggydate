// web/app/app/layout.tsx
// Nested layout for all /app/* routes.
// Injects BottomNav (via AppLayoutShell) only when auth + complete.
// Logo/back taps inside /app/* routes use Link href="/app" — never "/".

import AppLayoutShell from '../../components/AppLayoutShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutShell>{children}</AppLayoutShell>;
}
