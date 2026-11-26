'use client';
// web/components/EmergencyCard.tsx
// "In an emergency", in Pupfile > Care under the lost-dog kit: the nearest
// emergency vet (a Maps search, so it is always current and local) and the
// ASPCA Animal Poison Control line. Mirrors mobile/components/EmergencyCard.tsx.

import { trackEvent } from '../lib/analytics';
import { EMERGENCY_VET_QUERY, POISON_HOTLINE } from '../../shared/emergency';
import { SafetyCard } from './SafetyCard';
import { Icon } from './icons';

const button = 'btn-secondary flex min-h-[44px] items-center justify-center px-4 text-center text-sm';

export default function EmergencyCard() {
  return (
    <SafetyCard banner={<><Icon name="hospital-box" size={16} /> In an emergency</>}>
      <a
        href={`https://www.google.com/maps/search/${encodeURIComponent(EMERGENCY_VET_QUERY)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('emergency_click', { target: 'vet' })}
        className={button}
      >
        <span><Icon name="hospital-box" /> Nearest emergency vet</span>
      </a>
      <a
        href={`tel:${POISON_HOTLINE.tel}`}
        onClick={() => trackEvent('emergency_click', { target: 'poison' })}
        className={button}
      >
        <span><Icon name="phone-alert" /> Poison hotline <span className="whitespace-nowrap">{POISON_HOTLINE.display}</span></span>
      </a>
      <p className="text-[12px] font-semibold leading-snug text-brown-mid">{POISON_HOTLINE.note}</p>
    </SafetyCard>
  );
}
