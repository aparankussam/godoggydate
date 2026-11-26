// shared/emergency.ts
// The "In an emergency" card, the same on web and app.

/** Searched in Maps from wherever the owner is, so it is always local and current. */
export const EMERGENCY_VET_QUERY = '24 hour emergency vet';

/** ASPCA Animal Poison Control Center, open 24/7 in the US. */
export const POISON_HOTLINE = {
  tel: '+18884264435',
  display: '(888) 426-4435',
  note: 'ASPCA Animal Poison Control, 24/7. A consultation fee may apply. If your dog is struggling to breathe or collapsing, go straight to an emergency vet.',
} as const;
