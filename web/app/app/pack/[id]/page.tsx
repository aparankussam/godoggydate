// web/app/app/pack/[id]/page.tsx
// One Pack Day inside the app. The page itself is a server component for one
// reason: a signed-out visitor (from a shared link, or a "Join" tap on the public
// flyer) should still see WHAT they are being asked to sign in for. Firestore
// won't let them read packDays/, so the server loads the same allowlisted flyer
// facts the public /pack/[id] page shows (title, place, time, how many; never who)
// and hands them to the client component, which owns everything else.
import PackDayDetail from '../../../../components/PackDayDetail';
import { loadPublicPackDay } from '../../../../lib/packDayPublic';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function PackDayPage({ params }: PageProps) {
  const publicSummary = await loadPublicPackDay(params.id);
  return <PackDayDetail eventId={params.id} publicSummary={publicSummary} />;
}
