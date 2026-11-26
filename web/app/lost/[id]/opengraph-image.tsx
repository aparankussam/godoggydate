// web/app/lost/[id]/opengraph-image.tsx
// The link preview for a shared lost-dog alert (Facebook / Nextdoor / iMessage).
// Name, city and the dog's photo only: nothing about the owner.
import { ImageResponse } from 'next/og';
import { ogLogoImg } from '../../../lib/ogLogo';
import { loadPublicLostAlert } from '../../../lib/lostPublic';
import { fetchTrustedPhotoDataUri } from '../../../lib/trustedPhotoUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'A lost dog alert on GoDoggyDate';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage({ params }: { params: { id: string } }) {
  const result = await loadPublicLostAlert(params.id);
  const alert = result?.alert;
  const found = alert?.status === 'found';
  const photo = alert?.photoUrl ? await fetchTrustedPhotoDataUri(alert.photoUrl).catch(() => null) : null;
  const place = alert ? [alert.city, alert.state].filter(Boolean).join(', ') : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 70px',
          gap: 56,
          background: found ? 'linear-gradient(135deg, #14532D 0%, #16A34A 100%)' : 'linear-gradient(135deg, #7F1D1D 0%, #B8214F 60%, #FF5C8D 100%)',
          fontFamily: 'sans-serif',
          color: '#fff',
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} width={420} height={420} style={{ objectFit: 'cover', borderRadius: 28, border: '8px solid #fff' }} alt="" />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, letterSpacing: 4 }}>
            {found ? '🎉 FOUND' : '🚨 LOST DOG'}
          </div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 96, fontWeight: 700, lineHeight: 1.02 }}>
            {alert?.dogName ?? 'Help find a lost dog'}
          </div>
          {alert && place && (
            <div style={{ display: 'flex', marginTop: 20, fontSize: 40, color: 'rgba(255,255,255,0.92)' }}>
              {found ? 'is home' : `Missing near ${place}`}
            </div>
          )}
          {!found && (
            <div style={{ display: 'flex', marginTop: 28, fontSize: 32, color: 'rgba(255,255,255,0.88)' }}>
              Seen this dog? Tell the family. No account needed.
            </div>
          )}
          <div style={{ display: 'flex', marginTop: 44, paddingTop: 22, borderTop: '2px solid rgba(255,255,255,0.3)', fontSize: 28 }}>
            {ogLogoImg(52)}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
