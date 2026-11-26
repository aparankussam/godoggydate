// shared/placeIcons.ts
// One icon per Sniff Spots category, by MaterialCommunityIcons name.

import type { PlaceCategory } from './places';

export const PLACE_ICONS = {
  vet: 'hospital-box',
  groomer: 'content-cut',
  daycare: 'home',
  trainer: 'school',
  park: 'tree',
} as const satisfies Record<PlaceCategory, string>;
