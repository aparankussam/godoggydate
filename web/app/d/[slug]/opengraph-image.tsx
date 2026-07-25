// web/app/d/[slug]/opengraph-image.tsx
// The single highest-leverage fix in the Phase 0 build for the share loop:
// there was no opengraph-image ANYWHERE in web/ before this, so every Dog
// Trading Card ever shared unfurled as a bare link with no preview in
// iMessage/WhatsApp/Discord/X. This is what makes a shared card actually
// look like something worth tapping.
import { ImageResponse } from 'next/og';
import { getAdminDb } from '../../../lib/firebaseAdmin';
import { parseDogSlugToUid } from '../../../lib/dogSlug';
import { getPrimaryRenderablePhoto } from '../../../lib/photos';
import type { SavedDogProfile } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = "A dog's GoDoggyDate profile";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage({ params }: { params: { slug: string } }) {
  const uid = parseDogSlugToUid(params.slug);
  const snap = uid ? await getAdminDb().doc(`dogs/${uid}`).get() : null;
  const profile = snap?.exists ? (snap.data() as SavedDogProfile) : null;
  const photo = profile ? getPrimaryRenderablePhoto(profile.photos) : null;

  const name = profile?.name ?? 'A GoDoggyDate dog';
  const subtitle = [profile?.breed, profile?.age, profile?.location].filter(Boolean).join(' · ');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: 'linear-gradient(135deg, #3D1F0A 0%, #B45309 55%, #E8633A 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name}
            width={520}
            height={630}
            style={{ objectFit: 'cover', width: 520, height: 630 }}
          />
        ) : (
          <div style={{ display: 'flex', width: 520, height: 630, alignItems: 'center', justifyContent: 'center', fontSize: 160 }}>
            🐕
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 60px',
            flex: 1,
          }}
        >
          {typeof profile?.foundingPackNumber === 'number' && (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 999,
                padding: '8px 20px',
                marginBottom: 24,
                color: '#F5B731',
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              Founding Pack #{profile.foundingPackNumber}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 700, color: '#fff', lineHeight: 1.05 }}>
            {name}
          </div>
          {subtitle && (
            <div style={{ display: 'flex', marginTop: 16, fontSize: 32, color: 'rgba(255,255,255,0.85)' }}>
              {subtitle}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 48,
              paddingTop: 24,
              borderTop: '2px solid rgba(255,255,255,0.2)',
              fontSize: 28,
              color: '#fff',
              fontWeight: 700,
            }}
          >
            🐾 GoDoggyDate
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
