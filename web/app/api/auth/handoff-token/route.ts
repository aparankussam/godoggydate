import { NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/firebaseAdmin';

// Mints a short-lived Firebase custom token so the mobile app can hand off
// an already-authenticated session to the system browser (Safari), which
// has no access to the app's local auth storage. Without this, tapping an
// external checkout link from the app dumps the user on a cold sign-in
// screen instead of their intended destination.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Firebase ID token' }, { status: 401 });
  }
  const idToken = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const customToken = await getAdminAuth().createCustomToken(decoded.uid);
    return NextResponse.json({ customToken });
  } catch (error) {
    console.error('handoff-token failed', error);
    return NextResponse.json({ error: 'Invalid Firebase ID token' }, { status: 401 });
  }
}
